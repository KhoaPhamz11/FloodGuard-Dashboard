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

    // Module 5: Cập nhật 3 biểu đồ realtime (Layer reports)
    if (typeof updateReportCharts === "function") {
        updateReportCharts(latestData);
    }

    // Module 6: Cập nhật chi tiết trạm (Layer station-detail)
    if (typeof updateStationDetail === "function") {
        updateStationDetail(latestData);
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