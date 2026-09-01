// File: chart.js — Vẽ biểu đồ (giữ nguyên logic cũ + thêm hàm cho Layer 6)
// V2: Thêm renderAllChartsForStation() vẽ 5 biểu đồ cùng lúc cho 1 trạm.
/*
destroy(): Lau sạch bảng cũ trước khi vẽ mới
push() và shift(): Băng chuyền realtime — nhét điểm mới, xóa điểm cũ
*/


// ===== BIẾN TRẠNG THÁI CŨ (giữ nguyên cho tương thích) =====
let floodChart = null;
let currentChartStationId = 1;
let currentChartType = "realtime-rain";


// ===== HÀM 1: LẮNG NGHE SỰ KIỆN ĐỔI DROPDOWN (giữ nguyên) =====
function initChartEvents() {
    const chartModeSelect = document.getElementById("chart-mode-select");
    if (chartModeSelect) {
        chartModeSelect.addEventListener("change", (event) => {
            const newChartType = event.target.value;
            updateChartForStation(currentChartStationId, newChartType);
        });
    }
}


// ===== HÀM 2: QUẢN LÝ LUỒNG VẼ (giữ nguyên) =====
async function updateChartForStation(stationId, chartType) {
    currentChartStationId = stationId;
    currentChartType = chartType;
    if (chartType === "history-rain-6h" || chartType === "history-tide-6h") {
        await renderHistoryChart(stationId, chartType);
    } else {
        initRealtimeChart(chartType);
    }
}


// ===== HÀM 3: VẼ BIỂU ĐỒ LỊCH SỬ 6 TIẾNG (giữ nguyên) =====
async function renderHistoryChart(stationId, chartType) {
    const historyData = await fetchHistoryData();
    if (!historyData || historyData.length === 0) return;

    const labels = [];
    const dataPoints = [];

    historyData.forEach(minuteData => {
        labels.push(minuteData.timestamp);
        const station = minuteData.stations_data.find(s => getStationNumericId(s) === stationId);
        if (station) {
            if (chartType === "history-rain-6h") {
                dataPoints.push(station.R);
            } else if (chartType === "history-tide-6h") {
                dataPoints.push(station.H_tide);
            }
        }
    });

    if (floodChart) floodChart.destroy();
    const ctx = document.getElementById("flood-chart-canvas");
    if (!ctx) return;  // V2: canvas này không tồn tại trong layout mới, thoát an toàn

    const chartStyle = chartType === "history-rain-6h" ? "bar" : "line";
    const labelName = chartType === "history-rain-6h" ? "Lượng mưa 6h (mm/phút)" : "Thủy triều 6h (m)";

    floodChart = new Chart(ctx, {
        type: chartStyle,
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: dataPoints,
                backgroundColor: "rgba(54, 162, 235, 0.5)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,
                pointRadius: 0
            }]
        },
        options: { responsive: true }
    });
}


// ===== HÀM 4: KHỞI TẠO BIỂU ĐỒ REALTIME RỖNG (giữ nguyên) =====
function initRealtimeChart(chartType) {
    if (floodChart) floodChart.destroy();
    const ctx = document.getElementById("flood-chart-canvas");
    if (!ctx) return;  // V2: thoát an toàn nếu canvas cũ không tồn tại

    let chartStyle = "line";
    let labelName = "";

    if (chartType === "realtime-rain") {
        chartStyle = "bar";
        labelName = "Lượng mưa Realtime (mm/phút)";
    } else if (chartType === "realtime-drainage") {
        chartStyle = "line";
        labelName = "Khả năng thoát nước (mm/phút)";
    } else if (chartType === "realtime-tide") {
        chartStyle = "line";
        labelName = "Thủy triều Realtime (m)";
    }

    floodChart = new Chart(ctx, {
        type: chartStyle,
        data: {
            labels: [],
            datasets: [{
                label: labelName,
                data: [],
                backgroundColor: "rgba(255, 99, 132, 0.5)",
                borderColor: "rgba(255, 99, 132, 1)",
                borderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            animation: false
        }
    });
}


// ===== HÀM 5: BƠM DỮ LIỆU REALTIME (giữ nguyên) =====
function updateRealtimeChart(latestData) {
    if (!floodChart || currentChartType.includes("history")) return;

    const station = latestData.stations_data.find(s => getStationNumericId(s) === currentChartStationId);
    if (!station) return;

    let newValue = 0;
    if (currentChartType === "realtime-rain")     newValue = station.R;
    else if (currentChartType === "realtime-drainage") newValue = station.D;
    else if (currentChartType === "realtime-tide")     newValue = station.H_tide;

    floodChart.data.labels.push(latestData.timestamp);
    floodChart.data.datasets[0].data.push(newValue);

    if (floodChart.data.labels.length > 60) {
        floodChart.data.labels.shift();
        floodChart.data.datasets[0].data.shift();
    }

    floodChart.update();
}


// ===========================================================================
//  V2 MỚI: LAYER 6 — VẼ 5 BIỂU ĐỒ CHO 1 TRẠM
// ===========================================================================

let reportCharts = [];           // Mảng lưu 5 Chart instances
let currentReportStationId = null;  // Trạm đang được xem báo cáo

async function renderAllChartsForStation(stationId) {
    // 1. Dọn dẹp biểu đồ cũ
    reportCharts.forEach(c => { if (c) c.destroy(); });
    reportCharts = [];
    currentReportStationId = stationId;

    const grid = document.getElementById("reports-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // Cập nhật tiêu đề
    const nameEl = document.getElementById("reports-station-name");
    if (nameEl && typeof getStationDisplayName === "function") {
        nameEl.textContent = getStationDisplayName(stationId);
    }

    // 2. Cấu hình 5 biểu đồ
    const chartConfigs = [
        {
            title: "🌧️ Lượng mưa Realtime",
            type: "bar", field: "R",
            label: "Lượng mưa (mm/phút)",
            bg: "rgba(255, 99, 132, 0.5)", border: "rgba(255, 99, 132, 1)",
            isHistory: false
        },
        {
            title: "🚰 Khả năng thoát nước Realtime",
            type: "line", field: "D",
            label: "Thoát nước (mm/phút)",
            bg: "rgba(75, 192, 192, 0.5)", border: "rgba(75, 192, 192, 1)",
            isHistory: false
        },
        {
            title: "🌊 Thủy triều Realtime",
            type: "line", field: "H_tide",
            label: "Thủy triều (m)",
            bg: "rgba(153, 102, 255, 0.5)", border: "rgba(153, 102, 255, 1)",
            isHistory: false
        },
        {
            title: "📊 Lượng mưa 6 tiếng",
            type: "bar", field: "R",
            label: "Lượng mưa 6h (mm/phút)",
            bg: "rgba(54, 162, 235, 0.5)", border: "rgba(54, 162, 235, 1)",
            isHistory: true
        },
        {
            title: "📈 Thủy triều 6 tiếng",
            type: "line", field: "H_tide",
            label: "Thủy triều 6h (m)",
            bg: "rgba(255, 206, 86, 0.5)", border: "rgba(255, 206, 86, 1)",
            isHistory: true
        }
    ];

    // 3. Lấy data lịch sử 1 lần cho 2 biểu đồ history
    let historyData = null;
    try {
        historyData = await fetchHistoryData();
    } catch (e) {
        console.error("Lỗi lấy dữ liệu history cho reports:", e);
    }

    // 4. Tạo 5 biểu đồ
    chartConfigs.forEach((config, index) => {
        // Tạo container
        const box = document.createElement("div");
        box.className = "report-chart-box liquid-glass hover-motion-card";

        const canvasId = `report-chart-${index}`;
        box.innerHTML = `
            <h4>${config.title}</h4>
            <div class="report-chart-wrapper">
                <canvas id="${canvasId}"></canvas>
            </div>
        `;
        grid.appendChild(box);

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (config.isHistory && historyData && historyData.length > 0) {
            // ===== Biểu đồ lịch sử: có sẵn data =====
            const labels = [];
            const dataPoints = [];

            historyData.forEach(minuteData => {
                labels.push(minuteData.timestamp);
                const station = minuteData.stations_data.find(s => getStationNumericId(s) === stationId);
                if (station) {
                    dataPoints.push(station[config.field]);
                }
            });

            const chart = new Chart(ctx, {
                type: config.type,
                data: {
                    labels: labels,
                    datasets: [{
                        label: config.label,
                        data: dataPoints,
                        backgroundColor: config.bg,
                        borderColor: config.border,
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
            reportCharts.push(chart);

        } else {
            // ===== Biểu đồ realtime: bắt đầu rỗng, cập nhật mỗi giây =====
            const chart = new Chart(ctx, {
                type: config.type,
                data: {
                    labels: [],
                    datasets: [{
                        label: config.label,
                        data: [],
                        backgroundColor: config.bg,
                        borderColor: config.border,
                        borderWidth: 2,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false
                }
            });
            reportCharts.push(chart);
        }
    });
}


// ===== CẬP NHẬT 3 BIỂU ĐỒ REALTIME TRONG LAYER 6 (gọi mỗi giây) =====
function updateReportCharts(latestData) {
    if (!currentReportStationId || reportCharts.length === 0) return;

    const station = latestData.stations_data.find(
        s => getStationNumericId(s) === currentReportStationId
    );
    if (!station) return;

    // Chỉ cập nhật 3 biểu đồ realtime đầu tiên (index 0, 1, 2)
    const realtimeFields = ["R", "D", "H_tide"];

    for (let i = 0; i < 3; i++) {
        const chart = reportCharts[i];
        if (!chart) continue;

        chart.data.labels.push(latestData.timestamp);
        chart.data.datasets[0].data.push(station[realtimeFields[i]]);

        // Giới hạn 60 điểm (giống logic cũ)
        if (chart.data.labels.length > 60) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update();
    }
}