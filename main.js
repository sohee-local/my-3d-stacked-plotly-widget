(function () {
  const template = document.createElement('template');
  template.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            #chartContainer {
                width: 100%;
                height: 100%;
                min-height: 200px;
            }
        </style>
        <div id="chartContainer"></div>
    `;

  class ThreeDStackedColumnChart extends HTMLElement {
    constructor() {
      super();
      this._shadowRoot = this.attachShadow({ mode: 'open' });
      this._shadowRoot.appendChild(template.content.cloneNode(true));
      this._chartContainer = this._shadowRoot.getElementById('chartContainer');
      this._chart = null; 
    }

    connectedCallback() {
      if (typeof Plotly === 'undefined') {
        console.error("Plotly.js 라이브러리가 로드되지 않았습니다. 빌드 과정에서 포함되었는지 확인하십시오.");
        this._chartContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">차트 라이브러리 로드 실패. 관리자에게 문의하세요.</div>';
        return;
      }
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      if (typeof Plotly !== 'undefined') {
        this.renderChart();
      } else {
        console.warn("Plotly 라이브러리가 아직 로드되지 않아 차트 렌더링을 지연합니다.");
      }
    }

    async renderChart() {
      const properties = this.properties; 
      if (!properties) {
          console.warn("renderChart 호출 시 this.properties가 undefined입니다. SAC 속성 초기화 대기 중.");
          if (this._chartContainer) {
              this._chartContainer.innerHTML = '<div style="color: gray; text-align: center; padding: 20px;">속성 로드 중...</div>';
          }
          return;
      }

      const chartTitle = properties.title || "My 3D Stacked Chart";
      const customColors = properties.colorPalette ? 
                           properties.colorPalette.split(',').map(c => c.trim()) : 
                           ['#a84300', '#f5c6a5', '#007bff', '#28a745', '#dc3545', '#ffc107', '#6c757d', '#17a2b8', '#fd7e14', '#e83e8c'];
      
      const barWidthRatio = properties.barWidth || 0.8; 
      const barDepthValue = properties.barDepth || 0.5;

      const dataBinding = this.dataBindings.dataBinding;

      if (!dataBinding || !dataBinding.dimensions || !dataBinding.mainStructureMembers) {
        console.warn("차트에 필요한 데이터 피드(Dimensions 또는 Measures)가 준비되지 않았습니다.");
        this._chartContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">데이터 피드 오류: Dimensions 또는 Measures가 바인딩되지 않았습니다.</div>';
        return;
      }

      const dimensionsFeed = dataBinding.dimensions.find(feed => feed.id === "dimensions");
      const measuresFeed = dataBinding.mainStructureMembers.find(feed => feed.id === "measures");

      if (!dimensionsFeed || !measuresFeed || !measuresFeed.members || measuresFeed.members.length === 0) {
        console.error("필수 데이터 피드(dimensions 또는 measures)를 찾을 수 없거나 측정값이 없습니다.");
        this._chartContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">필수 데이터 부족.</div>';
        return;
      }

      const xAxisId = dimensionsFeed && dimensionsFeed.members && dimensionsFeed.members.length > 0 
                      ? dimensionsFeed.members[0].id
                      : null;

      const measureIdsToStack = measuresFeed && measuresFeed.members 
                                ? measuresFeed.members.map(m => m.id)
                                : [];

      if (!xAxisId || measureIdsToStack.length === 0) {
        console.error("SAC 빌더에서 차원(Dimensions) 또는 측정값(Measures)이 올바르게 바인딩되지 않았습니다.");
        this._chartContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">데이터 바인딩 오류: 필드를 확인하세요.</div>';
        return;
      }

      let resultSet;
      try {
        resultSet = await dataBinding.getResultSet();
      } catch (e) {
        console.error("SAC에서 데이터 가져오기 중 오류 발생:", e);
        this._chartContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">데이터 가져오기 오류 발생.</div></div>';
        return;
      }

      if (!resultSet || resultSet.length === 0) {
        console.warn("결과셋이 비어 있습니다. 표시할 데이터가 없습니다.");
        this._chartContainer.innerHTML = '<div style="color: orange; text-align: center; padding: 20px;">표시할 데이터가 없습니다.</div>';
        return;
      }

      const xValues = resultSet.map(row => row[xAxisId]);
      const traceData = [];
      
      measureIdsToStack.forEach((measureActualId, index) => {
        const yValues = resultSet.map(row => parseFloat(row[measureActualId]) || 0);
        traceData.push({
          x: xValues,
          y: yValues,
          name: measuresFeed.members.find(m => m.id === measureActualId)?.description || measureActualId,
          type: 'bar',
          marker: { color: customColors[index % customColors.length] }
        });
      });

      const allMeasureValues = resultSet.flatMap(row => measureIdsToStack.map(sId => parseFloat(row[sId]) || 0));
      const maxMeasureValue = Math.max(...allMeasureValues);
      
      const layout = {
        title: chartTitle,
        barmode: 'stack',
        showlegend: true,
        margin: { t: 50, l: 40, r: 40, b: 80 },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        xaxis: {
          tickangle: -45,
          type: 'category',
          title: dimensionsFeed.description || '날짜'
        },
        yaxis: {
          title: measuresFeed.description || '수량',
          rangemode: 'tozero'
        },
        bargap: 1 - barWidthRatio
      };

      Plotly.newPlot(chartId, traceData, layout);

      Plotly.newPlot(chartId, traceData, layout).then(function(gd) {
        gd.on('plotly_click', function(data) {
          if (data.points.length > 0) {
            const point = data.points[0];
            const selectedCategory = point.x;
            const selectedSeries = point.data.name;
            const selectedValue = point.y;

            widget.dispatchEvent(new CustomEvent('onBarClick', {
              detail: {
                category: selectedCategory,
                value: selectedValue,
                series: selectedSeries
              }
            }));
          }
        });
      });
    }

    disconnectedCallback() {
      if (this._chartContainer && Plotly && Plotly.purge) {
        Plotly.purge(this._chartContainer);
      }
    }

    setTitle(newTitle) {
      this.properties.title = newTitle;
      this.renderChart();
    }

    refreshChart() {
      this.renderChart();
    }

    getSelectedValue() {
      console.log("getSelectedValue 메서드가 호출되었습니다. 선택 로직을 여기에 구현하세요.");
      return "선택된 값 없음 (예시)";
    }
  }

  customElements.define('sohee-3dstackedchart', ThreeDStackedColumnChart);
})();
