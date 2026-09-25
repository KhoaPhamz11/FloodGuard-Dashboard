// File: map.js — V5.1 (Đã làm sạch cú pháp & fix logic Offline)
let mainMap = null;
let fullscreenMap = null;
let mainMarkers = {};
let fullscreenMarkers = {};
let mapsInitialized = false;

const MAP_CENTER = [106.65, 10.82];
const MAP_ZOOM_MAIN = 10;
const MAP_ZOOM_FULL = 10;

const MAP_STYLE = {
    version: 8,
    sources: {
        "esri-dark": {
            type: "raster",
            tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256
        },
        "esri-dark-labels": {
            type: "raster",
            tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256
        }
    },
    layers: [
        { id: "esri-dark-layer", type: "raster", source: "esri-dark", minzoom: 0, maxzoom: 16 },
        { id: "esri-dark-labels-layer", type: "raster", source: "esri-dark-labels", minzoom: 0, maxzoom: 16 }
    ]
};

function initMaps() {
    const mainContainer = document.getElementById("main-map");
    if (!mainContainer || mainMap) return;
    mainMap = new maplibregl.Map({
        container: "main-map", style: MAP_STYLE,
        center: MAP_CENTER, zoom: MAP_ZOOM_MAIN, attributionControl: false
    });
    mainMap.addControl(new maplibregl.NavigationControl(), "top-right");
    createMarkersForMap(mainMap, mainMarkers, "main");
    mainMap.on("load", () => {
        if (typeof createRadarLayersForMap === "function") createRadarLayersForMap(mainMap);
    });
    setTimeout(() => mainMap?.resize(), 500);
    mapsInitialized = true;
}

function initFullscreenMap() {
    const fullContainer = document.getElementById("fullscreen-map");
    if (!fullContainer) return;
    if (!fullscreenMap) {
        fullscreenMap = new maplibregl.Map({
            container: "fullscreen-map", style: MAP_STYLE,
            center: MAP_CENTER, zoom: MAP_ZOOM_FULL, attributionControl: false
        });
        fullscreenMap.addControl(new maplibregl.NavigationControl(), "top-right");
        createMarkersForMap(fullscreenMap, fullscreenMarkers, "full");
        fullscreenMap.on("load", () => {
            if (typeof createRadarLayersForMap === "function") createRadarLayersForMap(fullscreenMap);
        });
    }
    setTimeout(() => fullscreenMap?.resize(), 250);
}

function getRadarRadiusPx(zoom) {
    return "16px";
}

function updateMarkersZoom(map, markersObj) {
    if (!map || !markersObj) return;
    const radiusPx = getRadarRadiusPx(map.getZoom());
    Object.values(markersObj).forEach(marker => {
        const el = marker.getElement();
        if (el) el.style.setProperty("--radar-radius", radiusPx);
    });
}

function createMarkersForMap(map, markersObj, prefix) {
    if (typeof STATION_LOCATIONS === "undefined") return;

    STATION_LOCATIONS.forEach(loc => {
        const el = document.createElement("div");
        el.className = "map-marker-wrapper";
        el.innerHTML = `<div class="map-marker marker-safe" id="marker-${prefix}-${loc.id}"></div>`;

        const popupHTML = `
            <div class="popup-station-name">
                ${typeof getStationDisplayName === "function" ? getStationDisplayName(loc.id) : `Trạm ${loc.id}`}
                <button class="popup-arrow-btn" onclick="goToStationDetail(${loc.id})" title="Xem chi tiết">➔</button>
            </div>
            <div class="popup-district">📍 ${loc.street || ''}, ${loc.district || ''}</div>
            <div class="popup-status status-pill status-safe" id="popup-status-${prefix}-${loc.id}">An toàn</div>
            <div style="margin-top:6px;">
                <span>Cao độ nền: <b id="popup-zstreet-${prefix}-${loc.id}">--</b> m</span><br>
                <span>Mực nước ngập: <b id="popup-depth-${prefix}-${loc.id}">--</b> cm</span><br>
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

    map.on("zoom", () => updateMarkersZoom(map, markersObj));
    updateMarkersZoom(map, markersObj);
}

let forecastStationOverrides = {};

function applyForecastStationColors(forecasts) {
    forecastStationOverrides = {};
    (forecasts || []).forEach(fc => {
        const id = fc.frontend_station_id ?? resolveStationId(fc);
        if (id == null || fc.forecast_ready === false) return;
        forecastStationOverrides[Number(id)] = Number(fc.risk_code ?? 0);
    });
}

function clearForecastStationColors() {
    forecastStationOverrides = {};
}

// ===== HELPER PICKERS =====
function resolveStationId(st) {
    if (!st) return null;
    if (typeof getStationNumericId === "function") {
        const id = getStationNumericId(st);
        if (id != null && !Number.isNaN(id)) return id;
    }
    if (st.frontend_station_id != null) return Number(st.frontend_station_id);
    if (st.station_name) {
        const m = String(st.station_name).match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function pickDepthCm(station) {
    if (!station) return null;
    for (const v of [station.H, station.water_level, station.live_water_level_m]) {
        if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
}

function pickZStreet(station) {
    if (!station) return null;
    for (const v of [station.Z_street, station.ground_elevation, station.z_street]) {
        if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
}

function pickRiskScore(station) {
    if (!station) return null;
    for (const v of [station.S_risk, station.risk_score]) {
        if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
}

function updateMapMarkers(stationsData) {
    if (!stationsData) return;

    const statusLabels = {
        SAFE: "An toàn",
        ADVISORY: "Cảnh báo nhẹ",
        WARNING: "Cảnh báo",
        CRITICAL: "Nguy hiểm",
        OFFLINE: "Ngoại tuyến"
    };

    stationsData.forEach(station => {
        const id = resolveStationId(station);
        if (id == null || Number.isNaN(id)) return;

        const rawCode = Number(station.code ?? station.risk_code ?? 0);
        
        const isOffline = rawCode === -1 || 
                          String(station.status).toLowerCase() === "offline" || 
                          String(station.label).toLowerCase() === "offline";

        const effectiveCode = Object.prototype.hasOwnProperty.call(forecastStationOverrides, id)
            ? forecastStationOverrides[id]
            : rawCode;

        let status = "SAFE";
        if (isOffline && !Object.prototype.hasOwnProperty.call(forecastStationOverrides, id)) {
            status = "OFFLINE";
        } else if (typeof getStatusFromCode === "function") {
            status = getStatusFromCode(effectiveCode);
        } else {
            status = effectiveCode >= 3 ? "CRITICAL" : effectiveCode === 2 ? "WARNING" : effectiveCode === 1 ? "ADVISORY" : "SAFE";
        }

        const markerClass = `marker-${status.toLowerCase()}`;

        const zStreetVal = pickZStreet(station);
        const depthVal = pickDepthCm(station);
        const riskVal = pickRiskScore(station);

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
            if (popupZStreet) {
                popupZStreet.textContent = zStreetVal != null ? Number(zStreetVal).toFixed(2) : "--";
            }

            const popupDepth = document.getElementById(`popup-depth-${prefix}-${id}`);
            if (popupDepth) {
                popupDepth.textContent = isOffline || depthVal == null ? "--" : Number(depthVal).toFixed(2);
            }

            const popupRisk = document.getElementById(`popup-risk-${prefix}-${id}`);
            if (popupRisk) {
                popupRisk.textContent = isOffline || riskVal == null ? "--" : Number(riskVal).toFixed(2);
            }
        });
    });
}

function refreshMapSize(mapName) {
    if (mapName === "main" && mainMap) setTimeout(() => mainMap.resize(), 250);
    else if (mapName === "fullscreen" && fullscreenMap) setTimeout(() => fullscreenMap.resize(), 250);
}