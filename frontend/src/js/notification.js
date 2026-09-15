// File: notification.js — Quản lý thông báo / cảnh báo
// V2: Thêm icon tam giác <svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> với màu theo status, hỗ trợ cả Layer 1 (gần nhất) và Layer 3 (tất cả).


// ===== HÀM 1: CẬP NHẬT THÔNG BÁO GẦN NHẤT (Layer 1) =====
// Gọi mỗi giây từ app.js, chỉ hiện trạm đang có sự cố
function updateNotificationFeed(latestData) {
    const feed = document.getElementById("main-notification-feed");  // V2: đổi ID từ "notification-feed" sang "main-notification-feed"
    if (!feed) return;
    const timeString = latestData.timestamp;

    latestData.stations_data.forEach(station => {
        if (station.code !== 0) {
            createNotificationItem(feed, timeString, station);
        }
    });
}


// ===== HÀM 2: CẬP NHẬT DANH SÁCH TẤT CẢ CẢNH BÁO (Layer 3) =====
// Gọi mỗi giây từ app.js, cập nhật feed ở layer "Tất cả cảnh báo"
function updateFullAlertsList(latestData) {
    const feed = document.getElementById("alerts-full-list");
    if (!feed) return;
    const timeString = latestData.timestamp;

    latestData.stations_data.forEach(station => {
        if (station.code !== 0) {
            createNotificationItem(feed, timeString, station);
        }
    });
}


// ===== HÀM 3: TẠO 1 DÒNG THÔNG BÁO (dùng chung cho cả Layer 1 và Layer 3) =====
function createNotificationItem(feedElement, timeString, station) {
    const alertItem = document.createElement("div");
    const status = typeof getStatusFromCode === "function"
        ? getStatusFromCode(station.code)
        : "ADVISORY";

    // Thêm class trạng thái
    alertItem.classList.add("alert-item", "hover-motion-card");
    if (status === "ADVISORY")      alertItem.classList.add("status-advisory");
    else if (status === "WARNING")  alertItem.classList.add("status-warning");
    else if (status === "CRITICAL") alertItem.classList.add("status-critical");

    // Màu icon tam giác theo trạng thái
    const iconColors = {
        ADVISORY: "#fbc02d",   // Vàng
        WARNING:  "#ef6c00",   // Cam đậm
        CRITICAL: "#e53935"    // Đỏ
    };
    const iconColor = iconColors[status] || "#8892b0";

    // Tên quận (nếu có STATION_LOCATIONS)
    const stationId = typeof getStationNumericId === "function"
        ? getStationNumericId(station)
        : 0;
    const loc = typeof getStationLocation === "function"
        ? getStationLocation(stationId)
        : null;
    const districtName = loc ? loc.district : station.station_name;

    // Tạo HTML cho dòng thông báo (thêm icon <svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> tam giác + tên quận)
    alertItem.innerHTML = `
        <span class="alert-icon" style="color: ${iconColor};"><svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>
        <div class="alert-content">
            <strong>[${timeString}] Trạm ${districtName}</strong><br>
            <span>Trạng thái: <b>${station.description}</b></span><br>
            <span><em>Risk score: ${Number(station.S_risk).toFixed(2)}</em></span>
        </div>
    `;

    // Dán vào đầu feed (mới nhất trên cùng)
    feedElement.prepend(alertItem);

    // Giới hạn tối đa 50 dòng để không nặng trình duyệt
    if (feedElement.children.length > 50) {
        feedElement.removeChild(feedElement.lastChild);
    }
}