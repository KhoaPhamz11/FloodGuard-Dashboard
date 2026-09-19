// File: stations.js — Quản lý dữ liệu 9 trạm quan trắc
// Đọc dữ liệu của 9 trạm, đưa các con số lên 9 ô, đổi màu theo cảnh báo.
// V2: Thêm STATION_LOCATIONS cho bản đồ Leaflet.

// ===== DỮ LIỆU VỊ TRÍ 9 TRẠM (toạ độ thật tại TP.HCM) =====
const STATION_LOCATIONS = [
    { id: 1, name: "station_1", district: "Quận 1",                  street: "Đinh Tiên Hoàng",               lat: 10.7880, lng: 106.7050 },
    { id: 2, name: "station_2", district: "Quận 2 (TP. Thủ Đức)",    street: "Nguyễn Duy Trinh",              lat: 10.7750, lng: 106.7650 },
    { id: 3, name: "station_3", district: "Quận 3",                  street: "Trường Sa",                     lat: 10.7930, lng: 106.6870 },
    { id: 4, name: "station_4", district: "Quận 5",                  street: "Trần Hưng Đạo – Trần Phú",     lat: 10.7550, lng: 106.6720 },
    { id: 5, name: "station_5", district: "Quận 7",                  street: "Trần Xuân Soạn",                lat: 10.7350, lng: 106.7050 },
    { id: 6, name: "station_6", district: "Quận 10",                 street: "Đường 3 Tháng 2",               lat: 10.7720, lng: 106.6680 },
    { id: 7, name: "station_7", district: "Bình Thạnh",              street: "Nguyễn Hữu Cảnh",               lat: 10.7940, lng: 106.7180 },
    { id: 8, name: "station_8", district: "Hóc Môn",                 street: "Ven sông Sài Gòn, xã Nhị Bình", lat: 10.8700, lng: 106.6950 },
    { id: 9, name: "station_9", district: "Củ Chi",                  street: "Ven sông Sài Gòn, TT Củ Chi",   lat: 10.9750, lng: 106.4950 }
];

// Lấy tên hiển thị đẹp cho trạm (ví dụ: "Trạm Quận 1")
function getStationDisplayName(stationId) {
    const loc = STATION_LOCATIONS.find(s => s.id === stationId);
    if (!loc) return `Trạm ${stationId}`;
    return `Trạm ${loc.district}`;
}

// Lấy object vị trí đầy đủ của trạm (dùng bởi map.js, notification.js)
function getStationLocation(stationId) {
    return STATION_LOCATIONS.find(s => s.id === stationId) || null;
}


// ===== CÁC HÀM CŨ (giữ nguyên 100%) =====

let currentSelectedStationId = 1;  // Mặc định mở web lên là trạm 1

// TẠO SẴN KHUNG HTML CHO 9 Ô TRẠM (gọi 1 lần lúc khởi động)
function createStationCards() {
    const grid = document.getElementById("stationsGrid");
    if (!grid) return;

    for (let i = 1; i <= 9; i++) {
        const card = document.createElement("div");
        card.className = "station-card";
        card.id = `station-card-${i}`;

        // V2: Dùng tên quận thay vì "Trạm 1"
        const displayName = getStationDisplayName(i);

        card.innerHTML = `
            <div class="station-name">${displayName}</div>
            <div class="station-depth">Độ sâu: <span id="depth-val-${i}">--</span> cm</div>
            <div class="station-rate">Tốc độ dâng: <span id="rate-val-${i}">--</span> cm/phút</div>
            <div class="station-risk" id="risk-val-${i}">--</div>
            <div class="station-status-text">Đang chờ dữ liệu...</div>
        `;

        grid.appendChild(card);
    }
}

// Bóc số ID ra từ station_name "station_1" → 1
function getStationNumericId(station) {
    return parseInt(station.station_name.split("_")[1], 10);
}

// Dịch code số (0,1,2,3) sang tên trạng thái CSS
// QUY ƯỚC: 0 = An toàn, 1 = Cảnh báo nhẹ, 2 = Cảnh báo, 3 = Nguy hiểm
function getStatusFromCode(code) {
    const map = { 0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL" };
    return map[code] !== undefined ? map[code] : "SAFE";
}

// CẬP NHẬT SỐ LIỆU VÀ MÀU SẮC 9 Ô (gọi mỗi giây từ app.js)
function updateStationCards(stationsData) {
    stationsData.forEach(station => {
        const id = getStationNumericId(station);
        const card = document.getElementById(`station-card-${id}`);
        const depthVal = document.getElementById(`depth-val-${id}`);
        const rateVal = document.getElementById(`rate-val-${id}`);
        const riskVal = document.getElementById(`risk-val-${id}`);
        if (!card) return;

        if (depthVal) depthVal.textContent = Number(station.H).toFixed(2);
        if (rateVal)  rateVal.textContent  = Number(station.V).toFixed(2);
        if (riskVal)  riskVal.textContent  = Number(station.S_risk).toFixed(2);

        const idOverride = typeof forecastStationOverrides !== "undefined"
            ? forecastStationOverrides[id]
            : undefined;
        const status = getStatusFromCode(idOverride !== undefined ? idOverride : station.code);

        // Đổi màu theo trạng thái
        card.classList.remove("status-safe", "status-advisory", "status-warning", "status-critical");
        if (status === "SAFE")          card.classList.add("status-safe");
        else if (status === "ADVISORY") card.classList.add("status-advisory");
        else if (status === "WARNING")  card.classList.add("status-warning");
        else if (status === "CRITICAL") card.classList.add("status-critical");

        // Cập nhật text trạng thái
        const statusText = card.querySelector(".station-status-text");
        if (statusText) statusText.textContent = station.description || status;
    });
}

// LẮNG NGHE SỰ KIỆN CLICK CHUỘT trên 9 card (gọi 1 lần lúc init)
function initStationClickEvents() {
    for (let i = 1; i <= 9; i++) {
        const card = document.getElementById(`station-card-${i}`);
        if (card) {
            card.addEventListener("click", () => {
                selectStation(i);
            });
        }
    }
}

// XỬ LÝ KHI NGƯỜI DÙNG CHỌN 1 TRẠM
function selectStation(stationId) {
    currentSelectedStationId = stationId;

    // Gỡ viền sáng cũ
    for (let i = 1; i <= 9; i++) {
        const card = document.getElementById(`station-card-${i}`);
        if (card) card.classList.remove("station-selected");
    }
    // Gắn viền sáng mới
    const selectedCard = document.getElementById(`station-card-${stationId}`);
    if (selectedCard) selectedCard.classList.add("station-selected");
}