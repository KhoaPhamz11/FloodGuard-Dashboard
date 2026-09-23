let navMapInstance = null;
let currentStartCoords = null;
let currentEndCoords = null;
let currentRouteGeoJSON = null;
let currentDangerPolygons = null;
let currentForecastRisk = 'safe';
let currentForecastReady = false;
let lastKnownFloodData = null;
let navigationRiskMode = 'current';

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

function getStationCount() {
    return (typeof STATION_LOCATIONS !== 'undefined' && STATION_LOCATIONS.length)
        ? STATION_LOCATIONS.length
        : 7;
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
        if (distance < nearestDistance) {
            nearest = coord;
            nearestDistance = distance;
        }
    });
    return nearest;
}

/** Mode hiện tại: màu theo station.code */
function applyLiveStationColors(stationsData) {
    if (!stationsData) return;
    if (typeof clearForecastStationColors === 'function') {
        clearForecastStationColors();
    } else if (typeof forecastStationOverrides !== 'undefined') {
        forecastStationOverrides = {};
    }
    if (typeof updateMapMarkers === 'function') updateMapMarkers(stationsData);
    if (typeof updateStationCards === 'function') updateStationCards(stationsData);
}

/** Mode AI: màu theo risk_code forecast */
function applyAiStationColors(forecastList) {
    if (typeof applyForecastStationColors === 'function') {
        applyForecastStationColors(forecastList);
    }
    if (lastKnownFloodData?.stations_data) {
        if (typeof updateMapMarkers === 'function') {
            updateMapMarkers(lastKnownFloodData.stations_data);
        }
        if (typeof updateStationCards === 'function') {
            updateStationCards(lastKnownFloodData.stations_data);
        }
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
        navMapInstance.addSource('nav-route-source', {
            type: 'geojson',
            data: turf.featureCollection([])
        });

        navMapInstance.addLayer({
            id: 'nav-route-safe-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#007aff', 'line-width': 6 },
            filter: ['==', 'risk', 'safe']
        });
        navMapInstance.addLayer({
            id: 'nav-route-advisory-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#fbc02d', 'line-width': 6 },
            filter: ['==', 'risk', 'ADVISORY']
        });
        navMapInstance.addLayer({
            id: 'nav-route-warning-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ef6c00', 'line-width': 6 },
            filter: ['==', 'risk', 'WARNING']
        });
        navMapInstance.addLayer({
            id: 'nav-route-danger-layer', type: 'line', source: 'nav-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#e53935', 'line-width': 6 },
            filter: ['==', 'risk', 'CRITICAL']
        });

        navMapInstance.addSource('nav-alt-route-source', {
            type: 'geojson',
            data: turf.featureCollection([])
        });
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
            if (lastKnownFloodData.stations_data) {
                applyLiveStationColors(lastKnownFloodData.stations_data);
            }
        }
    });
}

window.updateNavigationFloodData = function (latestData) {
    if (!latestData || !latestData.stations_data || typeof STATION_LOCATIONS === 'undefined') return;
    lastKnownFloodData = latestData;

    const navLayer = document.getElementById('layer-navigation');
    const isNavLayerActive = navLayer && navLayer.classList.contains('layer-active');
    if (!isNavLayerActive || !navMapInstance || !navMapInstance.loaded()) return;

    const dangerFeatures = [];
    const maxId = getStationCount();

    latestData.stations_data.forEach(st => {
        const id = resolveStationId(st);
        if (id == null || id < 1 || id > maxId) return;

        const status = st.status === 'Nguy hiểm' || st.code === 3 ? 'CRITICAL'
            : st.code === 2 ? 'WARNING'
            : st.code === 1 ? 'ADVISORY'
            : 'SAFE';

        if (status === 'SAFE') return;

        const loc = typeof getStationLocation === 'function'
            ? getStationLocation(id)
            : STATION_LOCATIONS.find(l => l.id === id);
        if (!loc) return;

        const point = turf.point([loc.lng, loc.lat]);
        const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers', steps: 16 });
        buffer.properties = { status, riskLevel: st.code, stationId: id };
        dangerFeatures.push(buffer);
    });

    currentDangerPolygons = turf.featureCollection(dangerFeatures);

    // Luôn tô màu trạm theo mode hiện hành
    if (navigationRiskMode === 'current') {
        applyLiveStationColors(latestData.stations_data);
    }

    if (currentRouteGeoJSON) {
        analyzeFloodRoute();
    }
};

function analyzeFloodRoute() {
    if (!currentRouteGeoJSON) return;

    const routeCoords = currentRouteGeoJSON.geometry.coordinates;
    const routeLine = turf.lineString(routeCoords);

    let routeRisk = 'safe';
    if (navigationRiskMode === 'current') {
        const routeHits = (currentDangerPolygons?.features || []).filter(zone =>
            turf.booleanIntersects(routeLine, zone)
        );
        const maxCode = routeHits.reduce(
            (max, zone) => Math.max(max, Number(zone.properties?.riskLevel || 0)),
            0
        );
        routeRisk = typeof getStatusFromCode === 'function'
            ? getStatusFromCode(maxCode)
            : (maxCode === 3 ? 'CRITICAL' : maxCode === 2 ? 'WARNING' : maxCode === 1 ? 'ADVISORY' : 'SAFE');
        if (routeRisk === 'SAFE') routeRisk = 'safe';
    } else if (currentForecastReady) {
        routeRisk = currentForecastRisk;
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
        statusEl.className = 'nav-summary-status danger';
        statusEl.innerHTML = '<span class="nav-status-icon" style="color: #e53935;">⚠️</span> Nguy cơ ngập nghiêm trọng trên tuyến. Đang tìm đường vòng...';
        fetchSafeAlternativeRoute();
    } else if (hasWarning) {
        statusEl.className = 'nav-summary-status warning';
        statusEl.innerHTML = '<span class="nav-status-icon" style="color: #ef6c00;">⚠️</span> Có cảnh báo ngập nặng trên tuyến.';
        clearAltRoute();
    } else if (hasAdvisory) {
        statusEl.className = 'nav-summary-status advisory';
        statusEl.innerHTML = '<span class="nav-status-icon" style="color: #fbc02d;">⚠️</span> Có cảnh báo ngập nhẹ trên tuyến.';
        clearAltRoute();
    } else {
        statusEl.className = 'nav-summary-status safe';
        statusEl.innerHTML = '<span class="nav-status-icon" style="color: #28a745;">✓</span> Lộ trình an toàn';
        clearAltRoute();
    }
    const panel = document.getElementById('nav-summary-panel');
    if (panel) panel.style.display = 'block';
}

function clearAltRoute() {
    if (navMapInstance?.getSource('nav-alt-route-source')) {
        navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([]));
    }
}

async function fetchSafeAlternativeRoute() {
    if (!currentStartCoords || !currentEndCoords || !currentDangerPolygons || currentDangerPolygons.features.length === 0) return;
    try {
        const criticalPolygons = currentDangerPolygons.features.filter(
            f => f.properties.riskLevel >= 3 || f.properties.status === 'CRITICAL'
        );
        if (criticalPolygons.length === 0) return;

        const res = await fetch('/api/navigation/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: currentStartCoords,
                end: currentEndCoords,
                avoid_polygons: {
                    type: 'MultiPolygon',
                    coordinates: criticalPolygons.map(f => f.geometry.coordinates)
                }
            })
        });
        if (!res.ok) throw new Error('Alternative routing failed');

        const data = await res.json();
        const routeFeature = data.features[0];
        if (navMapInstance.getSource('nav-alt-route-source')) {
            navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([routeFeature]));
        }
        renderRouteLabels(routeFeature);

        const props = routeFeature.properties;
        const distKm = (props.segments[0].distance / 1000).toFixed(1);
        const timeMin = Math.round(props.segments[0].duration / 60);
        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="nav-status-icon">✓</span> Đã tìm thấy lộ trình vòng tránh ngập (${distKm}km, ${timeMin} phút)`;
            statusEl.className = 'nav-summary-status safe';
        }
    } catch (e) {
        console.error('Lỗi lộ trình thay thế:', e);
        const statusEl = document.getElementById('nav-summary-status');
        if (statusEl) {
            statusEl.innerHTML = '<span class="nav-status-icon">⚠️</span> Nguy cơ ngập. Không tìm thấy đường vòng an toàn!';
        }
    }
}

async function fetchRoute() {
    if (!currentStartCoords || !currentEndCoords) return;
    try {
        const res = await fetch('/api/navigation/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: currentStartCoords, end: currentEndCoords })
        });
        if (!res.ok) throw new Error('Routing failed');

        const data = await res.json();
        const routeFeature = data.features[0];
        currentRouteGeoJSON = routeFeature;

        await updateRouteForecast(routeFeature);
        clearAltRoute();
        renderRouteLabels(routeFeature);

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
            statusEl.innerHTML = '<span class="nav-status-icon" style="color:#e53935;">⚠️</span> Lỗi lấy lộ trình! Kiểm tra ORS_API_KEY.';
            const panel = document.getElementById('nav-summary-panel');
            if (panel) panel.style.display = 'block';
        }
    }
}

async function updateRouteForecast(routeFeature) {
    const applyCurrentRouteMode = (message) => {
        navigationRiskMode = 'current';
        if (riskModeInput) riskModeInput.checked = false;
        currentForecastReady = false;
        currentForecastRisk = 'safe';

        if (lastKnownFloodData?.stations_data) {
            applyLiveStationColors(lastKnownFloodData.stations_data);
        }

        const status = document.getElementById('nav-summary-status');
        if (status) {
            status.className = 'nav-summary-status advisory';
            status.innerHTML = `<span class="nav-status-icon">ℹ</span> ${message}`;
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
            applyAiStationColors(stationForecasts.forecasts || stationForecasts);
        }

        const midIdx = Math.floor(routeFeature.geometry.coordinates.length / 2);
        const mid = routeFeature.geometry.coordinates[midIdx];
        const nearestStation = nearestDailyStation(mid[0], mid[1]);
        const anchorLngLat = nearestStation
            ? [nearestStation.lng, nearestStation.lat]
            : getCuchiLngLat();
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

        const status = document.getElementById('nav-summary-status');
        if (!status) return;

        const modelLabel = result.model === 'hourly'
            ? 'Hourly Củ Chi'
            : `Daily (${result.station || nearestStation?.backend_name || '—'})`;
        currentForecastReady = Boolean(result.forecast_ready);
        const forecastRisk = String(result.risk_level || 'SAFE').toUpperCase();
        currentForecastRisk = forecastRisk === 'SAFE' ? 'safe' : forecastRisk;

        if (result.model_status === 'unavailable' || !result.forecast_ready) {
            applyCurrentRouteMode('Không có dữ liệu dự báo; đang dùng tình trạng hiện tại.');
            return;
        }

        status.innerHTML = `<span class="nav-status-icon">✓</span> Đã phân loại theo ${modelLabel} · ${forecastRisk}`;
        analyzeFloodRoute();
    } catch (error) {
        console.error('Route forecast error:', error);
        applyCurrentRouteMode('Mốc ngoài dữ liệu dự báo; đang dùng tình trạng hiện tại.');
    }
}

function renderRouteLabels(routeFeature) {
    if (typeof routeLabelMarkers === 'undefined') {
        window.routeLabelMarkers = [];
    }
    window.routeLabelMarkers.forEach(m => m.remove());
    window.routeLabelMarkers = [];

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

        const marker = new maplibregl.Marker({
            element: el, rotation, rotationAlignment: 'map', pitchAlignment: 'map'
        }).setLngLat(midPoint).addTo(navMapInstance);
        window.routeLabelMarkers.push(marker);
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
            if (!res.ok) {
                suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#e53935;">⚠️ Lỗi API.</div>';
                return;
            }
            const data = await res.json();
            suggEl.innerHTML = '';
            if (!data.features || data.features.length === 0) {
                suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#8892b0;">Không tìm thấy kết quả</div>';
                return;
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
            el.style.transform = 'translate(-50%, -50%)';
            el.style.cursor = 'pointer';
            startMarker = new maplibregl.Marker({ element: el }).setLngLat(currentStartCoords).addTo(navMapInstance);
        } else {
            startMarker.setLngLat(currentStartCoords);
        }
    }
    if (currentEndCoords) {
        if (!endMarker) {
            const el = document.createElement('div');
            el.innerHTML = `<svg width="28" height="42" viewBox="0 0 24 36" fill="none"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z" fill="#EA4335"/><circle cx="12" cy="12" r="4.5" fill="#7D1308"/></svg>`;
            el.style.cursor = 'pointer';
            endMarker = new maplibregl.Marker({ element: el, offset: [0, -21] }).setLngLat(currentEndCoords).addTo(navMapInstance);
        } else {
            endMarker.setLngLat(currentEndCoords);
        }
    }
}

const riskModeInput = document.getElementById('nav-risk-mode');
const riskModeLabel = document.getElementById('nav-risk-mode-label');

riskModeInput?.addEventListener('change', () => {
    navigationRiskMode = riskModeInput.checked ? 'forecast' : 'current';
    if (riskModeLabel) {
        riskModeLabel.textContent = navigationRiskMode === 'forecast'
            ? 'Dự báo AI (24 giờ)'
            : 'Tình trạng hiện tại';
    }

    // Cả 2 mode đều tô màu trạm
    if (navigationRiskMode === 'current' && lastKnownFloodData?.stations_data) {
        applyLiveStationColors(lastKnownFloodData.stations_data);
    }

    if (currentRouteGeoJSON) {
        updateRouteForecast(currentRouteGeoJSON);
        analyzeFloodRoute();
    }
});

const startInput = document.getElementById('nav-start-input');
const endInput = document.getElementById('nav-end-input');
const submitBtn = document.getElementById('nav-submit-btn');

if (startInput) {
    startInput.addEventListener('input', () => {
        handleGeocode('nav-start-input', 'nav-start-suggestions', (coords) => { currentStartCoords = coords; });
    });
    startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchRoute(); });
}
if (endInput) {
    endInput.addEventListener('input', () => {
        handleGeocode('nav-end-input', 'nav-end-suggestions', (coords) => { currentEndCoords = coords; });
    });
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