// File: app.js — Nhạc trưởng điều khiển các module (V2)
// Vòng lặp mỗi giây: gọi api.js lấy data, chia cho tất cả modules hiển thị.
// V2: Thêm init cho map, layout, clock. Giữ nguyên vòng lặp realtime.


let updateInterval;  // Biến lưu đồng hồ đếm nhịp


// ===== HÀM 1: KHỞI TẠO HỆ THỐNG KHI MỞ WEB =====
async function initDashboard() {
    console.log("Đang khởi tạo Dashboard FloodGuard V2...");

    // Khởi tạo layout & navigation (sidebar, modal, nút Back)
    if (typeof initLayout === "function") initLayout();

    // Tạo khung HTML cho 9 ô trạm (Layer 4)
    if (typeof createStationCards === "function") createStationCards();
    if (typeof initStationClickEvents === "function") initStationClickEvents();

    // Khởi tạo bản đồ nhỏ (Layer 1)
    if (typeof initMaps === "function") initMaps();

    // Khởi tạo đồng hồ
    updateClock();
    setInterval(updateClock, 1000);

    // Giữ tương thích: init chart events (sẽ no-op vì dropdown cũ không tồn tại)
    if (typeof initChartEvents === "function") initChartEvents();

    // Gọi mẻ dữ liệu đầu tiên
    const initialData = await fetchLatestData();
    if (initialData) {
        console.log("Dữ liệu ban đầu nhận được:", initialData);
        updateDashboardUI(initialData);
    }

    // Bật vòng lặp realtime
    startRealtimeUpdates();
}


// ===== HÀM 2: PHÂN PHỐI DỮ LIỆU CHO TẤT CẢ MODULES =====
function updateDashboardUI(latestData) {
    // Module 1: Cập nhật 9 ô trạm (Layer 4)
    if (typeof updateStationCards === "function") {
        updateStationCards(latestData.stations_data);
    }

    // Module 2: Cập nhật markers trên bản đồ (Layer 1 + Layer 2)
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

    // Module 5: Cập nhật 3 biểu đồ realtime trong báo cáo (Layer 6)
    if (typeof updateReportCharts === "function") {
        updateReportCharts(latestData);
    }
}


// ===== HÀM 3: VÒNG LẶP REALTIME (1 giây = 1 phút mô phỏng) =====
function startRealtimeUpdates() {
    updateInterval = setInterval(async () => {
        const latestData = await fetchLatestData();
        if (latestData) {
            updateDashboardUI(latestData);
        }
    }, 1000);
}


// ===== HÀM 4: CẬP NHẬT ĐỒNG HỒ THỜI GIAN THỰC =====
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


// ===== ĐIỂM KÍCH HOẠT: KHI HTML LOAD XONG =====
document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});