// File: stations.js — 7 trạm thật. Củ Chi CHỈ từ station_9.
const STATION_LOCATIONS = [
    { id: 1, name: "station_1", backend_name: "Nhà Bè",      district: "Nhà Bè",       street: "Ven sông Nhà Bè",            lat: 10.639444, lng: 106.734722, model: "daily"  },
    { id: 2, name: "station_3", backend_name: "Phú An",      district: "Phú An",       street: "Ven sông Sài Gòn, Phú An",   lat: 10.778611, lng: 106.707778, model: "daily"  },
    { id: 3, name: "station_8", backend_name: "Hóc Môn",     district: "Hóc Môn",      street: "Ven sông Sài Gòn, Hóc Môn",  lat: 10.888190, lng: 106.598219, model: "daily"  },
    { id: 4, name: "station_4", backend_name: "Lê Minh Xuân", district: "Lê Minh Xuân", street: "Lê Minh Xuân, Bình Chánh",  lat: 10.777222, lng: 106.537222, model: "daily"  },
    { id: 5, name: "station_2", backend_name: "Thủ Đức",     district: "Thủ Đức",      street: "Ven sông Sài Gòn, Thủ Đức",  lat: 10.844789, lng: 106.755827, model: "daily"  },
    { id: 6, name: "station_9", backend_name: "Củ Chi",      district: "Củ Chi",       street: "Ven sông Sài Gòn, Củ Chi",   lat: 10.955556, lng: 106.512778, model: "hourly" },
    { id: 7, name: "station_10", backend_name: "Gò Vấp",      district: "Gò Vấp",       street: "Đường Quang Trung",          lat: 10.8250,   lng: 106.6660,   model: "daily"  },
];

// station_6 KHÔNG map — Củ Chi chỉ station_9
const MONGO_NUM_TO_UI_ID = {
    1: 1, 2: 5, 3: 2, 4: 4,
    8: 3, 9: 6, 10: 7,
};

const STATION_COUNT = STATION_LOCATIONS.length;

function getStationDisplayName(stationId) {
    const loc = STATION_LOCATIONS.find(s => s.id === stationId);
    return loc ? `Trạm ${loc.district}` : `Trạm ${stationId}`;
}

function getStationLocation(stationId) {
    return STATION_LOCATIONS.find(s => s.id === stationId) || null;
}

function getBackendName(stationId) {
    const loc = getStationLocation(stationId);
    return loc ? loc.backend_name : null;
}

let currentSelectedStationId = 1;

function createStationCards() {
    const grid = document.getElementById("stationsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= STATION_COUNT; i++) {
        const card = document.createElement("div");
        card.className = "station-card";
        card.id = `station-card-${i}`;
        card.innerHTML = `
            <div class="station-name">${getStationDisplayName(i)}</div>
            <div class="station-depth">Độ sâu: <span id="depth-val-${i}">--</span> cm</div>
            <div class="station-rate">Tốc độ dâng: <span id="rate-val-${i}">--</span> cm/phút</div>
            <div class="station-risk" id="risk-val-${i}">--</div>
            <div class="station-status-text">Đang chờ dữ liệu...</div>
        `;
        grid.appendChild(card);
    }
}

/** station_9 → 6; station_6 → null (bỏ). frontend_station_id = UI id 1..7 */
function getStationNumericId(station) {
    if (!station) return null;
    if (station.frontend_station_id != null) {
        const n = Number(station.frontend_station_id);
        if (!Number.isNaN(n) && n >= 1 && n <= STATION_COUNT) return n;
    }
    if (station.station_name) {
        const m = String(station.station_name).match(/(\d+)/);
        if (m) {
            const mongoNum = parseInt(m[1], 10);
            if (Object.prototype.hasOwnProperty.call(MONGO_NUM_TO_UI_ID, mongoNum)) {
                return MONGO_NUM_TO_UI_ID[mongoNum];
            }
            return null; // station_6, station_5 → bỏ
        }
    }
    if (station.id != null) {
        const n = Number(station.id);
        if (!Number.isNaN(n) && n >= 1 && n <= STATION_COUNT) return n;
    }
    if (station.backend_name || station.station) {
        const name = station.backend_name || station.station;
        const loc = STATION_LOCATIONS.find(s => s.backend_name === name || s.district === name);
        if (loc) return loc.id;
    }
    return null;
}

function getStatusFromCode(code) {
    const map = { 0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL" };
    return map[code] !== undefined ? map[code] : "SAFE";
}

function updateStationCards(stationsData) {
    if (!Array.isArray(stationsData)) return;
    stationsData.forEach(station => {
        const id = getStationNumericId(station);
        if (id == null || id < 1 || id > STATION_COUNT) return;
        const card = document.getElementById(`station-card-${id}`);
        if (!card) return;
        const depthVal = document.getElementById(`depth-val-${id}`);
        const rateVal = document.getElementById(`rate-val-${id}`);
        const riskVal = document.getElementById(`risk-val-${id}`);
        if (depthVal) depthVal.textContent = Number(station.H ?? 0).toFixed(2);
        if (rateVal) rateVal.textContent = Number(station.V ?? 0).toFixed(2);
        if (riskVal) riskVal.textContent = Number(station.S_risk ?? 0).toFixed(2);
        // Cards luôn live — không forecast override
        const status = getStatusFromCode(station.code ?? 0);
        card.classList.remove("status-safe", "status-advisory", "status-warning", "status-critical");
        card.classList.add(`status-${status.toLowerCase()}`);
        const statusText = card.querySelector(".station-status-text");
        if (statusText) statusText.textContent = station.description || status;
    });
}

function initStationClickEvents() {
    for (let i = 1; i <= STATION_COUNT; i++) {
        const card = document.getElementById(`station-card-${i}`);
        if (card) card.addEventListener("click", () => selectStation(i));
    }
}

function selectStation(stationId) {
    if (stationId < 1 || stationId > STATION_COUNT) return;
    currentSelectedStationId = stationId;
    for (let i = 1; i <= STATION_COUNT; i++) {
        document.getElementById(`station-card-${i}`)?.classList.remove("station-selected");
    }
    document.getElementById(`station-card-${stationId}`)?.classList.add("station-selected");
}