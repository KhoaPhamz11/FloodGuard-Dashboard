// File: navigation.js — Module Dẫn đường tránh ngập & Dashboard AI
// V5 - Danger zone pulse animation + AI box redesign + forecast color sync

let navMapInstance = null;
let currentStartCoords = null;
let currentEndCoords = null;
let currentRouteGeoJSON = null;
let currentAltRouteGeoJSON = null;
let currentDangerPolygons = null;

let currentForecastRisk = 'safe';
let currentForecastReady = false;
let currentForecastDetails = null;

let lastKnownFloodData = null;
let lastKnownForecasts = null;
let navigationRiskMode = 'current';

let isFetchingAltRoute = false;
let lastDangerHash = "";
let lastFloodDataSignature = "";
const routeCache = new Map();
const altRouteCache = new Map();

const FLOOD_ALERT_RADIUS_KM = 1;
const NAV_MAP_STYLE = {
    "version": 8,
    "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    "sources": {
        "esri-dark": {
            "type": "raster",
            "tiles": ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
            "tileSize": 256
        },
        "esri-dark-labels": {
            "type": "raster",
            "tiles": ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
            "tileSize": 256
        }
    },
    "layers": [
        { "id": "esri-dark-layer", "type": "raster", "source": "esri-dark", "minzoom": 0, "maxzoom": 16 },
        { "id": "esri-dark-labels-layer", "type": "raster", "source": "esri-dark-labels", "minzoom": 0, "maxzoom": 16 }
    ]
};

let startMarker = null;
let endMarker = null;
let navMarkers = {};

// ===== Danger zone pulse animation state =====
let dangerPulseRaf = null;
let dangerPulseStart = 0;

function getStationCount() {
    return (typeof STATION_LOCATIONS !== 'undefined' && STATION_LOCATIONS.length) ? STATION_LOCATIONS.length : 7;
}

function resolveStationId(st) {
    if (typeof getStationNumericId === 'function') {
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

function getCuchiLngLat() {
    if (typeof STATION_LOCATIONS !== 'undefined') {
        const c = STATION_LOCATIONS.find(s => s.backend_name === 'Củ Chi' || s.id === 6);
        if (c) return [c.lng, c.lat];
    }
    return [106.512778, 10.955556];
}

function nearestDailyStation(lng, lat) {
    if (typeof STATION_LOCATIONS === 'undefined') return null;
    const dailies = STATION_LOCATIONS.filter(s => (s.model || 'daily') === 'daily');
    if (!dailies.length) return null;
    let best = null;
    let bestD = Infinity;
    dailies.forEach(s => {
        const d = turf.distance([lng, lat], [s.lng, s.lat], { units: 'kilometers' });
        if (d < bestD) { bestD = d; best = s; }
    });
    return best;
}

function nearestPointOnRouteToStation(routeFeature, stationLngLat) {
    const target = turf.point(stationLngLat);
    let nearest = routeFeature.geometry.coordinates[0];
    let nearestDistance = Infinity;
    routeFeature.geometry.coordinates.forEach(coord => {
        const distance = turf.distance(target, turf.point(coord), { units: 'kilometers' });
        if (distance < nearestDistance) { nearest = coord; nearestDistance = distance; }
    });
    return nearest;
}

function hexToRgba(hex, alpha = 1) {
    const h = String(hex).replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ===== Popup =====
function updateMarkerPopup(marker, stationId, isForecast, code, color, statusText) {
    const popup = marker.getPopup();
    if (!popup) return;

    const loc = typeof getStationLocation === 'function' ? getStationLocation(stationId) : STATION_LOCATIONS?.find(l => l.id === stationId);
    const stationName = loc?.backend_name || loc?.name || `Trạm ${stationId}`;
    const address = loc?.address || loc?.street || 'TP. Hồ Chí Minh';

    let popupHtml = '';

    if (isForecast) {
        const fc = lastKnownForecasts?.find(f => (f.frontend_station_id || resolveStationId(f)) === stationId);
        const predWl = fc?.predicted_water_level ?? fc?.predWaterLevel ?? (currentForecastDetails?.predWaterLevel || '—');

        popupHtml = `
            <div style="padding:8px 10px;min-width:210px;font-family:system-ui,sans-serif;">
                <div style="font-weight:700;font-size:14px;color:#f1f5f9;margin-bottom:2px;">${stationName}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">📍 ${address}</div>
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}55;margin-bottom:10px;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};"></span>
                    AI 24h · ${statusText}
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.7;">
                    <div>Mực nước dự báo: <b style="color:#f8fafc;">${predWl} m</b></div>
                    <div>Risk code: <b style="color:${color};">${code}</b></div>
                </div>
            </div>
        `;
    } else {
        const st = lastKnownFloodData?.stations_data?.find(s => resolveStationId(s) === stationId);
        const wl = st?.water_level != null ? `${st.water_level} cm` : (st?.H != null ? `${st.H} cm` : '—');
        const ground = loc?.ground_elevation ? `${loc.ground_elevation} m` : '—';
        const riskScore = st?.risk_score != null ? st.risk_score : (st?.S_risk != null ? st.S_risk : '—');

        popupHtml = `
            <div style="padding:8px 10px;min-width:210px;font-family:system-ui,sans-serif;">
                <div style="font-weight:700;font-size:14px;color:#f1f5f9;margin-bottom:2px;">${stationName}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">📍 ${address}</div>
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}55;margin-bottom:10px;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>
                    ${statusText}
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.7;">
                    <div>Cao độ nền: <b style="color:#f8fafc;">${ground}</b></div>
                    <div>Mực nước: <b style="color:#f8fafc;">${wl}</b></div>
                    <div>Risk Score: <b style="color:#f8fafc;">${riskScore}</b></div>
                </div>
            </div>
        `;
    }

    popup.setHTML(popupHtml);
}

// ===== Marker colors (nav) + sync with map.js overrides =====
function updateNavMapStationMarkers() {
    if (!navMapInstance || !navMarkers) return;

    const isForecast = (navigationRiskMode === 'forecast');

    console.log(`%c[DEBUG MARKERS] ${isForecast ? '🤖 FORECAST' : '📊 CURRENT'}`,
        `color:${isForecast ? '#4dabf7' : '#00E676'};font-weight:bold;`);

    Object.keys(navMarkers).forEach(idKey => {
        const id = Number(idKey);
        const marker = navMarkers[idKey];
        if (!marker) return;

        let code = 0;
        let statusText = 'An toàn';
        let color = '#28a745';
        let branchUsed = 'None';

        if (isForecast && lastKnownForecasts) {
            branchUsed = 'AI Forecast';
            const fc = lastKnownForecasts.find(f => (f.frontend_station_id || resolveStationId(f)) === id);
            if (fc) {
                code = fc.risk_code ?? 0;
                color = code >= 3 ? '#e53935' : code === 2 ? '#ef6c00' : code === 1 ? '#fbc02d' : '#28a745';
                statusText = code >= 3 ? 'Nguy hiểm' : code === 2 ? 'Ngập nặng' : code === 1 ? 'Ngập nhẹ' : 'An toàn';
            }
        } else if (lastKnownFloodData?.stations_data) {
            branchUsed = 'Current Data';
            const st = lastKnownFloodData.stations_data.find(s => resolveStationId(s) === id);
            if (st) {
                code = st.code ?? 0;
                color = code >= 3 ? '#e53935' : code === 2 ? '#ef6c00' : code === 1 ? '#fbc02d' : '#28a745';
                statusText = st.status || (code >= 3 ? 'Nguy hiểm' : 'An toàn');
            }
        }

        console.log(` → Trạm ${id} | ${branchUsed} | code=${code} | ${statusText} | %c${color}`, `color:${color};font-weight:bold`);

        const markerEl = marker.getElement();
        if (markerEl) {
            // Đồng bộ CSS class của map.js (marker-critical / marker-safe ...)
            const mapMarker = markerEl.querySelector('.map-marker') || markerEl;
            if (mapMarker) {
                const statusClass = code >= 3 ? 'marker-critical' : code === 2 ? 'marker-warning' : code === 1 ? 'marker-advisory' : 'marker-safe';
                mapMarker.className = `map-marker ${statusClass}`;
            }

            // Fallback inline style cho các element pulse cũ (nếu còn)
            const dot = markerEl.querySelector('.marker-dot') || markerEl.querySelector('.dot');
            if (dot) {
                dot.style.backgroundColor = color;
                dot.style.borderColor = '#ffffff';
            }

            const pulses = markerEl.querySelectorAll('.marker-pulse, .marker-ring');
            pulses.forEach((p, index) => {
                if (index === 0) {
                    p.style.borderColor = color;
                    p.style.backgroundColor = 'transparent';
                    p.style.display = (code >= 1) ? 'block' : 'none';
                    p.style.setProperty('--pulse-color', color);
                    p.style.boxShadow = `0 0 0 0 ${hexToRgba(color, 0.55)}`;
                } else {
                    p.style.display = 'none';
                }
            });
        }

        updateMarkerPopup(marker, id, isForecast, code, color, statusText);
    });
}

// ===== Danger polygons + pulse animation =====
function stopDangerPulse() {
    if (dangerPulseRaf) {
        cancelAnimationFrame(dangerPulseRaf);
        dangerPulseRaf = null;
    }
}

function startDangerPulse() {
    stopDangerPulse();
    if (!navMapInstance || !navMapInstance.getLayer('nav-danger-zones-layer')) return;
    if (!currentDangerPolygons || currentDangerPolygons.features.length === 0) {
        // reset opacity
        try {
            navMapInstance.setPaintProperty('nav-danger-zones-layer', 'fill-opacity', 0.18);
            if (navMapInstance.getLayer('nav-danger-zones-outline')) {
                navMapInstance.setPaintProperty('nav-danger-zones-outline', 'line-opacity', 0.55);
            }
        } catch (_) {}
        return;
    }

    dangerPulseStart = performance.now();

    const tick = (now) => {
        if (!navMapInstance || !navMapInstance.getLayer('nav-danger-zones-layer')) {
            dangerPulseRaf = null;
            return;
        }
        // Chu kỳ ~2.2s, opacity dao động 0.10 → 0.28
        const t = ((now - dangerPulseStart) % 2200) / 2200;
        const wave = 0.5 - 0.5 * Math.cos(t * Math.PI * 2); // 0→1→0
        const fillOp = 0.10 + wave * 0.18;
        const outlineOp = 0.35 + wave * 0.40;

        try {
            navMapInstance.setPaintProperty('nav-danger-zones-layer', 'fill-opacity', fillOp);
            if (navMapInstance.getLayer('nav-danger-zones-outline')) {
                navMapInstance.setPaintProperty('nav-danger-zones-outline', 'line-opacity', outlineOp);
                // scale nhẹ đường viền
                navMapInstance.setPaintProperty('nav-danger-zones-outline', 'line-width', 1.5 + wave * 2.5);
            }
        } catch (_) {}

        dangerPulseRaf = requestAnimationFrame(tick);
    };

    dangerPulseRaf = requestAnimationFrame(tick);
}

function refreshDangerPolygons() {
    if (!navMapInstance || !navMapInstance.loaded()) return;
    const dangerFeatures = [];
    const maxId = getStationCount();
    const seenStations = new Set();

    if (navigationRiskMode === 'forecast' && lastKnownForecasts) {
        lastKnownForecasts.forEach(fc => {
            const id = fc.frontend_station_id || resolveStationId(fc);
            if (id == null || id < 1 || id > maxId || seenStations.has(id)) return;

            const code = fc.risk_code ?? 0;
            if (code === 0) return;

            seenStations.add(id);
            const status = code >= 3 ? 'CRITICAL' : (code === 2 ? 'WARNING' : 'ADVISORY');
            const loc = typeof getStationLocation === 'function' ? getStationLocation(id) : STATION_LOCATIONS?.find(l => l.id === id);
            if (!loc) return;

            const point = turf.point([loc.lng, loc.lat]);
            const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers', steps: 48 });
            buffer.properties = { status, riskLevel: code, stationId: id };
            dangerFeatures.push(buffer);
        });
    } else if (navigationRiskMode === 'current' && lastKnownFloodData?.stations_data) {
        lastKnownFloodData.stations_data.forEach(st => {
            const id = resolveStationId(st);
            if (id == null || id < 1 || id > maxId || seenStations.has(id)) return;

            const code = st.code ?? 0;
            const status = (st.status === 'Nguy hiểm' || code >= 3) ? 'CRITICAL'
                : code === 2 ? 'WARNING'
                : code === 1 ? 'ADVISORY'
                : 'SAFE';
            if (status === 'SAFE') return;

            seenStations.add(id);
            const loc = typeof getStationLocation === 'function' ? getStationLocation(id) : STATION_LOCATIONS?.find(l => l.id === id);
            if (!loc) return;

            const point = turf.point([loc.lng, loc.lat]);
            const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers', steps: 48 });
            buffer.properties = { status, riskLevel: code, stationId: id };
            dangerFeatures.push(buffer);
        });
    }

    currentDangerPolygons = turf.featureCollection(dangerFeatures);

    if (navMapInstance.getSource('nav-danger-zones-source')) {
        navMapInstance.getSource('nav-danger-zones-source').setData(currentDangerPolygons);
    }

    // Bắt đầu / dừng pulse
    if (dangerFeatures.length > 0) {
        startDangerPulse();
    } else {
        stopDangerPulse();
    }
}

function initNavigationMap() {
    if (navMapInstance) {
        navMapInstance.resize();
        return;
    }

    navMapInstance = new maplibregl.Map({
        container: 'navigation-map',
        style: NAV_MAP_STYLE,
        center: [106.6870, 10.7930],
        zoom: 12,
        attributionControl: false
    });

    navMapInstance.on('load', () => {
        navMapInstance.addSource('nav-danger-zones-source', {
            type: 'geojson',
            data: turf.featureCollection([])
        });

        // Fill chính
        navMapInstance.addLayer({
            id: 'nav-danger-zones-layer',
            type: 'fill',
            source: 'nav-danger-zones-source',
            paint: {
                'fill-color': [
                    'match', ['get', 'status'],
                    'CRITICAL', '#e53935',
                    'WARNING', '#ef6c00',
                    'ADVISORY', '#fbc02d',
                    'transparent'
                ],
                'fill-opacity': 0.18
            }
        });

        // Outline pulse (viền toả ra)
        navMapInstance.addLayer({
            id: 'nav-danger-zones-outline',
            type: 'line',
            source: 'nav-danger-zones-source',
            paint: {
                'line-color': [
                    'match', ['get', 'status'],
                    'CRITICAL', '#e53935',
                    'WARNING', '#ef6c00',
                    'ADVISORY', '#fbc02d',
                    'transparent'
                ],
                'line-width': 2,
                'line-opacity': 0.55,
                'line-blur': 1.5
            }
        });

        navMapInstance.addSource('nav-route-source', { type: 'geojson', data: turf.featureCollection([]) });
        navMapInstance.addLayer({
            id: 'nav-route-safe-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#007aff', 'line-width': 6 }, filter: ['==', 'risk', 'safe']
        });
        navMapInstance.addLayer({
            id: 'nav-route-advisory-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#fbc02d', 'line-width': 6 }, filter: ['==', 'risk', 'ADVISORY']
        });
        navMapInstance.addLayer({
            id: 'nav-route-warning-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ef6c00', 'line-width': 6 }, filter: ['==', 'risk', 'WARNING']
        });
        navMapInstance.addLayer({
            id: 'nav-route-danger-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#e53935', 'line-width': 6 }, filter: ['==', 'risk', 'CRITICAL']
        });

        navMapInstance.addSource('nav-alt-route-source', { type: 'geojson', data: turf.featureCollection([]) });
        navMapInstance.addLayer({
            id: 'nav-alt-route-layer', type: 'line', source: 'nav-alt-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00E676', 'line-width': 6 }
        });

        if (typeof createMarkersForMap === 'function') {
            createMarkersForMap(navMapInstance, navMarkers, 'nav');
        }

        if (lastKnownFloodData) {
            updateNavigationFloodData(lastKnownFloodData);
        }
    });
}

window.updateNavigationFloodData = function (latestData) {
    if (!latestData || !latestData.stations_data || typeof STATION_LOCATIONS === 'undefined') return;

    const currentSignature = latestData.stations_data
        .map(st => `${st.frontend_station_id || st.station_name}_${st.code}_${st.status}`)
        .sort().join('|') + `_${navigationRiskMode}`;

    if (currentSignature === lastFloodDataSignature) return;

    lastFloodDataSignature = currentSignature;
    lastKnownFloodData = latestData;

    const navLayer = document.getElementById('layer-navigation');
    const isNavLayerActive = navLayer && navLayer.classList.contains('layer-active');
    if (!isNavLayerActive || !navMapInstance || !navMapInstance.loaded()) return;

    // Chỉ cập nhật danger + marker theo live khi đang ở mode current
    if (navigationRiskMode === 'current') {
        if (typeof clearForecastStationColors === 'function') clearForecastStationColors();
        if (typeof updateMapMarkers === 'function') updateMapMarkers(latestData.stations_data);
    }

    refreshDangerPolygons();
    updateNavMapStationMarkers();

    if (currentRouteGeoJSON) {
        analyzeFloodRoute();
    }
};

// ===== AI Forecast UI box (redesigned) =====
function getForecastUI() {
    if (navigationRiskMode !== 'forecast' || !currentForecastDetails) return '';

    const wl = currentForecastDetails.predWaterLevel;
    const riskCode = currentForecastDetails.riskCode;
    const riskLevel = currentForecastDetails.riskLevel;
    const station = currentForecastDetails.station || '—';

    let riskColor = '#22c55e';
    let riskText = 'An toàn';
    let riskBg = 'rgba(34,197,94,0.12)';
    let riskBorder = 'rgba(34,197,94,0.35)';

    if (riskCode >= 3 || riskLevel === 'CRITICAL') {
        riskColor = '#ef4444'; riskText = 'Nguy hiểm';
        riskBg = 'rgba(239,68,68,0.14)'; riskBorder = 'rgba(239,68,68,0.4)';
    } else if (riskCode === 2 || riskLevel === 'WARNING') {
        riskColor = '#f97316'; riskText = 'Ngập nặng';
        riskBg = 'rgba(249,115,22,0.14)'; riskBorder = 'rgba(249,115,22,0.4)';
    } else if (riskCode === 1 || riskLevel === 'ADVISORY') {
        riskColor = '#eab308'; riskText = 'Ngập nhẹ';
        riskBg = 'rgba(234,179,8,0.14)'; riskBorder = 'rgba(234,179,8,0.4)';
    }

    return `
        <div style="
            margin-top:14px;
            padding:14px 14px 12px;
            background: linear-gradient(145deg, rgba(15,23,42,0.92), rgba(30,41,59,0.88));
            border: 1px solid rgba(148,163,184,0.18);
            border-radius: 12px;
            box-shadow: 0 8px 24px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
            backdrop-filter: blur(8px);
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="
                        width:28px;height:28px;border-radius:8px;
                        background: linear-gradient(135deg, ${riskColor}33, ${riskColor}11);
                        border:1px solid ${riskColor}44;
                        display:flex;align-items:center;justify-content:center;
                    ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${riskColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2z" opacity="0.3"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:600;color:#e2e8f0;letter-spacing:0.3px;">Phân tích AI · 24h</div>
                        <div style="font-size:10px;color:#64748b;margin-top:1px;">Trạm ${station}</div>
                    </div>
                </div>
                <div style="
                    padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;
                    color:${riskColor};background:${riskBg};border:1px solid ${riskBorder};
                ">${riskText}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="
                    background:rgba(15,23,42,0.55);border-radius:9px;padding:10px 12px;
                    border:1px solid rgba(148,163,184,0.1);
                ">
                    <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;">Mực nước đỉnh</div>
                    <div style="font-size:18px;font-weight:700;color:#f8fafc;letter-spacing:-0.3px;">
                        ${wl}<span style="font-size:12px;font-weight:500;color:#64748b;margin-left:3px;">m</span>
                    </div>
                </div>
                <div style="
                    background:rgba(15,23,42,0.55);border-radius:9px;padding:10px 12px;
                    border:1px solid rgba(148,163,184,0.1);border-left:3px solid ${riskColor};
                ">
                    <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;">Mức cảnh báo</div>
                    <div style="font-size:15px;font-weight:700;color:${riskColor};display:flex;align-items:center;gap:6px;">
                        <span style="width:7px;height:7px;border-radius:50%;background:${riskColor};box-shadow:0 0 8px ${riskColor};"></span>
                        ${riskText}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function analyzeFloodRoute() {
    if (!currentRouteGeoJSON) return;

    const routeCoords = currentRouteGeoJSON.geometry.coordinates;
    const routeLine = turf.lineString(routeCoords);

    let routeRisk = 'safe';
    if (navigationRiskMode === 'current') {
        const routeHits = (currentDangerPolygons?.features || []).filter(zone =>
            turf.booleanIntersects(routeLine, zone)
        );
        const maxCode = routeHits.reduce((max, zone) => Math.max(max, Number(zone.properties?.riskLevel || 0)), 0);
        routeRisk = typeof getStatusFromCode === 'function'
            ? getStatusFromCode(maxCode)
            : (maxCode >= 3 ? 'CRITICAL' : maxCode === 2 ? 'WARNING' : maxCode === 1 ? 'ADVISORY' : 'SAFE');
        if (routeRisk === 'SAFE') routeRisk = 'safe';
    } else if (currentForecastReady) {
        routeRisk = currentForecastRisk;
    }

    if (navMapInstance && navMapInstance.getLayer('nav-route-danger-layer')) {
        const dangerColor = (navigationRiskMode === 'forecast') ? '#ef6c00' : '#e53935';
        navMapInstance.setPaintProperty('nav-route-danger-layer', 'line-color', dangerColor);
    }

    const segments = [turf.feature(routeLine.geometry, { risk: routeRisk })];
    if (navMapInstance.getSource('nav-route-source')) {
        navMapInstance.getSource('nav-route-source').setData(turf.featureCollection(segments));
    }

    const hasCritical = segments.some(s => s.properties.risk === 'CRITICAL');
    const hasWarning = segments.some(s => s.properties.risk === 'WARNING');
    const hasAdvisory = segments.some(s => s.properties.risk === 'ADVISORY');
    const statusEl = document.getElementById('nav-summary-status');
    if (!statusEl) return;

    if (hasCritical) {
        const currentHash = JSON.stringify(currentDangerPolygons) + navigationRiskMode;
        if (!isFetchingAltRoute && lastDangerHash !== currentHash) {
            statusEl.className = 'nav-summary-status danger';
            statusEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:#fca5a5;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" style="animation:spin 1.2s linear infinite;flex-shrink:0;">
                        <style>@keyframes spin{100%{transform:rotate(360deg)}}</style>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span>Nguy cơ ngập nghiêm trọng · Đang tìm đường vòng…</span>
                </div>
                ${getForecastUI()}
            `;
            fetchSafeAlternativeRoute(currentHash);
        }
    } else if (hasWarning) {
        lastDangerHash = "";
        statusEl.className = 'nav-summary-status warning';
        statusEl.innerHTML = `
            <div style="font-size:13.5px;display:flex;align-items:center;gap:7px;">
                <span style="color:#f97316;font-size:15px;">⚠</span>
                <span>Có cảnh báo ngập nặng trên tuyến</span>
            </div>
            ${getForecastUI()}
        `;
        clearAltRoute();
    } else if (hasAdvisory) {
        lastDangerHash = "";
        statusEl.className = 'nav-summary-status advisory';
        statusEl.innerHTML = `
            <div style="font-size:13.5px;display:flex;align-items:center;gap:7px;">
                <span style="color:#eab308;font-size:15px;">⚠</span>
                <span>Có cảnh báo ngập nhẹ trên tuyến</span>
            </div>
            ${getForecastUI()}
        `;
        clearAltRoute();
    } else {
        lastDangerHash = "";
        statusEl.className = 'nav-summary-status safe';
        statusEl.innerHTML = `
            <div style="font-size:13.5px;display:flex;align-items:center;gap:7px;">
                <span style="color:#22c55e;font-size:15px;">✓</span>
                <span>Lộ trình an toàn</span>
            </div>
            ${getForecastUI()}
        `;
        clearAltRoute();
    }
    const panel = document.getElementById('nav-summary-panel');
    if (panel) panel.style.display = 'block';
}

function clearAltRoute() {
    currentAltRouteGeoJSON = null;
    if (navMapInstance?.getSource('nav-alt-route-source')) {
        navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([]));
    }
    renderAllRouteLabels();

    if (currentRouteGeoJSON?.properties?.segments?.[0]) {
        const props = currentRouteGeoJSON.properties.segments[0];
        const distKm = (props.distance / 1000).toFixed(1);
        const timeMin = Math.round(props.duration / 60);
        const distEl = document.getElementById('nav-summary-dist');
        const timeEl = document.getElementById('nav-summary-time');
        if (distEl) distEl.innerText = `${distKm} km`;
        if (timeEl) timeEl.innerText = `${timeMin} phút`;
    }
}

async function fetchSafeAlternativeRoute(currentHash) {
    if (!currentStartCoords || !currentEndCoords || !currentDangerPolygons || currentDangerPolygons.features.length === 0) return;

    isFetchingAltRoute = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const criticalPolygons = currentDangerPolygons.features.filter(
            f => f.properties.riskLevel >= 3 || f.properties.status === 'CRITICAL'
        );
        if (criticalPolygons.length === 0) {
            isFetchingAltRoute = false;
            return;
        }

        const cacheKey = JSON.stringify({
            start: currentStartCoords,
            end: currentEndCoords,
            avoid: criticalPolygons.map(f => f.geometry.coordinates)
        });

        let data;
        if (altRouteCache.has(cacheKey)) {
            data = altRouteCache.get(cacheKey);
        } else {
            const res = await fetch('/api/navigation/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    start: currentStartCoords,
                    end: currentEndCoords,
                    avoid_polygons: {
                        type: 'MultiPolygon',
                        coordinates: criticalPolygons.map(f => f.geometry.coordinates)
                    }
                })
            });
            if (res.status === 403) throw new Error('API_RATE_LIMIT');
            if (!res.ok) throw new Error('NO_ROUTE_FOUND');
            data = await res.json();
            if (!data.features || data.features.length === 0) throw new Error('NO_ROUTE_FOUND');
            altRouteCache.set(cacheKey, data);
        }

        clearTimeout(timeoutId);

        const routeFeature = data.features[0];
        currentAltRouteGeoJSON = routeFeature;

        if (navMapInstance.getSource('nav-alt-route-source')) {
            navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([routeFeature]));
        }

        renderAllRouteLabels();

        const props = routeFeature.properties;
        const distKm = (props.segments[0].distance / 1000).toFixed(1);
        const timeMin = Math.round(props.segments[0].duration / 60);

        const distEl = document.getElementById('nav-summary-dist');
        const timeEl = document.getElementById('nav-summary-time');
        if (distEl) distEl.innerText = `${distKm} km`;
        if (timeEl) timeEl.innerText = `${timeMin} phút`;

        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="font-size:13.5px;display:flex;align-items:center;gap:7px;">
                    <span style="color:#22c55e;font-size:15px;">✓</span>
                    <span>Đã tìm lộ trình vòng tránh ngập <strong style="color:#4ade80;">(xanh)</strong> · ${distKm} km · ${timeMin} phút</span>
                </div>
                ${getForecastUI()}
            `;
            statusEl.className = 'nav-summary-status safe';
        }
        lastDangerHash = currentHash;

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Lỗi lộ trình thay thế:', e);
        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.className = 'nav-summary-status danger';
            if (e.name === 'AbortError') {
                statusEl.innerHTML = '<div style="font-size:13.5px;"><span style="color:#ef4444;">⛔</span> Quá thời gian chờ. Không tìm được tuyến thay thế.</div>';
            } else if (e.message === 'API_RATE_LIMIT') {
                statusEl.innerHTML = '<div style="font-size:13.5px;"><span style="color:#ef4444;">⛔</span> Hệ thống đang quá tải. Thử lại sau.</div>';
            } else {
                statusEl.innerHTML = '<div style="font-size:13.5px;"><span style="color:#ef4444;">⛔</span> Ngập diện rộng. Không tìm được tuyến vòng an toàn.</div>';
            }
        }
    } finally {
        isFetchingAltRoute = false;
    }
}

async function fetchRoute() {
    if (!currentStartCoords || !currentEndCoords) return;

    const cacheKey = JSON.stringify({ start: currentStartCoords, end: currentEndCoords });

    try {
        let data;
        if (routeCache.has(cacheKey)) {
            data = routeCache.get(cacheKey);
        } else {
            const res = await fetch('/api/navigation/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: currentStartCoords, end: currentEndCoords })
            });
            if (!res.ok) throw new Error('Routing failed');
            data = await res.json();
            routeCache.set(cacheKey, data);
        }

        const routeFeature = data.features[0];
        currentRouteGeoJSON = routeFeature;
        currentAltRouteGeoJSON = null;

        await updateRouteForecast(routeFeature);
        clearAltRoute();
        renderAllRouteLabels();

        const props = routeFeature.properties;
        const distKm = (props.segments[0].distance / 1000).toFixed(1);
        const timeMin = Math.round(props.segments[0].duration / 60);
        const distEl = document.getElementById('nav-summary-dist');
        const timeEl = document.getElementById('nav-summary-time');
        if (distEl) distEl.innerText = `${distKm} km`;
        if (timeEl) timeEl.innerText = `${timeMin} phút`;

        analyzeFloodRoute();

        const bbox = turf.bbox(currentRouteGeoJSON);
        navMapInstance.fitBounds(bbox, {
            padding: { top: 200, bottom: 150, left: 350, right: 50 },
            duration: 1000
        });
    } catch (e) {
        console.error('Lỗi lấy lộ trình:', e);
        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.className = 'nav-summary-status danger';
            statusEl.innerHTML = '<span style="color:#ef4444;">⚠</span> Lỗi lấy lộ trình. Kiểm tra API.';
            const panel = document.getElementById('nav-summary-panel');
            if (panel) panel.style.display = 'block';
        }
    }
}

async function updateRouteForecast(routeFeature) {
    const statusEl = document.getElementById('nav-summary-status');
    const panel = document.getElementById('nav-summary-panel');

    if (statusEl && navigationRiskMode === 'forecast') {
        statusEl.className = 'nav-summary-status advisory';
        statusEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" style="animation:spin 1s linear infinite;">
                    <style>@keyframes spin{100%{transform:rotate(360deg)}}</style>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span style="color:#e2e8f0;font-weight:500;font-size:13.5px;">AI đang phân tích rủi ro ngập…</span>
            </div>
        `;
        if (panel) panel.style.display = 'block';
    }

    const applyCurrentRouteMode = (message) => {
        navigationRiskMode = 'current';
        if (riskModeInput) riskModeInput.checked = false;
        currentForecastReady = false;
        currentForecastRisk = 'safe';
        currentForecastDetails = null;

        if (typeof clearForecastStationColors === 'function') clearForecastStationColors();
        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }

        refreshDangerPolygons();
        updateNavMapStationMarkers();

        if (statusEl) {
            statusEl.className = 'nav-summary-status advisory';
            statusEl.innerHTML = `<span style="color:#94a3b8;">ℹ</span> ${message}`;
        }
        analyzeFloodRoute();
    };

    if (navigationRiskMode === 'current') {
        applyCurrentRouteMode('Đang dùng tình trạng ngập hiện tại từ hệ thống quan trắc.');
        return;
    }

    const horizon = 24;
    try {
        if (typeof fetchStationForecasts === 'function') {
            const stationForecasts = await fetchStationForecasts({ horizon });
            lastKnownForecasts = stationForecasts.forecasts || stationForecasts;

            // ★ Đồng bộ màu marker nhỏ với forecast
            if (typeof applyForecastStationColors === 'function') {
                applyForecastStationColors(lastKnownForecasts);
            }
            if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
                updateMapMarkers(lastKnownFloodData.stations_data);
            }

            refreshDangerPolygons();
            updateNavMapStationMarkers();
        }

        const midIdx = Math.floor(routeFeature.geometry.coordinates.length / 2);
        const mid = routeFeature.geometry.coordinates[midIdx];
        const nearestStation = nearestDailyStation(mid[0], mid[1]);
        const anchorLngLat = nearestStation ? [nearestStation.lng, nearestStation.lat] : getCuchiLngLat();
        const nearestOnRoute = nearestPointOnRouteToStation(routeFeature, anchorLngLat);

        if (typeof fetchForecast !== 'function') {
            applyCurrentRouteMode('API dự báo chưa sẵn sàng; đang dùng tình trạng hiện tại.');
            return;
        }

        const result = await fetchForecast({ latitude: nearestOnRoute[1], longitude: nearestOnRoute[0], horizons: [horizon] });

        const modelLabel = result.model === 'hourly' ? 'Hourly Củ Chi' : `Daily (${result.station || nearestStation?.backend_name || '—'})`;
        currentForecastReady = Boolean(result.forecast_ready);

        let forecastRisk = 'SAFE';
        if (result.risk_code >= 3 || result.risk_level === 'CRITICAL') {
            forecastRisk = 'CRITICAL';
        } else if (result.risk_code === 2 || result.risk_level === 'WARNING') {
            forecastRisk = 'WARNING';
        } else if (result.risk_code === 1 || result.risk_level === 'ADVISORY') {
            forecastRisk = 'ADVISORY';
        }
        currentForecastRisk = forecastRisk === 'SAFE' ? 'safe' : forecastRisk;

        let predWaterLevel = null;
        if (result.model === 'hourly' && Array.isArray(result.forecasts) && result.forecasts.length > 0) {
            predWaterLevel = result.forecasts[0].predicted_water_level;
        } else if (result.model === 'daily' && result.forecast) {
            predWaterLevel = result.forecast.predicted_water_level;
        } else if (result.predicted_water_level != null) {
            predWaterLevel = result.predicted_water_level;
        }

        currentForecastDetails = {
            station: result.station || nearestStation?.backend_name || '—',
            predWaterLevel: predWaterLevel != null ? Number(predWaterLevel).toFixed(2) : '—',
            riskLevel: forecastRisk,
            riskCode: result.risk_code ?? (forecastRisk === 'CRITICAL' ? 3 : forecastRisk === 'WARNING' ? 2 : forecastRisk === 'ADVISORY' ? 1 : 0),
            model: modelLabel
        };

        if (result.model_status === 'unavailable' || !result.forecast_ready) {
            applyCurrentRouteMode('Không có dữ liệu dự báo; đang dùng tình trạng hiện tại.');
            return;
        }

        analyzeFloodRoute();
    } catch (error) {
        console.error('Route forecast error:', error);
        applyCurrentRouteMode('Mốc ngoài dữ liệu dự báo; đang dùng tình trạng hiện tại.');
    }
}

function renderAllRouteLabels() {
    if (typeof routeLabelMarkers === 'undefined') window.routeLabelMarkers = [];
    window.routeLabelMarkers.forEach(m => m.remove());
    window.routeLabelMarkers = [];

    const routesToRender = [];
    if (currentRouteGeoJSON) routesToRender.push(currentRouteGeoJSON);
    if (currentAltRouteGeoJSON) routesToRender.push(currentAltRouteGeoJSON);

    routesToRender.forEach(routeFeature => {
        const steps = routeFeature.properties?.segments?.[0]?.steps;
        const coords = routeFeature.geometry.coordinates;
        if (!steps) return;

        steps.forEach(step => {
            if (!step.name || step.name === '-' || !step.way_points) return;
            const startIdx = step.way_points[0];
            const endIdx = step.way_points[1];
            const stepCoords = coords.slice(startIdx, endIdx + 1);
            if (stepCoords.length <= 1) return;

            const line = turf.lineString(stepCoords);
            const length = turf.length(line);
            const midPoint = turf.along(line, length / 2).geometry.coordinates;

            let bearing = 0;
            if (length > 0.01) {
                const p1 = turf.along(line, Math.max(0, length / 2 - 0.005)).geometry.coordinates;
                const p2 = turf.along(line, Math.min(length, length / 2 + 0.005)).geometry.coordinates;
                bearing = turf.bearing(turf.point(p1), turf.point(p2));
            }
            let rotation = bearing - 90;
            if (rotation > 90 || rotation < -90) rotation += 180;

            const el = document.createElement('div');
            el.innerText = step.name;
            el.style.cssText = 'color:#fff;font-size:12px;font-weight:bold;text-shadow:0 0 4px #000,0 0 4px #000;pointer-events:none;white-space:nowrap;transform:translate(-50%,-50%)';

            const marker = new maplibregl.Marker({ element: el, rotation, rotationAlignment: 'map', pitchAlignment: 'map' })
                .setLngLat(midPoint).addTo(navMapInstance);
            window.routeLabelMarkers.push(marker);
        });
    });
}

let geocodeTimeout = null;
async function handleGeocode(inputId, suggId, setCoordsCallback) {
    const text = document.getElementById(inputId).value;
    const suggEl = document.getElementById(suggId);
    if (text.length < 3) { suggEl.style.display = 'none'; return; }

    clearTimeout(geocodeTimeout);
    geocodeTimeout = setTimeout(async () => {
        try {
            suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#8892b0;">⏳ Đang tìm kiếm...</div>';
            suggEl.style.display = 'block';
            const res = await fetch(`/api/navigation/geocode?text=${encodeURIComponent(text)}`);
            if (!res.ok) { suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#e53935;">⚠️ Lỗi API.</div>'; return; }
            const data = await res.json();
            suggEl.innerHTML = '';
            if (!data.features || data.features.length === 0) {
                suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#8892b0;">Không tìm thấy kết quả</div>'; return;
            }
            data.features.forEach(f => {
                const item = document.createElement('div');
                item.className = 'nav-suggestion-item';
                item.innerText = f.properties.label || f.properties.name;
                item.onclick = () => {
                    document.getElementById(inputId).value = item.innerText;
                    suggEl.style.display = 'none';
                    setCoordsCallback(f.geometry.coordinates);
                    updateMarkers();
                };
                suggEl.appendChild(item);
            });
        } catch (e) {
            console.error('Geocoding error', e);
            suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#e53935;">⚠️ Không kết nối Backend.</div>';
        }
    }, 500);
}

function updateMarkers() {
    if (currentStartCoords) {
        if (!startMarker) {
            const el = document.createElement('div');
            el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L20 21L12 17L4 21L12 2Z" fill="#1E88E5" stroke="#FFFFFF" stroke-width="2"/></svg>`;
            el.style.transform = 'translate(-50%, -50%)'; el.style.cursor = 'pointer';
            startMarker = new maplibregl.Marker({ element: el }).setLngLat(currentStartCoords).addTo(navMapInstance);
        } else { startMarker.setLngLat(currentStartCoords); }
    }
    if (currentEndCoords) {
        if (!endMarker) {
            const el = document.createElement('div');
            el.innerHTML = `<svg width="28" height="42" viewBox="0 0 24 36" fill="none"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z" fill="#EA4335"/><circle cx="12" cy="12" r="4.5" fill="#7D1308"/></svg>`;
            el.style.cursor = 'pointer';
            endMarker = new maplibregl.Marker({ element: el, offset: [0, -21] }).setLngLat(currentEndCoords).addTo(navMapInstance);
        } else { endMarker.setLngLat(currentEndCoords); }
    }
}

const riskModeInput = document.getElementById('nav-risk-mode');
const riskModeLabel = document.getElementById('nav-risk-mode-label');

riskModeInput?.addEventListener('change', () => {
    navigationRiskMode = riskModeInput.checked ? 'forecast' : 'current';
    if (riskModeLabel) {
        riskModeLabel.textContent = navigationRiskMode === 'forecast' ? 'Dự báo AI (24 giờ)' : 'Tình trạng hiện tại';
    }

    if (navigationRiskMode === 'forecast') {
        // Nếu đã có forecast trước đó thì apply ngay
        if (lastKnownForecasts && typeof applyForecastStationColors === 'function') {
            applyForecastStationColors(lastKnownForecasts);
            if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
                updateMapMarkers(lastKnownFloodData.stations_data);
            }
        }
    } else {
        if (typeof clearForecastStationColors === 'function') clearForecastStationColors();
        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }
    }

    refreshDangerPolygons();
    updateNavMapStationMarkers();

    if (currentRouteGeoJSON) {
        updateRouteForecast(currentRouteGeoJSON);
        analyzeFloodRoute();
    }
});

const startInput = document.getElementById('nav-start-input');
const endInput = document.getElementById('nav-end-input');
const submitBtn = document.getElementById('nav-submit-btn');

if (startInput) {
    startInput.addEventListener('input', () => { handleGeocode('nav-start-input', 'nav-start-suggestions', (coords) => { currentStartCoords = coords; }); });
    startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchRoute(); });
}
if (endInput) {
    endInput.addEventListener('input', () => { handleGeocode('nav-end-input', 'nav-end-suggestions', (coords) => { currentEndCoords = coords; }); });
    endInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchRoute(); });
}
if (submitBtn) submitBtn.addEventListener('click', fetchRoute);

document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-input-wrapper')) {
        const s = document.getElementById('nav-start-suggestions');
        const en = document.getElementById('nav-end-suggestions');
        if (s) s.style.display = 'none';
        if (en) en.style.display = 'none';
    }
});

const navLayerEl = document.getElementById('layer-navigation');
if (navLayerEl) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'layer-navigation' && mutation.target.classList.contains('layer-active')) {
                initNavigationMap();
                setTimeout(() => { if (navMapInstance) navMapInstance.resize(); }, 300);
                if (lastKnownFloodData) updateNavigationFloodData(lastKnownFloodData);
            }
        });
    });
    observer.observe(navLayerEl, { attributes: true, attributeFilter: ['class'] });
}