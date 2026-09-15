// File: map.js — Module bản đồ MapLibre GL JS (MỚI trong V2)
// Thay thế Leaflet bằng MapLibre WebGL để sửa lỗi "vệt trắng" và cải thiện độ mượt
// Sử dụng bản đồ nền Esri Dark Gray (Không cần API Key)

let mainMap = null;          
let fullscreenMap = null;    
let mainMarkers = {};        
let fullscreenMarkers = {};
let mapsInitialized = false;

// Trung tâm bản đồ: [Kinh độ (lng), Vĩ độ (lat)] (Ngược với Leaflet)
const MAP_CENTER = [106.65, 10.82]; 
const MAP_ZOOM_MAIN = 10;
const MAP_ZOOM_FULL = 10;

// Esri Dark Gray Raster Style (Không cần API Key)
const MAP_STYLE = {
    "version": 8,
    "sources": {
        "esri-dark": {
            "type": "raster",
            "tiles": [
                "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            ],
            "tileSize": 256
        },
        "esri-dark-labels": {
            "type": "raster",
            "tiles": [
                "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            ],
            "tileSize": 256
        }
    },
    "layers": [
        {
            "id": "esri-dark-layer",
            "type": "raster",
            "source": "esri-dark",
            "minzoom": 0,
            "maxzoom": 16
        },
        {
            "id": "esri-dark-labels-layer",
            "type": "raster",
            "source": "esri-dark-labels",
            "minzoom": 0,
            "maxzoom": 16
        }
    ]
};

// ===== KHỞI TẠO BẢN ĐỒ NHỎ (Layer 1) =====
function initMaps() {
    const mainContainer = document.getElementById("main-map");
    if (!mainContainer || mainMap) return;

    mainMap = new maplibregl.Map({
        container: 'main-map',
        style: MAP_STYLE,
        center: MAP_CENTER,
        zoom: MAP_ZOOM_MAIN,
        attributionControl: false
    });

    mainMap.addControl(new maplibregl.NavigationControl(), 'top-right');
    createMarkersForMap(mainMap, mainMarkers, "main");
    
    mainMap.on('load', () => {
        createRadarLayersForMap(mainMap);
    });

    // Xử lý layout
    setTimeout(() => {
        if (mainMap) mainMap.resize();
    }, 500);

    mapsInitialized = true;
}

// ===== KHỞI TẠO BẢN ĐỒ LỚN (Layer 2) =====
function initFullscreenMap() {
    const fullContainer = document.getElementById("fullscreen-map");
    if (!fullContainer) return;

    if (!fullscreenMap) {
        fullscreenMap = new maplibregl.Map({
            container: 'fullscreen-map',
            style: MAP_STYLE,
            center: MAP_CENTER,
            zoom: MAP_ZOOM_FULL,
            attributionControl: false
        });

        fullscreenMap.addControl(new maplibregl.NavigationControl(), 'top-right');
        createMarkersForMap(fullscreenMap, fullscreenMarkers, "full");
        
        fullscreenMap.on('load', () => {
            createRadarLayersForMap(fullscreenMap);
        });
    }

    setTimeout(() => {
        if (fullscreenMap) fullscreenMap.resize();
    }, 250);
}

// ===== TẠO RADAR LAYERS =====
// ===== KHỞI TẠO MARKERS & RADAR SCALE =====
function getRadarRadiusPx(zoom) {
    // 1 pixel ở vĩ độ 10.82 (HCM) = 153725 / 2^zoom (mét)
    const metersPerPixel = 153725 / Math.pow(2, zoom);
    return (1000 / metersPerPixel) + "px"; // 1000m = 1km
}

function updateMarkersZoom(map, markersObj) {
    if (!map || !markersObj) return;
    const radiusPx = getRadarRadiusPx(map.getZoom());
    Object.values(markersObj).forEach(marker => {
        const el = marker.getElement();
        if (el) el.style.setProperty('--radar-radius', radiusPx);
    });
}

// ===== TẠO MARKERS =====
function createMarkersForMap(map, markersObj, prefix) {
    if (typeof STATION_LOCATIONS === "undefined") return;

    STATION_LOCATIONS.forEach(loc => {
        const el = document.createElement('div');
        el.className = 'map-marker-wrapper';
        el.innerHTML = `<div class="map-marker marker-safe" id="marker-${prefix}-${loc.id}"></div>`;

        const popupHTML = `
            <div class="popup-station-name">
                ${getStationDisplayName(loc.id)}
                <button class="popup-arrow-btn" onclick="goToStationDetail(${loc.id})" title="Xem chi tiết trạm">➔</button>
            </div>
            <div class="popup-district">📍 ${loc.street}, ${loc.district}</div>
            <div class="popup-status status-pill status-safe" id="popup-status-${prefix}-${loc.id}">An toàn</div>
            <div style="margin-top:6px;">
                <span>Cao độ nền: <b id="popup-zstreet-${prefix}-${loc.id}">--</b> cm</span><br>
                <span>Mực nước: <b id="popup-depth-${prefix}-${loc.id}">--</b> cm</span><br>
                <span>Risk Score: <b id="popup-risk-${prefix}-${loc.id}">--</b></span>
            </div>
        `;

        const popup = new maplibregl.Popup({ offset: 15, closeButton: false }).setHTML(popupHTML);

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);

        markersObj[loc.id] = marker;
    });
    
    // Lắng nghe sự kiện zoom để cập nhật CSS radar-radius (1km)
    map.on('zoom', () => updateMarkersZoom(map, markersObj));
    updateMarkersZoom(map, markersObj);
}

// ===== CẬP NHẬT MÀU MARKER THEO STATUS =====
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

        ["main", "full", "nav"].forEach(prefix => {
            const markerEl = document.getElementById(`marker-${prefix}-${id}`);
            if (markerEl) {
                markerEl.className = `map-marker ${markerClass}`;
            }

            const popupStatus = document.getElementById(`popup-status-${prefix}-${id}`);
            if (popupStatus) {
                popupStatus.className = `popup-status status-pill status-${status.toLowerCase()}`;
                popupStatus.textContent = statusLabels[status] || status;
            }
            
            const popupZStreet = document.getElementById(`popup-zstreet-${prefix}-${id}`);
            if (popupZStreet && station.Z_street !== undefined) popupZStreet.textContent = Number(station.Z_street).toFixed(2);
            
            const popupDepth = document.getElementById(`popup-depth-${prefix}-${id}`);
            if (popupDepth) popupDepth.textContent = Number(station.H).toFixed(2);

            const popupRisk = document.getElementById(`popup-risk-${prefix}-${id}`);
            if (popupRisk) popupRisk.textContent = Number(station.S_risk).toFixed(2);
        });
    });
}

// ===== REFRESH MAP SIZE =====
function refreshMapSize(mapName) {
    if (mapName === "main" && mainMap) {
        setTimeout(() => mainMap.resize(), 250);
    } else if (mapName === "fullscreen" && fullscreenMap) {
        setTimeout(() => fullscreenMap.resize(), 250);
    }
}
