// File: map.js — Module bản đồ Leaflet (MỚI trong V2)
// Hiển thị 9 trạm quan trắc trên bản đồ TP.HCM dùng OpenStreetMap tiles.
// Marker nhấp nháy nhẹ theo trạng thái (không neon, chỉ subtle pulse).

let mainMap = null;          // Bản đồ nhỏ ở Layer 1
let fullscreenMap = null;    // Bản đồ lớn ở Layer 2
let mainMarkers = {};        // { stationId: L.marker }
let fullscreenMarkers = {};
let mapsInitialized = false;

// Trung tâm bản đồ: điểm giữa giữa Củ Chi (phía bắc) và Quận 7 (phía nam)
const MAP_CENTER = [10.82, 106.65];
const MAP_ZOOM_MAIN = 11;
const MAP_ZOOM_FULL = 11;

// Tile layer URL (OpenStreetMap chuẩn, không cần API key)
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OPTIONS = {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
};

// ===== KHỞI TẠO BẢN ĐỒ NHỎ (Layer 1) =====
function initMaps() {
    const mainContainer = document.getElementById("main-map");
    if (!mainContainer || mainMap) return;  // Đã init rồi thì bỏ qua

    mainMap = L.map("main-map", {
        center: MAP_CENTER,
        zoom: MAP_ZOOM_MAIN,
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(mainMap);
    createMarkersForMap(mainMap, mainMarkers, "main");

    mapsInitialized = true;
}

// ===== KHỞI TẠO BẢN ĐỒ LỚN (Layer 2) =====
// Gọi khi user chuyển sang layer fullmap (lazy init vì container ban đầu ẩn)
function initFullscreenMap() {
    const fullContainer = document.getElementById("fullscreen-map");
    if (!fullContainer) return;

    if (!fullscreenMap) {
        fullscreenMap = L.map("fullscreen-map", {
            center: MAP_CENTER,
            zoom: MAP_ZOOM_FULL,
            zoomControl: true,
            attributionControl: false
        });

        L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(fullscreenMap);
        createMarkersForMap(fullscreenMap, fullscreenMarkers, "full");
    }

    // QUAN TRỌNG: Khi container chuyển từ display:none sang display:flex,
    // Leaflet cần recalculate kích thước, nếu không tiles sẽ bị xếp sai.
    setTimeout(() => {
        if (fullscreenMap) fullscreenMap.invalidateSize();
    }, 250);
}

// ===== TẠO MARKERS CHO 1 BẢN ĐỒ =====
function createMarkersForMap(map, markersObj, prefix) {
    if (typeof STATION_LOCATIONS === "undefined") return;

    STATION_LOCATIONS.forEach(loc => {
        // Dùng L.divIcon thay vì icon ảnh → full CSS control, nhẹ hơn
        const markerIcon = L.divIcon({
            className: "map-marker-wrapper",   // Container trong suốt
            html: `<div class="map-marker marker-safe" id="marker-${prefix}-${loc.id}"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],     // Tâm marker
            popupAnchor: [0, -10]   // Popup hiện phía trên
        });

        const marker = L.marker([loc.lat, loc.lng], { icon: markerIcon }).addTo(map);

        // Popup khi click marker
        marker.bindPopup(`
            <div class="popup-station-name">${getStationDisplayName(loc.id)}</div>
            <div class="popup-district">📍 ${loc.street}, ${loc.district}</div>
            <div class="popup-status status-pill status-safe" id="popup-status-${prefix}-${loc.id}">An toàn</div>
            <div style="margin-top:6px;">
                <span>Mực nước: <b id="popup-depth-${prefix}-${loc.id}">--</b> m</span><br>
                <span>Risk Score: <b id="popup-risk-${prefix}-${loc.id}">--</b></span>
            </div>
        `);

        markersObj[loc.id] = marker;
    });
}

// ===== CẬP NHẬT MÀU MARKER THEO STATUS (gọi mỗi giây) =====
function updateMapMarkers(stationsData) {
    if (!stationsData || !mapsInitialized) return;

    const statusLabels = {
        SAFE: "An toàn",
        ADVISORY: "Cảnh báo nhẹ",
        WARNING: "Cảnh báo",
        CRITICAL: "Nguy hiểm"
    };

    stationsData.forEach(station => {
        const id = getStationNumericId(station);
        const status = getStatusFromCode(station.code);
        const markerClass = `marker-${status.toLowerCase()}`;

        // Cập nhật cả 2 bản đồ (main + fullscreen)
        ["main", "full"].forEach(prefix => {
            // Đổi màu marker
            const markerEl = document.getElementById(`marker-${prefix}-${id}`);
            if (markerEl) {
                markerEl.className = `map-marker ${markerClass}`;
            }

            // Cập nhật nội dung popup (nếu popup đang mở thì thấy ngay)
            const popupStatus = document.getElementById(`popup-status-${prefix}-${id}`);
            if (popupStatus) {
                popupStatus.className = `popup-status status-pill status-${status.toLowerCase()}`;
                popupStatus.textContent = statusLabels[status] || status;
            }
            const popupDepth = document.getElementById(`popup-depth-${prefix}-${id}`);
            if (popupDepth) popupDepth.textContent = Number(station.H).toFixed(2);

            const popupRisk = document.getElementById(`popup-risk-${prefix}-${id}`);
            if (popupRisk) popupRisk.textContent = Number(station.S_risk).toFixed(2);
        });
    });
}

// ===== REFRESH MAP SIZE (gọi khi chuyển layer) =====
function refreshMapSize(mapName) {
    if (mapName === "main" && mainMap) {
        setTimeout(() => mainMap.invalidateSize(), 250);
    } else if (mapName === "fullscreen" && fullscreenMap) {
        setTimeout(() => fullscreenMap.invalidateSize(), 250);
    }
}

