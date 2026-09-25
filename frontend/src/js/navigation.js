// File: navigation.js — Module Dẫn đường tránh ngập & Dashboard AI
// V14 - Fixed Fit Panel Container (Không trượt/scroll, tối ưu kích thước Banner & Station Card)

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
let selectedHorizon = 24; // 1 | 3 | 6 | 24

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

let dangerPulseRaf = null;
let dangerPulseStart = 0;

// ==========================================
// HÀM UI BANNER THIẾT KẾ COMPACT FIT FRAME
// ==========================================
function getAlertBannerUI(type, title, subtitle = '') {
    let accent = '';
    let icon = '';

    switch (type) {
        case 'safe':
            accent = '#10b981';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            break;
        case 'advisory':
            accent = '#f59e0b';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
            break;
        case 'warning':
            accent = '#f97316';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
            break;
        case 'danger':
            accent = '#ef4444';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
            break;
        case 'rerouted':
            accent = '#3b82f6';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
            break;
        case 'analyzing':
            accent = '#06b6d4';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1s linear infinite;"><style>@keyframes spin{100%{transform:rotate(360deg)}}</style><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
            break;
        case 'error':
            accent = '#f43f5e';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            break;
        case 'info':
        default:
            accent = '#94a3b8';
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            break;
    }

    return `
    <div style="position: relative; overflow: hidden; background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,1)); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid ${accent}; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; width: 100%; box-sizing: border-box; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
        <div style="position: absolute; top: -10px; right: -10px; width: 45px; height: 45px; background: ${accent}; filter: blur(25px); opacity: 0.15; border-radius: 50%; pointer-events: none;"></div>
        <div style="display: flex; align-items: center; gap: 8px; position: relative; z-index: 1;">
            <div style="color: ${accent}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${icon}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                <div style="font-size: 11px; font-weight: 700; color: #f8fafc; line-height: 1.2; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
                ${subtitle ? `<div style="font-size: 11px; color: #cbd5e1; line-height: 1.3; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${subtitle}</div>` : ''}
            </div>
        </div>
    </div>
    ${typeof getForecastUI === 'function' ? getForecastUI() : ''}
    `;
}

function getForecastUI() {
    if (currentRouteGeoJSON) {
        syncPanelFromRouteStation(currentRouteGeoJSON);
    }
    if (!currentForecastDetails) return '';

    const isForecast = navigationRiskMode === 'forecast';
    const wlCm = formatWaterCm(currentForecastDetails.predWaterLevel);
    const wlDisplay = wlCm != null ? String(wlCm) : '—';
    const riskCode = Number(currentForecastDetails.riskCode ?? 0);
    const station = currentForecastDetails.station || '—';
    const riskColor = riskColorFromCode(riskCode);
    const riskText = riskLevelText(riskCode);
    const distKm = currentForecastDetails.distanceKm;
    const distStr = distKm != null ? `${Number(distKm).toFixed(1)} km` : '';
    const modeTag = isForecast ? `AI ${currentForecastDetails.horizon || selectedHorizon}h` : 'Live';
    const waterLabel = isForecast ? 'Ngập đỉnh' : 'Mực ngập';

    return `
    <div class="nav-ai-card" style="
        width:100%;padding:8px 10px;border-radius:8px;
        background:rgba(15,23,42,0.95);
        border:1px solid ${riskColor}40;
        box-sizing:border-box;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
        <div style="min-width:0;flex:1;overflow:hidden;">
          <div style="font-size:9px;color:#94a3b8;letter-spacing:0.2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            Trạm gần tuyến · ${modeTag}${distStr ? ' · ' + distStr : ''}
          </div>
          <div style="font-size:13px;font-weight:700;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${station}
          </div>
        </div>
        <span style="
          flex-shrink:0;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;
          color:${riskColor};background:${riskColor}20;border:1px solid ${riskColor}50;
          white-space:nowrap;
        ">${riskText}</span>
      </div>
      <div style="
        padding:6px 8px;border-radius:6px;background:rgba(30,41,59,0.7);
        display:flex;align-items:center;justify-content:space-between;gap:6px;
      ">
        <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">${waterLabel}</span>
        <span style="font-size:15px;font-weight:700;color:#f8fafc;white-space:nowrap;">
          ${wlDisplay}<span style="font-size:10px;color:#64748b;font-weight:500;margin-left:3px;">cm</span>
        </span>
      </div>
    </div>`;
}

function getStationCount() {
    return (typeof STATION_LOCATIONS !== 'undefined' && STATION_LOCATIONS.length) ? STATION_LOCATIONS.length : 7;
}

function resolveStationId(st) {
    if (typeof getStationNumericId === 'function') {
        const id = getStationNumericId(st);
        if (id != null && !Number.isNaN(id)) return id;
    }
    if (st.frontend_station_id != null) {
        if (typeof getStationNumericId === 'function') {
            const mapped = getStationNumericId({ frontend_station_id: st.frontend_station_id, station_name: st.station_name });
            if (mapped != null) return mapped;
        }
        return Number(st.frontend_station_id);
    }
    if (st.station_name) {
        const m = String(st.station_name).match(/(\d+)/);
        if (m) {
            if (typeof getStationNumericId === 'function') {
                const mapped = getStationNumericId({ station_name: st.station_name });
                if (mapped != null) return mapped;
            }
            return parseInt(m[1], 10);
        }
    }
    return null;
}

function findLiveStationByUiId(uiId) {
    const list = lastKnownFloodData?.stations_data || [];
    const matches = list.filter(s => resolveStationId(s) === uiId);
    if (!matches.length) return null;
    matches.sort((a, b) => {
        const ca = Number(a.code ?? -1);
        const cb = Number(b.code ?? -1);
        if (cb !== ca) return cb - ca;
        return (Number(b.H) || 0) - (Number(a.H) || 0);
    });
    return matches[0];
}

function findForecastByUiId(uiId) {
    const list = lastKnownForecasts || [];
    return list.find(f => Number(f.frontend_station_id || resolveStationId(f)) === uiId) || null;
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

function formatWaterCm(value) {
    if (value == null || value === '' || value === '—') return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    return Number.isInteger(n) ? n : Math.round(n * 10) / 10;
}

function riskLevelText(code) {
    if (code >= 3) return 'Ngập mức 3';
    if (code === 2) return 'Ngập mức 2';
    if (code === 1) return 'Ngập mức 1';
    return 'An toàn';
}

function riskColorFromCode(code) {
    if (code >= 3) return '#ef4444';
    if (code === 2) return '#f97316';
    if (code === 1) return '#eab308';
    return '#22c55e';
}

function distanceStationToRouteKm(routeFeature, lng, lat) {
    if (!routeFeature?.geometry?.coordinates?.length) return Infinity;
    const target = turf.point([lng, lat]);
    let best = Infinity;
    routeFeature.geometry.coordinates.forEach(coord => {
        const d = turf.distance(target, turf.point(coord), { units: 'kilometers' });
        if (d < best) best = d;
    });
    return best;
}

function pickRouteDominantStation(routeFeature) {
    if (!routeFeature || typeof STATION_LOCATIONS === 'undefined') return null;
    const isForecast = navigationRiskMode === 'forecast';
    const RADIUS_KM = 3;

    const candidates = [];
    STATION_LOCATIONS.forEach(loc => {
        const dist = distanceStationToRouteKm(routeFeature, loc.lng, loc.lat);
        if (dist > RADIUS_KM) return;

        let code = 0;
        let water = null;
        let riskScore = null;

        if (isForecast && lastKnownForecasts) {
            const fc = findForecastByUiId(loc.id);
            if (fc && fc.forecast_ready !== false) {
                code = Number(fc.risk_code ?? 0);
                water = fc.predicted_water_level ?? fc.predWaterLevel ?? fc.H ?? null;
            }
        } else if (lastKnownFloodData?.stations_data) {
            const st = findLiveStationByUiId(loc.id);
            if (st) {
                code = Number(st.code ?? 0);
                water = st.H ?? st.water_level ?? null;
                riskScore = st.S_risk ?? null;
            }
        }

        candidates.push({
            id: loc.id,
            name: loc.backend_name || loc.district,
            dist,
            code,
            water,
            riskScore,
            loc
        });
    });

    if (!candidates.length) {
        let best = null;
        let bestD = Infinity;
        STATION_LOCATIONS.forEach(loc => {
            const d = distanceStationToRouteKm(routeFeature, loc.lng, loc.lat);
            if (d < bestD) {
                bestD = d;
                best = loc;
            }
        });
        if (!best) return null;
        return {
            id: best.id,
            name: best.backend_name || best.district,
            dist: bestD,
            code: 0,
            water: null,
            riskScore: null,
            loc: best
        };
    }

    candidates.sort((a, b) => {
        if (b.code !== a.code) return b.code - a.code;
        return a.dist - b.dist;
    });
    return candidates[0];
}

function syncPanelFromRouteStation(routeFeature, extraWater = null) {
    const dom = pickRouteDominantStation(routeFeature || currentRouteGeoJSON);
    if (!dom) return null;

    const isForecast = navigationRiskMode === 'forecast';
    let water = dom.water;
    if (water == null && extraWater != null) water = extraWater;
    if (water == null && isForecast && currentForecastDetails?.predWaterLevel != null
        && (currentForecastDetails.stationId === dom.id || currentForecastDetails.station === dom.name)) {
        water = currentForecastDetails.predWaterLevel;
    }

    currentForecastDetails = {
        station: dom.name,
        stationId: dom.id,
        predWaterLevel: water != null ? Number(water) : null,
        riskLevel: dom.code >= 3 ? 'CRITICAL' : dom.code === 2 ? 'WARNING' : dom.code === 1 ? 'ADVISORY' : 'SAFE',
        riskCode: dom.code,
        model: isForecast ? `AI ${selectedHorizon}h · gần tuyến` : 'Live Mongo · gần tuyến',
        horizon: isForecast ? selectedHorizon : null,
        distanceKm: dom.dist
    };
    return dom;
}

function updateMarkerPopup(marker, stationId, isForecast, code, color, statusText) {
    const popup = marker.getPopup();
    if (!popup) return;

    const loc = typeof getStationLocation === 'function' ? getStationLocation(stationId) : STATION_LOCATIONS?.find(l => l.id === stationId);
    const stationName = loc?.backend_name || loc?.name || `Trạm ${stationId}`;
    const address = loc?.street ? `${loc.street}${loc.district ? ', ' + loc.district : ''}` : (loc?.address || 'TP. Hồ Chí Minh');

    let popupHtml = '';

    if (isForecast) {
        const fc = lastKnownForecasts?.find(f => (f.frontend_station_id || resolveStationId(f)) === stationId);
        let rawWl = fc?.predicted_water_level
            ?? fc?.predWaterLevel
            ?? fc?.predicted_depth_cm
            ?? fc?.water_level
            ?? fc?.H
            ?? null;
        if (rawWl == null && currentForecastDetails && (currentForecastDetails.station === stationName || currentForecastDetails.station === loc?.backend_name)) {
            rawWl = currentForecastDetails.predWaterLevel;
        }
        const predCm = formatWaterCm(rawWl);
        const predDisplay = predCm != null ? `${predCm} cm` : '—';

        popupHtml = `
            <div style="padding:8px 10px;min-width:210px;font-family:system-ui,sans-serif;">
                <div style="font-weight:700;font-size:14px;color:#f1f5f9;margin-bottom:2px;">${stationName}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">📍 ${address}</div>
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}55;margin-bottom:10px;">
                    <span style="width:6px;height:6px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};"></span>
                    AI ${selectedHorizon}h · ${statusText}
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.7;">
                    <div>Mực nước ngập dự báo: <b style="color:#f8fafc;">${predDisplay}</b></div>
                    <div>Risk code: <b style="color:${color};">${code}</b></div>
                </div>
            </div>
        `;
    } else {
        const st = findLiveStationByUiId(stationId);
        const rawH = st?.H ?? st?.water_level ?? st?.live_water_level_m ?? null;
        const wlCm = formatWaterCm(rawH);
        const wlDisplay = wlCm != null ? `${wlCm} cm` : '—';
        const groundVal = st?.Z_street ?? loc?.ground_elevation ?? null;
        const ground = groundVal != null ? `${Number(groundVal).toFixed(2)} m` : '—';
        const riskScore = st?.S_risk ?? st?.risk_score ?? '—';

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
                    <div>Mực nước ngập: <b style="color:#f8fafc;">${wlDisplay}</b></div>
                    <div>Risk Score: <b style="color:#f8fafc;">${riskScore}</b></div>
                </div>
            </div>
        `;
    }

    popup.setHTML(popupHtml);
}

function updateNavMapStationMarkers() {
    if (!navMapInstance || !navMarkers) return;

    const isForecast = (navigationRiskMode === 'forecast');

    Object.keys(navMarkers).forEach(idKey => {
        const id = Number(idKey);
        const marker = navMarkers[idKey];
        if (!marker) return;

        let code = 0;
        let statusText = 'An toàn';
        let color = '#22c55e';

        if (isForecast && lastKnownForecasts) {
            const fc = findForecastByUiId(id);
            if (fc) {
                code = Number(fc.risk_code ?? 0);
                color = riskColorFromCode(code);
                statusText = riskLevelText(code);
            }
        } else if (lastKnownFloodData?.stations_data) {
            const st = findLiveStationByUiId(id);
            if (st) {
                code = Number(st.code ?? 0);
                color = riskColorFromCode(code);
                statusText = riskLevelText(code);
            }
        }

        const markerEl = marker.getElement();
        if (markerEl) {
            const mapMarker = markerEl.querySelector('.map-marker') || markerEl;
            const statusClass = code >= 3 ? 'marker-critical'
                : code === 2 ? 'marker-warning'
                : code === 1 ? 'marker-advisory'
                : 'marker-safe';
            if (mapMarker) {
                mapMarker.className = `map-marker ${statusClass}`;
                mapMarker.querySelectorAll('.marker-pulse, .marker-ring, .marker-dot').forEach(n => n.remove());
            }
            markerEl.querySelectorAll('.marker-pulse, .marker-ring').forEach(n => n.remove());
        }

        updateMarkerPopup(marker, id, isForecast, code, color, statusText);
    });
}

function stopDangerPulse() {
    if (dangerPulseRaf) {
        cancelAnimationFrame(dangerPulseRaf);
        dangerPulseRaf = null;
    }
}

function clearDangerPolygons() {
    stopDangerPulse();
    currentDangerPolygons = turf.featureCollection([]);
    try {
        if (navMapInstance?.getSource('nav-danger-zones-source')) {
            navMapInstance.getSource('nav-danger-zones-source').setData(currentDangerPolygons);
        }
    } catch (_) {}
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
            const code = Number(fc.risk_code ?? 0);
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
        for (let id = 1; id <= maxId; id++) {
            if (seenStations.has(id)) continue;
            const st = findLiveStationByUiId(id);
            if (!st) continue;
            const code = Number(st.code ?? 0);
            const status = code >= 3 ? 'CRITICAL' : code === 2 ? 'WARNING' : code === 1 ? 'ADVISORY' : 'SAFE';
            if (status === 'SAFE') continue;
            seenStations.add(id);
            const loc = typeof getStationLocation === 'function' ? getStationLocation(id) : STATION_LOCATIONS?.find(l => l.id === id);
            if (!loc) continue;
            const point = turf.point([loc.lng, loc.lat]);
            const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers', steps: 48 });
            buffer.properties = { status, riskLevel: code, stationId: id };
            dangerFeatures.push(buffer);
        }
    }

    currentDangerPolygons = turf.featureCollection(dangerFeatures);

    if (navMapInstance.getSource('nav-danger-zones-source')) {
        navMapInstance.getSource('nav-danger-zones-source').setData(currentDangerPolygons);
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

function ensureHorizonSelector() {
    const toggleEl = document.getElementById('nav-risk-mode');
    if (!toggleEl) return;
    const toggleRow = toggleEl.closest('div') || toggleEl.parentElement;
    if (!toggleRow) return;

    let wrap = document.getElementById('nav-horizon-selector');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'nav-horizon-selector';
        wrap.style.cssText = 'display:none;margin-top:10px;padding:0 2px;';
        wrap.innerHTML = `
            <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px;">Khung dự báo</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[1, 3, 6, 24].map(h => `
                    <button type="button" data-horizon="${h}" class="nav-horizon-btn" style="
                        padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
                        border:1px solid rgba(148,163,184,0.25);background:rgba(30,41,59,0.6);color:#cbd5e1;
                        transition:all .15s ease;
                    ">${h}h</button>
                `).join('')}
            </div>
        `;
        if (toggleRow.parentElement) {
            toggleRow.parentElement.insertBefore(wrap, toggleRow.nextSibling);
        } else {
            toggleRow.appendChild(wrap);
        }

        wrap.querySelectorAll('.nav-horizon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const h = Number(btn.dataset.horizon);
                if (h === selectedHorizon) return;
                selectedHorizon = h;
                updateHorizonButtons();
                if (riskModeLabel) {
                    riskModeLabel.textContent = `Dự báo AI (${h} giờ)`;
                }
                if (currentRouteGeoJSON && navigationRiskMode === 'forecast') {
                    updateRouteForecast(currentRouteGeoJSON);
                }
            });
        });
    }

    wrap.style.display = navigationRiskMode === 'forecast' ? 'block' : 'none';
    updateHorizonButtons();
}

function updateHorizonButtons() {
    const wrap = document.getElementById('nav-horizon-selector');
    if (!wrap) return;
    wrap.querySelectorAll('.nav-horizon-btn').forEach(btn => {
        const h = Number(btn.dataset.horizon);
        const active = h === selectedHorizon;
        btn.style.background = active ? 'rgba(56,189,248,0.2)' : 'rgba(30,41,59,0.6)';
        btn.style.borderColor = active ? 'rgba(56,189,248,0.55)' : 'rgba(148,163,184,0.25)';
        btn.style.color = active ? '#38bdf8' : '#cbd5e1';
    });
}

function analyzeFloodRoute() {
    if (!currentRouteGeoJSON) return;

    const routeCoords = currentRouteGeoJSON.geometry.coordinates;
    const routeLine = turf.lineString(routeCoords);

    const routeHits = (currentDangerPolygons?.features || []).filter(zone => {
        try { return turf.booleanIntersects(routeLine, zone); } catch (_) { return false; }
    });
    const maxFromZones = routeHits.reduce((max, zone) => Math.max(max, Number(zone.properties?.riskLevel || 0)), 0);
    const maxFromPanel = Number(currentForecastDetails?.riskCode ?? 0);
    let maxFromPoint = 0;
    if (navigationRiskMode === 'forecast' && currentForecastReady) {
        const r = currentForecastRisk;
        maxFromPoint = r === 'CRITICAL' || r === 'critical' ? 3
            : r === 'WARNING' || r === 'warning' ? 2
            : r === 'ADVISORY' || r === 'advisory' ? 1 : 0;
    }
    const maxCode = Math.max(maxFromZones, maxFromPanel, maxFromPoint);
    let routeRisk = typeof getStatusFromCode === 'function'
        ? getStatusFromCode(maxCode)
        : (maxCode >= 3 ? 'CRITICAL' : maxCode === 2 ? 'WARNING' : maxCode === 1 ? 'ADVISORY' : 'SAFE');
    if (routeRisk === 'SAFE') routeRisk = 'safe';

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

    if (!hasCritical) lastDangerHash = "";

    if (hasCritical) {
        const currentHash = JSON.stringify(currentDangerPolygons) + navigationRiskMode + selectedHorizon;
        const hasAlt = !!(currentAltRouteGeoJSON?.geometry?.coordinates?.length > 1);
        if (!isFetchingAltRoute && lastDangerHash !== currentHash) {
            statusEl.className = 'nav-summary-status danger';
            statusEl.innerHTML = getAlertBannerUI('danger', 'Ngập mức 3 (Nghiêm trọng)', 'Đang tìm kiếm tuyến đường vòng...');
            fetchSafeAlternativeRoute(currentHash);
        } else if (hasAlt) {
            statusEl.className = 'nav-summary-status safe';
            statusEl.innerHTML = getAlertBannerUI('rerouted', 'Đã vẽ tuyến vòng tránh ngập', 'Tuyến đường xanh lá an toàn.');
        } else if (!isFetchingAltRoute) {
            statusEl.className = 'nav-summary-status danger';
            statusEl.innerHTML = getAlertBannerUI('danger', 'Ngập mức 3 (Nghiêm trọng)', 'Chưa tìm thấy tuyến vòng an toàn.');
        }
    } else if (hasWarning) {
        statusEl.className = 'nav-summary-status warning';
        statusEl.innerHTML = getAlertBannerUI('warning', 'Cảnh báo ngập mức 2', 'Nên tìm lộ trình khác nếu xe gầm thấp.');
        clearAltRoute();
    } else if (hasAdvisory) {
        statusEl.className = 'nav-summary-status advisory';
        statusEl.innerHTML = getAlertBannerUI('advisory', 'Cảnh báo ngập mức 1', 'Đường có thể đọng nước, chú ý quan sát.');
        clearAltRoute();
    } else {
        statusEl.className = 'nav-summary-status safe';
        statusEl.innerHTML = getAlertBannerUI('safe', 'Lộ trình an toàn', 'Hiện không có cảnh báo ngập trên tuyến.');
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
            const hasAlt = currentAltRouteGeoJSON
                && currentAltRouteGeoJSON.geometry
                && currentAltRouteGeoJSON.geometry.coordinates?.length > 1;
            if (hasAlt) {
                statusEl.innerHTML = getAlertBannerUI('rerouted', 'Đã tránh điểm ngập', `Tuyến thay thế dài ${distKm} km (${timeMin} phút).`);
                statusEl.className = 'nav-summary-status safe';
            } else {
                statusEl.innerHTML = getAlertBannerUI('danger', 'Không thể tránh ngập', 'Ngập diện rộng, không vẽ được tuyến thay thế.');
                statusEl.className = 'nav-summary-status danger';
            }
        }
        lastDangerHash = currentHash;

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('Lỗi lộ trình thay thế:', e);
        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.className = 'nav-summary-status danger';
            if (e.name === 'AbortError') {
                statusEl.innerHTML = getAlertBannerUI('error', 'Lỗi tải lộ trình', 'Quá thời gian chờ. Không tìm được tuyến thay thế.');
            } else if (e.message === 'API_RATE_LIMIT') {
                statusEl.innerHTML = getAlertBannerUI('error', 'Hệ thống quá tải', 'Vui lòng thử lại sau ít phút.');
            } else {
                statusEl.innerHTML = getAlertBannerUI('error', 'Không thể tránh ngập', 'Ngập diện rộng. Không tìm được tuyến vòng an toàn.');
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
            statusEl.innerHTML = getAlertBannerUI('error', 'Lỗi tìm đường', 'Không thể lấy lộ trình, vui lòng kiểm tra API.');
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
        statusEl.innerHTML = getAlertBannerUI('analyzing', `Đang phân tích rủi ro ngập AI (${selectedHorizon}h)...`, '');
        if (panel) panel.style.display = 'block';
    }

    const applyCurrentRouteMode = (message) => {
        currentForecastReady = false;
        currentForecastRisk = 'safe';
        currentForecastDetails = null;
        lastDangerHash = "";

        if (typeof clearForecastStationColors === 'function') clearForecastStationColors();
        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }

        if (!riskModeInput?.checked) {
            navigationRiskMode = 'current';
        }

        refreshDangerPolygons();
        updateNavMapStationMarkers();

        if (statusEl) {
            statusEl.className = 'nav-summary-status advisory';
            statusEl.innerHTML = getAlertBannerUI('info', 'Thông báo', message);
        }
        analyzeFloodRoute();
    };

    if (navigationRiskMode === 'current') {
        currentForecastReady = false;
        currentForecastRisk = 'safe';
        lastDangerHash = "";
        lastKnownForecasts = null;
        if (typeof clearForecastStationColors === 'function') clearForecastStationColors();
        clearDangerPolygons();
        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }
        syncPanelFromRouteStation(routeFeature);
        refreshDangerPolygons();
        updateNavMapStationMarkers();
        analyzeFloodRoute();
        return;
    }

    const horizon = selectedHorizon;
    try {
        if (typeof fetchStationForecasts === 'function') {
            const stationForecasts = await fetchStationForecasts({ horizon });
            lastKnownForecasts = stationForecasts.forecasts || stationForecasts;

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

        const result = await fetchForecast({
            latitude: nearestOnRoute[1],
            longitude: nearestOnRoute[0],
            horizons: [horizon]
        });

        const modelLabel = result.model === 'hourly' ? 'Hourly Củ Chi' : `Daily (${result.station || nearestStation?.backend_name || '—'})`;
        currentForecastReady = Boolean(result.forecast_ready);

        let forecastRisk = 'SAFE';
        if (result.risk_code >= 3 || result.risk_level === 'CRITICAL') forecastRisk = 'CRITICAL';
        else if (result.risk_code === 2 || result.risk_level === 'WARNING') forecastRisk = 'WARNING';
        else if (result.risk_code === 1 || result.risk_level === 'ADVISORY') forecastRisk = 'ADVISORY';
        currentForecastRisk = forecastRisk === 'SAFE' ? 'safe' : forecastRisk;

        let predWaterLevel = null;
        if (result.model === 'hourly' && Array.isArray(result.forecasts) && result.forecasts.length > 0) {
            const match = result.forecasts.find(f => Number(f.horizon) === horizon) || result.forecasts[0];
            predWaterLevel = match?.predicted_water_level ?? match?.predWaterLevel;
        } else if (result.model === 'daily' && result.forecast) {
            predWaterLevel = result.forecast.predicted_water_level ?? result.forecast.predWaterLevel;
        } else if (result.predicted_water_level != null) {
            predWaterLevel = result.predicted_water_level;
        }

        currentForecastDetails = {
            station: result.station || nearestStation?.backend_name || '—',
            stationId: null,
            predWaterLevel: predWaterLevel != null ? Number(predWaterLevel) : null,
            riskLevel: forecastRisk,
            riskCode: result.risk_code ?? (forecastRisk === 'CRITICAL' ? 3 : forecastRisk === 'WARNING' ? 2 : forecastRisk === 'ADVISORY' ? 1 : 0),
            model: modelLabel,
            horizon
        };

        const dom = syncPanelFromRouteStation(
            routeFeature,
            predWaterLevel != null ? Number(predWaterLevel) : null
        );
        if (dom && result.station && (dom.name === result.station || result.station.includes(dom.name) || dom.name.includes(result.station))) {
            currentForecastDetails.riskCode = Number(result.risk_code ?? dom.code);
            currentForecastDetails.riskLevel = forecastRisk;
            if (predWaterLevel != null) currentForecastDetails.predWaterLevel = Number(predWaterLevel);
        }

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

// CẤU HÌNH BẮT BUỘC FIT VỪA KHUNG (BỎ SCROLLBAR)
(function injectNavPanelStyles() {
    if (document.getElementById('nav-panel-fix')) return;
    const s = document.createElement('style');
    s.id = 'nav-panel-fix';
    s.textContent = `
      #nav-summary-panel, .navigation-summary-panel {
        width: min(310px, calc(100vw - 32px)) !important;
        max-height: none !important;
        height: auto !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        padding: 10px 12px !important;
        border-radius: 12px !important;
      }
      #nav-summary-status {
        width: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 0px !important;
      }
      #nav-summary-status .nav-ai-card {
        max-width: 100%;
        box-sizing: border-box;
      }
      #nav-summary-panel .nav-summary-metrics,
      #nav-summary-dist, #nav-summary-time {
        white-space: nowrap;
      }
    `;
    document.head.appendChild(s);
})();

function ensureNavPanelStyles() {
    if (document.getElementById('nav-panel-fix-v13')) return;
    const s = document.createElement('style');
    s.id = 'nav-panel-fix-v13';
    s.textContent = `
      .navigation-summary-panel {
        width: min(310px, calc(100vw - 32px)) !important;
        max-height: none !important;
        height: auto !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      .nav-summary-status {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0px !important;
        width: 100% !important;
        box-sizing: border-box;
      }
      .map-marker-wrapper {
        --radar-radius: 16px !important;
      }
    `;
    document.head.appendChild(s);
}

const riskModeInput = document.getElementById('nav-risk-mode');
const riskModeLabel = document.getElementById('nav-risk-mode-label');

riskModeInput?.addEventListener('change', () => {
    navigationRiskMode = riskModeInput.checked ? 'forecast' : 'current';
    if (riskModeLabel) {
        riskModeLabel.textContent = navigationRiskMode === 'forecast'
            ? `Dự báo AI (${selectedHorizon} giờ)`
            : 'Tình trạng hiện tại';
    }

    ensureHorizonSelector();
    lastFloodDataSignature = "";
    lastDangerHash = "";
    isFetchingAltRoute = false;

    if (navigationRiskMode === 'forecast') {
        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }
        updateNavMapStationMarkers();
        if (currentRouteGeoJSON) {
            updateRouteForecast(currentRouteGeoJSON);
        } else {
            refreshDangerPolygons();
        }
    } else {
        currentForecastReady = false;
        currentForecastRisk = 'safe';
        currentForecastDetails = null;
        lastKnownForecasts = null;

        if (typeof clearForecastStationColors === 'function') {
            clearForecastStationColors();
        }
        clearDangerPolygons();
        resetAltRouteVisual?.();
        currentAltRouteGeoJSON = null;

        if (lastKnownFloodData?.stations_data && typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }

        refreshDangerPolygons();
        updateNavMapStationMarkers();

        if (currentRouteGeoJSON) {
            syncPanelFromRouteStation(currentRouteGeoJSON);
            analyzeFloodRoute();
        } else {
            const statusEl = document.getElementById('nav-summary-status');
            if (statusEl) {
                statusEl.className = 'nav-summary-status advisory';
                statusEl.innerHTML = getAlertBannerUI('info', 'Thông báo', 'Đang dùng tình trạng hiện tại (Mongo).');
            }
        }
    }
});

setTimeout(ensureHorizonSelector, 400);

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
                setTimeout(() => {
                    if (navMapInstance) navMapInstance.resize();
                    ensureHorizonSelector();
                }, 300);
                if (lastKnownFloodData) updateNavigationFloodData(lastKnownFloodData);
            }
        });
    });
    observer.observe(navLayerEl, { attributes: true, attributeFilter: ['class'] });
}