// File: map.js — V5: 1 vòng pulse = đúng màu chấm trạm; forecast chỉ prefix "nav"
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
    // Vòng nhỏ quanh chấm trạm (~16px) — KHÔNG phóng 1km (trùng danger polygon)
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

/**
 * Marker HTML: CHỈ 1 chấm. Vòng pulse = CSS animation của class marker-*.
 * Không thêm .marker-pulse / .marker-ring thứ 2.
 */
function createMarkersForMap(map, markersObj, prefix) {
    if (typeof STATION_LOCATIONS === "undefined") return;

    STATION_LOCATIONS.forEach(loc => {
        const el = document.createElement("div");
        el.className = "map-marker-wrapper";
        // Một div duy nhất — pulse từ CSS box-shadow keyframes
        el.innerHTML = `<div class="map-marker marker-safe" id="marker-${prefix}-${loc.id}"></div>`;

        const popupHTML = `
            <div class="popup-station-name">
                ${getStationDisplayName(loc.id)}
                <button class="popup-arrow-btn" onclick="goToStationDetail(${loc.id})" title="Xem chi tiết">➔</button>
            </div>
            <div class="popup-district">📍 ${loc.street}, ${loc.district}</div>
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
        const id = fc.frontend_station_id;
        if (id == null || fc.forecast_ready === false) return;
        forecastStationOverrides[Number(id)] = Number(fc.risk_code ?? 0);
    });
}

function clearForecastStationColors() {
    forecastStationOverrides = {};
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

/**
 * Tô marker: màu chấm + vòng pulse CSS cùng class.
 * forecast override CHỈ prefix "nav". main/full luôn live.
 */
function updateMapMarkers(stationsData) {
    if (!stationsData) return;

    const statusLabels = {
        SAFE: "An toàn", ADVISORY: "Cảnh báo nhẹ",
        WARNING: "Cảnh báo", CRITICAL: "Nguy hiểm"
    };

    const byUiId = {};
    stationsData.forEach(station => {
        const id = typeof getStationNumericId === "function" ? getStationNumericId(station) : null;
        if (id == null || id < 1) return;
        byUiId[id] = station; // station_6 đã null → chỉ station_9
    });

    Object.keys(byUiId).forEach(idKey => {
        const id = Number(idKey);
        const station = byUiId[id];
        const liveCode = Number(station.code ?? station.risk_code ?? 0);

        ["main", "full", "nav"].forEach(prefix => {
            const useForecast = prefix === "nav"
                && Object.prototype.hasOwnProperty.call(forecastStationOverrides, id);
            const effectiveCode = useForecast ? forecastStationOverrides[id] : liveCode;
            const status = typeof getStatusFromCode === "function"
                ? getStatusFromCode(effectiveCode) : "SAFE";
            // Class duy nhất → chấm + 1 vòng pulse cùng màu (CSS keyframes)
            const markerClass = `map-marker marker-${status.toLowerCase()}`;
            const statusText = statusLabels[status] || status;

            const markerEl = document.getElementById(`marker-${prefix}-${id}`);
            if (markerEl) {
                markerEl.className = markerClass;
                // Xóa mọi ring/pulse DOM thừa (nếu bản cũ từng inject)
                markerEl.querySelectorAll(".marker-pulse, .marker-ring").forEach(n => n.remove());
            }

            const markersBag =
                prefix === "main" ? mainMarkers :
                prefix === "full" ? fullscreenMarkers :
                (typeof navMarkers !== "undefined" ? navMarkers : null);
            const markerObj = markersBag?.[id];
            if (!markerObj?.setPopup) return;

            const loc = typeof getStationLocation === "function" ? getStationLocation(id) : null;
            const displayName = typeof getStationDisplayName === "function"
                ? getStationDisplayName(id) : (loc?.backend_name || `Trạm ${id}`);
            const z = pickZStreet(station);
            const d = pickDepthCm(station);
            const r = pickRiskScore(station);

            const popupHTML = `
            <div class="popup-station-name">
                ${displayName}
                <button class="popup-arrow-btn" onclick="goToStationDetail(${id})">➔</button>
            </div>
            <div class="popup-district">📍 ${loc?.street || ""}${loc?.district ? ", " + loc.district : ""}</div>
            <div class="popup-status status-pill status-${status.toLowerCase()}">${statusText}</div>
            <div style="margin-top:6px;">
                <span>Cao độ nền: <b>${z != null ? z.toFixed(2) : "--"}</b> m</span><br>
                <span>Mực nước ngập: <b>${d != null ? d.toFixed(2) : "--"}</b> cm</span><br>
                <span>Risk Score: <b>${r != null ? r.toFixed(2) : "--"}</b></span>
            </div>`;
            markerObj.setPopup(new maplibregl.Popup({ offset: 15, closeButton: false }).setHTML(popupHTML));
        });
    });
}

function refreshMapSize(mapName) {
    if (mapName === "main" && mainMap) setTimeout(() => mainMap.resize(), 250);
    else if (mapName === "fullscreen" && fullscreenMap) setTimeout(() => fullscreenMap.resize(), 250);
}