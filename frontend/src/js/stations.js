// File: stations.js — Quản lý dữ liệu trạm quan trắc
// Đồng bộ với backend station_registry.py (7 trạm sensor/model thật).
// V3: Bỏ trạm UI giả (Quận 1/5/10, Bình Thạnh...); giữ Gò Vấp (sensor thật).

// ===== DỮ LIỆU VỊ TRÍ 7 TRẠM (toạ độ thật, khớp backend) =====
const STATION_LOCATIONS = [
    { id: 1, name: "station_1", backend_name: "Nhà Bè",      district: "Nhà Bè",       street: "Ven sông Nhà Bè",            lat: 10.639444, lng: 106.734722, model: "daily"  },
    { id: 2, name: "station_2", backend_name: "Phú An",      district: "Phú An",       street: "Ven sông Sài Gòn, Phú An",   lat: 10.778611, lng: 106.707778, model: "daily"  },
    { id: 3, name: "station_3", backend_name: "Hóc Môn",     district: "Hóc Môn",      street: "Ven sông Sài Gòn, Hóc Môn",  lat: 10.888190, lng: 106.598219, model: "daily"  },
    { id: 4, name: "station_4", backend_name: "Lê Minh Xuân", district: "Lê Minh Xuân", street: "Lê Minh Xuân, Bình Chánh",  lat: 10.777222, lng: 106.537222, model: "daily"  },
    { id: 5, name: "station_5", backend_name: "Thủ Đức",     district: "Thủ Đức",      street: "Ven sông Sài Gòn, Thủ Đức",  lat: 10.844789, lng: 106.755827, model: "daily"  },
    { id: 6, name: "station_6", backend_name: "Củ Chi",      district: "Củ Chi",       street: "Ven sông Sài Gòn, Củ Chi",   lat: 10.955556, lng: 106.512778, model: "hourly" },
    { id: 7, name: "station_10", backend_name: "Gò Vấp",      district: "Gò Vấp",       street: "Đường Quang Trung",          lat: 10.8250,   lng: 106.6660,   model: "daily"  },
];

const MONGO_NUM_TO_UI_ID = {
    1: 1,   // station_1  → Nhà Bè
    2: 5,   // station_2  → Thủ Đức
    3: 2,   // station_3  → Phú An
    4: 4,   // station_4  → Lê Minh Xuân
    // 5, 6: không dùng UI
    8: 3,   // station_8  → Hóc Môn
    9: 6,   // station_9  → Củ Chi
    10: 7,  // station_10 → Gò Vấp  ★
};

const STATION_COUNT = STATION_LOCATIONS.length; // 7

// Lấy tên hiển thị đẹp cho trạm (ví dụ: "Trạm Nhà Bè")
function getStationDisplayName(stationId) {
    const loc = STATION_LOCATIONS.find(s => s.id === stationId);
    if (!loc) return `Trạm ${stationId}`;
    return `Trạm ${loc.district}`;
}

// Lấy object vị trí đầy đủ của trạm (dùng bởi map.js, notification.js)
function getStationLocation(stationId) {
    return STATION_LOCATIONS.find(s => s.id === stationId) || null;
}

// Lấy backend_name từ frontend id (gọi API predict)
function getBackendName(stationId) {
    const loc = getStationLocation(stationId);
    return loc ? loc.backend_name : null;
}


// ===== CÁC HÀM UI =====

let currentSelectedStationId = 1;  // Mặc định trạm 1 (Nhà Bè)

// TẠO SẴN KHUNG HTML CHO 7 Ô TRẠM (gọi 1 lần lúc khởi động)
function createStationCards() {
    const grid = document.getElementById("stationsGrid");
    if (!grid) return;

    grid.innerHTML = ""; // clear cũ nếu re-init

    for (let i = 1; i <= STATION_COUNT; i++) {
        const card = document.createElement("div");
        card.className = "station-card";
        card.id = `station-card-${i}`;

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
    if (!station) return null;

    if (station.frontend_station_id != null) {
        return Number(station.frontend_station_id);
    }

    if (station.station_name) {
        const m = String(station.station_name).match(/(\d+)/);
        if (m) {
            const mongoNum = parseInt(m[1], 10);
            if (Object.prototype.hasOwnProperty.call(MONGO_NUM_TO_UI_ID, mongoNum)) {
                return MONGO_NUM_TO_UI_ID[mongoNum];
            }
            // Chỉ nhận id trong UI (1..7)
            if (mongoNum >= 1 && mongoNum <= 7) return mongoNum;
            return null;
        }
    }

    if (station.id != null) return Number(station.id);
    return null;
}

// Dịch code số (0,1,2,3) sang tên trạng thái CSS
// QUY ƯỚC: 0 = An toàn, 1 = Cảnh báo nhẹ, 2 = Cảnh báo, 3 = Nguy hiểm
function getStatusFromCode(code) {
    const map = { 0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL" };
    return map[code] !== undefined ? map[code] : "SAFE";
}

// CẬP NHẬT SỐ LIỆU VÀ MÀU SẮC 7 Ô (gọi định kỳ từ app.js)
function updateStationCards(stationsData) {
    if (!Array.isArray(stationsData)) return;

    stationsData.forEach(station => {
        const id = getStationNumericId(station);
        if (id == null || id < 1 || id > STATION_COUNT) return;

        const card = document.getElementById(`station-card-${id}`);
        const depthVal = document.getElementById(`depth-val-${id}`);
        const rateVal = document.getElementById(`rate-val-${id}`);
        const riskVal = document.getElementById(`risk-val-${id}`);
        if (!card) return;

        if (depthVal) depthVal.textContent = Number(station.H ?? station.live_water_level_m ?? 0).toFixed(2);
        if (rateVal)  rateVal.textContent  = Number(station.V ?? 0).toFixed(2);
        if (riskVal)  riskVal.textContent  = Number(station.S_risk ?? station.risk_code ?? 0).toFixed(2);

        const idOverride = typeof forecastStationOverrides !== "undefined"
            ? forecastStationOverrides[id]
            : undefined;
        const status = getStatusFromCode(
            idOverride !== undefined ? idOverride : (station.code ?? station.risk_code ?? 0)
        );

        card.classList.remove("status-safe", "status-advisory", "status-warning", "status-critical");
        if (status === "SAFE")          card.classList.add("status-safe");
        else if (status === "ADVISORY") card.classList.add("status-advisory");
        else if (status === "WARNING")  card.classList.add("status-warning");
        else if (status === "CRITICAL") card.classList.add("status-critical");

        const statusText = card.querySelector(".station-status-text");
        if (statusText) {
            statusText.textContent = station.description || station.risk_level || status;
        }
    });
}

// LẮNG NGHE CLICK trên 7 card (gọi 1 lần lúc init)
function initStationClickEvents() {
    for (let i = 1; i <= STATION_COUNT; i++) {
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
    if (stationId < 1 || stationId > STATION_COUNT) return;
    currentSelectedStationId = stationId;

    for (let i = 1; i <= STATION_COUNT; i++) {
        const card = document.getElementById(`station-card-${i}`);
        if (card) card.classList.remove("station-selected");
    }
    const selectedCard = document.getElementById(`station-card-${stationId}`);
    if (selectedCard) selectedCard.classList.add("station-selected");
}