// File: notification.js — Quản lý thông báo / cảnh báo
// V2: Thêm icon tam giác ⚠ với màu theo status, hỗ trợ cả Layer 1 (gần nhất) và Layer 3 (tất cả).


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
        ADVISORY: "#17a2b8",   // Xanh dương nhạt
        WARNING:  "#ff9800",   // Cam
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

    // Tạo HTML cho dòng thông báo (thêm icon ⚠ tam giác + tên quận)
    alertItem.innerHTML = `
        <span class="alert-icon" style="color: ${iconColor};">⚠</span>
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