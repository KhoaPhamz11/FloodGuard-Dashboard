// File: chart.js — Vẽ biểu đồ ECharts (Real-time Streaming Engine)
// Nâng cấp: Apache ECharts cho hiệu ứng luân chuyển dữ liệu mượt mà, bounding sliding window.

const STREAMING_CONFIG = {
    maxDataPoints: 60,
    updateInterval: 1000,
    animationDurationUpdate: 800 // Safety margin < 1000ms to finish animation before next tick
};

// Global States
let floodChart = null;
let currentChartStationId = 1;
let currentChartType = "realtime-rain";

// Sliding window state for Main Chart
let mainChartData = {
    labels: [],
    values: []
};

// Layer 6 states
let reportCharts = []; 
let currentReportStationId = null;
let reportChartsData = []; // Array of { labels: [], values: [] }

// Handle global resize
window.addEventListener('resize', () => {
    if (floodChart) floodChart.resize();
    reportCharts.forEach(chart => {
        if (chart) chart.resize();
    });
});

// Common ECharts aesthetic settings for Command Center
const getCommonEchartsOptions = () => ({
    animationDurationUpdate: STREAMING_CONFIG.animationDurationUpdate,
    animationEasingUpdate: 'linear', // Linear provides the smooth continuous sliding effect
    backgroundColor: 'transparent',
    grid: { top: 40, right: 30, bottom: 20, left: 40, containLabel: true },
    tooltip: { 
        trigger: 'axis', 
        backgroundColor: 'rgba(13, 17, 51, 0.9)',
        borderColor: '#00d4ff',
        textStyle: { color: '#fff' }
    },
    xAxis: {
        type: 'category',
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: '#8892b0', fontSize: 10 },
        splitLine: { show: false }
    },
    yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
        axisLabel: { color: '#8892b0', fontSize: 11 }
    }
});

// ===== HÀM 1: LẮNG NGHE SỰ KIỆN ĐỔI DROPDOWN =====
function initChartEvents() {
    const chartModeSelect = document.getElementById("chart-mode-select");
    if (chartModeSelect) {
        chartModeSelect.addEventListener("change", (event) => {
            const newChartType = event.target.value;
            updateChartForStation(currentChartStationId, newChartType);
        });
    }
}

// ===== HÀM 2: QUẢN LÝ LUỒNG VẼ =====
async function updateChartForStation(stationId, chartType) {
    currentChartStationId = stationId;
    currentChartType = chartType;
    if (chartType === "history-rain-6h" || chartType === "history-tide-6h") {
        await renderHistoryChart(stationId, chartType);
    } else {
        initRealtimeChart(chartType);
    }
}

// ===== HÀM 3: VẼ BIỂU ĐỒ LỊCH SỬ 6 TIẾNG =====
async function renderHistoryChart(stationId, chartType) {
    const historyData = await fetchHistoryData();
    if (!historyData || historyData.length === 0) return;

    mainChartData = { labels: [], values: [] }; // Reset array

    historyData.forEach(minuteData => {
        mainChartData.labels.push(minuteData.timestamp);
        const station = minuteData.stations_data.find(s => getStationNumericId(s) === stationId);
        if (station) {
            if (chartType === "history-rain-6h") {
                mainChartData.values.push(station.R);
            } else if (chartType === "history-tide-6h") {
                mainChartData.values.push(station.H_tide);
            }
        }
    });

    const ctx = document.getElementById("flood-chart-canvas");
    if (!ctx) return;
    
    if (floodChart) floodChart.dispose();
    floodChart = echarts.init(ctx, 'dark'); // Force dark theme config parsing

    const isRain = chartType === "history-rain-6h";
    const baseOpt = getCommonEchartsOptions();

    floodChart.setOption({
        ...baseOpt,
        xAxis: { ...baseOpt.xAxis, data: mainChartData.labels },
        series: [{
            name: isRain ? 'Lượng mưa' : 'Thủy triều',
            type: isRain ? 'bar' : 'line',
            data: mainChartData.values,
            itemStyle: { color: isRain ? '#00d4ff' : '#a4f4fd' },
            areaStyle: isRain ? null : {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
                    { offset: 1, color: 'rgba(0, 212, 255, 0)' }
                ])
            },
            lineStyle: { width: 2 },
            showSymbol: false
        }]
    }, true);
}

// ===== HÀM 4: KHỞI TẠO BIỂU ĐỒ REALTIME RỖNG =====
function initRealtimeChart(chartType) {
    const ctx = document.getElementById("flood-chart-canvas");
    if (!ctx) return;

    if (floodChart) {
        floodChart.dispose(); // Use dispose to prevent memory leaks when fully recreating
    }
    
    floodChart = echarts.init(ctx, 'dark'); // Initialize correctly with dark mode defaults
    mainChartData = { labels: [], values: [] }; // Clear sliding window

    let seriesConfig = {};
    const baseOpt = getCommonEchartsOptions();

    if (chartType === "realtime-rain") {
        seriesConfig = {
            name: 'Lượng mưa (mm)',
            type: 'bar',
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#00d4ff' },
                    { offset: 1, color: '#1a3a70' }
                ]),
                borderRadius: [4, 4, 0, 0]
            }
        };
    } else if (chartType === "realtime-drainage") {
        seriesConfig = {
            name: 'Thoát nước',
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color: '#28a745' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(40, 167, 69, 0.4)' },
                    { offset: 1, color: 'rgba(40, 167, 69, 0)' }
                ])
            }
        };
    } else if (chartType === "realtime-tide") {
        seriesConfig = {
            name: 'Thủy triều (m)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color: '#7b2ffc' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(123, 47, 252, 0.3)' },
                    { offset: 1, color: 'rgba(123, 47, 252, 0)' }
                ])
            },
            markLine: {
                silent: true,
                symbol: 'none',
                data: [ { yAxis: 1.5, lineStyle: { color: '#ff9800', type: 'dashed' }, label: { content: 'Cảnh báo' } } ]
            }
        };
    }

    floodChart.setOption({
        ...baseOpt,
        xAxis: { ...baseOpt.xAxis, data: [] },
        series: [ { ...seriesConfig, data: [] } ]
    }, true);
}

// ===== HÀM 5: BƠM DỮ LIỆU REALTIME =====
function updateRealtimeChart(latestData) {
    if (!floodChart || currentChartType.includes("history")) return;

    const station = latestData.stations_data.find(s => getStationNumericId(s) === currentChartStationId);
    if (!station) return;

    let newValue = 0;
    if (currentChartType === "realtime-rain") newValue = station.R;
    else if (currentChartType === "realtime-drainage") newValue = station.D;
    else if (currentChartType === "realtime-tide") newValue = station.H_tide;

    // Data manager logic
    mainChartData.labels.push(latestData.timestamp.split(' ')[1]); // Only keep time HH:mm:ss
    mainChartData.values.push(newValue);

    if (mainChartData.labels.length > STREAMING_CONFIG.maxDataPoints) {
        mainChartData.labels.shift();
        mainChartData.values.shift();
    }

    // Standard setOption for smooth diffing
    floodChart.setOption({
        xAxis: { data: mainChartData.labels },
        series: [{ data: mainChartData.values }]
    });
}

// ===========================================================================
//  LAYER 6 — VẼ 5 BIỂU ĐỒ CHO 1 TRẠM
// ===========================================================================
async function renderAllChartsForStation(stationId) {
    // Clean up old instances
    reportCharts.forEach(c => { if (c) c.dispose(); });
    reportCharts = [];
    reportChartsData = [];
    currentReportStationId = stationId;

    const grid = document.getElementById("reports-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const nameEl = document.getElementById("reports-station-name");
    if (nameEl && typeof getStationDisplayName === "function") {
        nameEl.textContent = getStationDisplayName(stationId);
    }

    const chartConfigs = [
        { title: "🌧️ Lượng mưa Realtime", type: "bar", field: "R", color: "#00d4ff", isHistory: false },
        { title: "🚰 Thoát nước Realtime", type: "line", field: "D", color: "#28a745", isHistory: false },
        { title: "🌊 Thủy triều Realtime", type: "line", field: "H_tide", color: "#7b2ffc", isHistory: false },
        { title: "📊 Lượng mưa 6 tiếng", type: "bar", field: "R", color: "#ff9800", isHistory: true },
        { title: "📈 Thủy triều 6 tiếng", type: "line", field: "H_tide", color: "#ff0040", isHistory: true }
    ];

    let historyData = null;
    try { historyData = await fetchHistoryData(); } catch (e) {}

    const baseOpt = getCommonEchartsOptions();
    
    chartConfigs.forEach((config, index) => {
        const box = document.createElement("div");
        box.className = "report-chart-box liquid-glass hover-motion-card";
        const canvasId = `report-chart-canvas-${index}`;
        
        box.innerHTML = `
            <h4>${config.title} <span class="live-indicator" style="display:${config.isHistory ? 'none' : 'inline-block'}; width:8px; height:8px; background:#ff0040; border-radius:50%; margin-left:6px; animation: live-pulse 2s infinite;"></span></h4>
            <div class="report-chart-wrapper" id="${canvasId}" style="height:220px; width:100%;"></div>
        `;
        grid.appendChild(box);

        const ctx = document.getElementById(canvasId);
        const chart = echarts.init(ctx, 'dark');
        
        let labels = [];
        let values = [];

        if (config.isHistory && historyData && historyData.length > 0) {
            historyData.forEach(m => {
                labels.push(m.timestamp.split(' ')[1]);
                const st = m.stations_data.find(s => getStationNumericId(s) === stationId);
                if (st) values.push(st[config.field]);
            });
        }

        reportChartsData.push({ labels, values });
        reportCharts.push(chart);

        chart.setOption({
            ...baseOpt,
            xAxis: { ...baseOpt.xAxis, data: labels },
            series: [{
                name: config.title,
                type: config.type,
                smooth: true,
                showSymbol: false,
                data: values,
                itemStyle: { color: config.color },
                areaStyle: config.type === 'line' ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: config.color.replace(')', ', 0.3)').replace('rgb', 'rgba') },
                        { offset: 1, color: 'rgba(0,0,0,0)' }
                    ])
                } : null
            }]
        }, true);
    });
}

function updateReportCharts(latestData) {
    if (!currentReportStationId || reportCharts.length === 0) return;

    const station = latestData.stations_data.find(
        s => getStationNumericId(s) === currentReportStationId
    );
    if (!station) return;

    const realtimeFields = ["R", "D", "H_tide"];
    const timeStr = latestData.timestamp.split(' ')[1];

    for (let i = 0; i < 3; i++) {
        const chart = reportCharts[i];
        if (!chart) continue;

        const dataObj = reportChartsData[i];
        dataObj.labels.push(timeStr);
        dataObj.values.push(station[realtimeFields[i]]);

        if (dataObj.labels.length > STREAMING_CONFIG.maxDataPoints) {
            dataObj.labels.shift();
            dataObj.values.shift();
        }

        chart.setOption({
            xAxis: { data: dataObj.labels },
            series: [{ data: dataObj.values }]
        });
    }
}
