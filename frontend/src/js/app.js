// File: app.js — Nhạc trưởng điều khiển các module (V2 Round 2)
// Thêm: Mock data fallback khi API fail + updateStationDetail()

let updateInterval;

// ===== MOCK DATA: Dữ liệu giả khi API/MongoDB không khả dụng =====
function generateMockData() {
    const now = new Date();
    const timestamp = now.toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        day: "2-digit", month: "2-digit", year: "numeric"
    });

    const stations = [];
    for (let i = 1; i <= 9; i++) {
        // Tạo data ngẫu nhiên nhẹ để mô phỏng realtime
        const seed = Math.sin(now.getTime() / 1000 + i) * 0.5 + 0.5;
        const code = seed < 0.5 ? 0 : seed < 0.7 ? 1 : seed < 0.9 ? 2 : 3;
        const labels = ["An toàn", "Cảnh báo nhẹ", "Cảnh báo", "Nguy hiểm"];
        const descriptions = [
            "Mực nước bình thường",
            "Mực nước đang tăng nhẹ",
            "Mực nước cao, cần theo dõi",
            "Ngập nặng, nguy hiểm"
        ];

        stations.push({
            station_name: `station_${i}`,
            R: +(seed * 5 + Math.random() * 0.5).toFixed(2),
            D: +(2 + Math.random() * 2).toFixed(2),
            H_tide: +(0.5 + seed * 1.5 + Math.random() * 0.2).toFixed(2),
            H: +(seed * 1.2 + Math.random() * 0.3).toFixed(2),
            V: +(seed * 0.08 + Math.random() * 0.02).toFixed(3),
            S_risk: +(seed * 0.8 + Math.random() * 0.2).toFixed(2),
            code: code,
            label: labels[code],
            description: descriptions[code],
            status: labels[code]
        });
    }

    return { timestamp, stations_data: stations };
}


// ===== HÀM 1: KHỞI TẠO HỆ THỐNG KHI MỞ WEB =====
async function initDashboard() {
    console.log("Đang khởi tạo Dashboard FloodGuard V2...");

    // Khởi tạo layout & navigation
    if (typeof initLayout === "function") initLayout();

    // Tạo khung HTML cho 9 ô trạm (no-op nếu grid không tồn tại)
    if (typeof createStationCards === "function") createStationCards();
    if (typeof initStationClickEvents === "function") initStationClickEvents();

    // Khởi tạo bản đồ nhỏ (Layer 1)
    if (typeof initMaps === "function") initMaps();

    // Khởi tạo đồng hồ
    updateClock();
    setInterval(updateClock, 1000);

    // Giữ tương thích: init chart events
    if (typeof initChartEvents === "function") initChartEvents();
    if (typeof initRealtimeChart === "function") initRealtimeChart("realtime-rain");

    // Gọi mẻ dữ liệu đầu tiên (API hoặc mock fallback)
    let initialData = await fetchLatestData();
    if (!initialData) {
        console.warn("API không khả dụng — dùng mock data");
        initialData = generateMockData();
    }
    console.log("Dữ liệu ban đầu:", initialData);
    updateDashboardUI(initialData);

    // Bật vòng lặp realtime
    startRealtimeUpdates();
}


// ===== HÀM 2: PHÂN PHỐI DỮ LIỆU CHO TẤT CẢ MODULES =====
function updateDashboardUI(latestData) {
    // Module 1: Cập nhật 9 ô trạm (nếu grid tồn tại)
    if (typeof updateStationCards === "function") {
        updateStationCards(latestData.stations_data);
    }

    // Module 2: Cập nhật markers trên bản đồ
    if (typeof updateMapMarkers === "function") {
        updateMapMarkers(latestData.stations_data);
    }

    // Module 3: Cập nhật thông báo gần nhất (Layer 1)
    if (typeof updateNotificationFeed === "function") {
        updateNotificationFeed(latestData);
    }

    // Module 4: Cập nhật danh sách tất cả cảnh báo (Layer 3)
    if (typeof updateFullAlertsList === "function") {
        updateFullAlertsList(latestData);
    }

    // Module 5: Cập nhật dữ liệu ngập cho Navigation Mode
    if (typeof updateNavigationFloodData === "function") {
        updateNavigationFloodData(latestData);
    }

    // Module 5: Cập nhật 3 biểu đồ realtime (Layer reports)
    if (typeof updateReportCharts === "function") {
        updateReportCharts(latestData);
    }

    // Module 6: Cập nhật chi tiết trạm (Layer station-detail)
    if (typeof updateStationDetail === "function") {
        updateStationDetail(latestData);
    }

    // Module 7: Cập nhật biểu đồ chính (Layer 1)
    if (typeof updateRealtimeChart === "function") {
        updateRealtimeChart(latestData);
    }

    // Module 8: Cập nhật Command Center KPIs (New Layout)
    updateCommandCenterKPIs(latestData);

    // Module 9: Cập nhật Alert Center
    if (typeof updateAlertCenter === "function") {
        updateAlertCenter(latestData);
    }
}

function updateCommandCenterKPIs(latestData) {
    if (!latestData || !latestData.stations_data) return;

    let maxRisk = 0;
    let maxRiskStation = null;
    let maxRain = 0;
    let maxRainStation = null;
    let onlineCount = 0;

    latestData.stations_data.forEach(station => {
        if (station.code !== undefined && station.code !== null) onlineCount++;
        
        if (station.S_risk > maxRisk) {
            maxRisk = station.S_risk;
            maxRiskStation = station;
        }

        if (station.R > maxRain) {
            maxRain = station.R;
            maxRainStation = station;
        }
    });

    // Cập nhật số trạm online
    const onlineEl = document.getElementById("kpi-stations-online");
    if (onlineEl) onlineEl.textContent = `${onlineCount} / ${latestData.stations_data.length}`;

    // Cập nhật Risk Score lớn nhất
    const riskEl = document.getElementById("kpi-max-risk");
    const riskLocEl = document.getElementById("kpi-max-risk-loc");
    if (riskEl) {
        riskEl.textContent = Number(maxRisk).toFixed(2);
        // Thay đổi gradient hoặc màu dựa trên mức rủi ro nếu cần thiết, 
        // nhưng class shiny-gradient đã đảm nhận phần hiển thị đẹp.
    }
    if (riskLocEl && maxRiskStation) {
        const stationId = typeof getStationNumericId === "function" ? getStationNumericId(maxRiskStation) : null;
        const displayName = typeof getStationDisplayName === "function" && stationId ? getStationDisplayName(stationId) : maxRiskStation.station_name;
        riskLocEl.textContent = `Tại ${displayName}`;
    }

    // Cập nhật Lượng mưa lớn nhất
    const rainEl = document.getElementById("kpi-max-rain");
    const rainLocEl = document.getElementById("kpi-max-rain-loc");
    if (rainEl) rainEl.textContent = Number(maxRain).toFixed(2);
    if (rainLocEl && maxRainStation) {
        const stationId = typeof getStationNumericId === "function" ? getStationNumericId(maxRainStation) : null;
        const displayName = typeof getStationDisplayName === "function" && stationId ? getStationDisplayName(stationId) : maxRainStation.station_name;
        rainLocEl.textContent = `Tại ${displayName} (mm/phút)`;
    }

    // Cập nhật AI Trend (mô phỏng intelligence dựa trên Risk lớn nhất)
    const aiTrendEl = document.getElementById("ai-trend");
    const aiConfEl = document.getElementById("ai-confidence-val");
    const aiRecEl = document.getElementById("ai-recommendation");
    
    if (aiTrendEl && aiRecEl) {
        if (maxRisk > 0.8) {
            aiTrendEl.textContent = `Cảnh báo: Rủi ro ngập đang tăng nhanh tại ${maxRiskStation ? maxRiskStation.station_name : 'một số khu vực'}. Khả năng ngập lụt cục bộ trong 15-30 phút tới.`;
            aiTrendEl.style.color = "#ff5f56";
            aiConfEl.textContent = "94%";
            aiRecEl.textContent = "Hành động: Điều hướng giao thông khỏi khu vực rủi ro và kích hoạt máy bơm công suất lớn.";
            aiRecEl.style.borderLeftColor = "#ff5f56";
            aiRecEl.style.backgroundColor = "rgba(255, 95, 86, 0.1)";
        } else if (maxRisk > 0.4) {
            aiTrendEl.textContent = "Dự báo: Lượng mưa tăng nhẹ, hệ thống thoát nước hiện vẫn đáp ứng được. Cần tiếp tục theo dõi.";
            aiTrendEl.style.color = "#ffbd2e";
            aiConfEl.textContent = "88%";
            aiRecEl.textContent = "Hành động: Tăng cường giám sát tại các trạm đang có cảnh báo nhẹ.";
            aiRecEl.style.borderLeftColor = "#ffbd2e";
            aiRecEl.style.backgroundColor = "rgba(255, 189, 46, 0.1)";
        } else {
            aiTrendEl.textContent = "Tình trạng ổn định. Hệ thống thoát nước hoạt động bình thường, không có dấu hiệu ngập lụt trong 2 giờ tới.";
            aiTrendEl.style.color = "#27c93f";
            aiConfEl.textContent = "98%";
            aiRecEl.textContent = "Hành động: Duy trì hệ thống quan trắc tiêu chuẩn.";
            aiRecEl.style.borderLeftColor = "#27c93f";
            aiRecEl.style.backgroundColor = "rgba(39, 201, 63, 0.1)";
        }
    }
}


// ===== HÀM 3: VÒNG LẶP REALTIME =====
function startRealtimeUpdates() {
    updateInterval = setInterval(async () => {
        let latestData = await fetchLatestData();
        if (!latestData) {
            latestData = generateMockData();
        }
        updateDashboardUI(latestData);
    }, 1000);
}


// ===== HÀM 4: CẬP NHẬT ĐỒNG HỒ =====
function updateClock() {
    const el = document.getElementById("currentTime");
    if (!el) return;

    const now = new Date();
    el.textContent = now.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}


// ===== ĐIỂM KÍCH HOẠT =====
document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});