// File: navigation.js - Phase 1: Flood-Aware Navigation Mode

let navMapInstance = null;
let currentStartCoords = null;
let currentEndCoords = null;
let currentRouteGeoJSON = null;
let currentDangerPolygons = null;
let lastKnownFloodData = null;

const FLOOD_ALERT_RADIUS_KM = 2; // Bán kính cảnh báo 2km
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
let navMarkers = {}; // Trạm (stations) trên map

// 1. Khởi tạo MapLibre riêng cho Navigation
function initNavigationMap() {
    if (navMapInstance) {
        navMapInstance.resize();
        return;
    }

    navMapInstance = new maplibregl.Map({
        container: 'navigation-map',
        style: NAV_MAP_STYLE,
        center: [106.6870, 10.7930], // HCM Center
        zoom: 12,
        attributionControl: false
    });

    navMapInstance.on('load', () => {
        // Source cho Route
        navMapInstance.addSource('nav-route-source', {
            'type': 'geojson',
            'data': turf.featureCollection([])
        });

        // Layer màu XANH (An toàn)
        navMapInstance.addLayer({
            'id': 'nav-route-safe-layer',
            'type': 'line',
            'source': 'nav-route-source',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': {
                'line-color': '#007aff',
                'line-width': 6
            },
            'filter': ['==', 'risk', 'safe']
        });

        // Layer màu ĐỎ (Nguy hiểm)
        navMapInstance.addLayer({
            'id': 'nav-route-danger-layer',
            'type': 'line',
            'source': 'nav-route-source',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': {
                'line-color': '#e53935',
                'line-width': 6
            },
            'filter': ['==', 'risk', 'danger']
        });

        // Source cho Alternative Safe Route
        navMapInstance.addSource('nav-alt-route-source', {
            'type': 'geojson',
            'data': turf.featureCollection([])
        });

        // Layer màu XANH LÁ (An toàn thay thế)
        navMapInstance.addLayer({
            'id': 'nav-alt-route-layer',
            'type': 'line',
            'source': 'nav-alt-route-source',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': {
                'line-color': '#00E676',
                'line-width': 6
            }
        });
        
        // Source & Layer cho Tên Đường (Labels) đã bị xóa để dùng HTML Markers hỗ trợ Tiếng Việt
        
        // Khởi tạo Marker cho các trạm giống như bên main map
        if (typeof createMarkersForMap === 'function') {
            createMarkersForMap(navMapInstance, navMarkers, "nav");
        }

        // Áp dụng lại Flood Data nếu có sẵn trước khi map load
        if (lastKnownFloodData) {
            updateNavigationFloodData(lastKnownFloodData);
            // Đồng bộ màu sắc trạm ngay lập tức
            if (typeof updateMapMarkers === 'function' && lastKnownFloodData.stations_data) {
                updateMapMarkers(lastKnownFloodData.stations_data);
            }
        }
    });
}

// 2. Nhận dữ liệu Realtime từ app.js (KHÔNG TẠO POLLING MỚI)
window.updateNavigationFloodData = function(latestData) {
    if (!latestData || !latestData.stations_data || typeof STATION_LOCATIONS === 'undefined') return;
    lastKnownFloodData = latestData;

    // Chỉ chạy phân tích nếu Navigation Map đang hoạt động
    const isNavLayerActive = document.getElementById('layer-navigation').classList.contains('layer-active');
    if (!isNavLayerActive || !navMapInstance || !navMapInstance.loaded()) return;

    // Lọc ra các trạm đang bị DANGER (CRITICAL)
    const redStations = latestData.stations_data.filter(station => {
        // Tương tự logic getStatusFromCode
        return station.code === 3 || station.status === "Nguy hiểm" || station.status === "CRITICAL"; 
    });

    const dangerFeatures = [];
    redStations.forEach(st => {
        // Tìm toạ độ từ cấu hình frontend
        const loc = STATION_LOCATIONS.find(l => l.id === parseInt(st.station_name.replace('station_','')));
        if (loc) {
            const point = turf.point([loc.lng, loc.lat]);
            const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers', steps: 16 });
            dangerFeatures.push(buffer);
        }
    });

    const newDangerPolygons = turf.featureCollection(dangerFeatures);
    currentDangerPolygons = newDangerPolygons;

    // Phân tích lại lộ trình nếu đang có route
    if (currentRouteGeoJSON) {
        analyzeFloodRoute();
    }
};

// 3. Phân tích Route cắt qua Danger Zones
function analyzeFloodRoute() {
    if (!currentRouteGeoJSON || !currentDangerPolygons) return;

    let segments = [];
    const routeCoords = currentRouteGeoJSON.geometry.coordinates;
    
    // Tạo LineString cho route hiện tại
    const routeLine = turf.lineString(routeCoords);
    
    // Nếu không có vùng nguy hiểm nào, toàn bộ là an toàn
    if (currentDangerPolygons.features.length === 0) {
        segments.push(turf.feature(routeLine.geometry, { risk: 'safe' }));
    } else {
        // Logic cắt đoạn: Thay vì cắt phức tạp, chúng ta sẽ chia LineString thành các đoạn nhỏ giữa từng điểm toạ độ
        // và kiểm tra xem đoạn nhỏ đó có giao cắt với vùng nguy hiểm không. (Phù hợp cho Phase 1)
        
        let currentStatus = null;
        let currentChunkCoords = [];
        
        for (let i = 0; i < routeCoords.length - 1; i++) {
            const pt1 = routeCoords[i];
            const pt2 = routeCoords[i+1];
            const segmentLine = turf.lineString([pt1, pt2]);
            
            let isDanger = false;
            for (const dangerPoly of currentDangerPolygons.features) {
                // Nếu giao nhau hoặc nằm trong
                if (turf.booleanIntersects(segmentLine, dangerPoly)) {
                    isDanger = true;
                    break;
                }
            }
            
            const segStatus = isDanger ? 'danger' : 'safe';
            
            if (currentStatus === null) {
                currentStatus = segStatus;
                currentChunkCoords.push(pt1, pt2);
            } else if (currentStatus === segStatus) {
                currentChunkCoords.push(pt2);
            } else {
                // Đổi trạng thái -> Lưu chunk cũ
                segments.push(turf.feature(turf.lineString(currentChunkCoords).geometry, { risk: currentStatus }));
                // Bắt đầu chunk mới
                currentStatus = segStatus;
                currentChunkCoords = [pt1, pt2]; // Đoạn mới nối tiếp
            }
        }
        
        if (currentChunkCoords.length > 1) {
            segments.push(turf.feature(turf.lineString(currentChunkCoords).geometry, { risk: currentStatus }));
        }
    }

    const segmentedCollection = turf.featureCollection(segments);
    
    // Cập nhật lên MapLibre
    if (navMapInstance.getSource('nav-route-source')) {
        navMapInstance.getSource('nav-route-source').setData(segmentedCollection);
    }
    
    // Cập nhật UI Summary
    const hasDanger = segments.some(s => s.properties.risk === 'danger');
    const statusEl = document.getElementById('nav-summary-status');
    if (hasDanger) {
        statusEl.className = 'nav-summary-status danger';
        statusEl.innerHTML = '<span class="nav-status-icon">⚠️</span> Nguy cơ ngập trên tuyến. Đang tìm đường vòng...';
        fetchSafeAlternativeRoute();
    } else {
        statusEl.className = 'nav-summary-status safe';
        statusEl.innerHTML = '<span class="nav-status-icon">✓</span> Lộ trình an toàn';
        if (navMapInstance.getSource('nav-alt-route-source')) {
            navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([]));
        }
    }
    document.getElementById('nav-summary-panel').style.display = 'block';
}

async function fetchSafeAlternativeRoute() {
    if (!currentStartCoords || !currentEndCoords || !currentDangerPolygons || currentDangerPolygons.features.length === 0) return;
    
    try {
        const multiPolygonCoords = currentDangerPolygons.features.map(f => f.geometry.coordinates);
        
        const res = await fetch('/api/navigation/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: currentStartCoords,
                end: currentEndCoords,
                avoid_polygons: {
                    type: "MultiPolygon",
                    coordinates: multiPolygonCoords
                }
            })
        });
        
        if (!res.ok) throw new Error("Alternative routing failed");
        
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
        statusEl.innerHTML = `<span class="nav-status-icon">✓</span> Đã tìm thấy lộ trình vòng tránh ngập (${distKm}km, ${timeMin} phút)`;
        statusEl.className = 'nav-summary-status safe';
        
    } catch (e) {
        console.error("Lỗi lấy lộ trình thay thế:", e);
        const statusEl = document.getElementById('nav-summary-status');
        statusEl.innerHTML = '<span class="nav-status-icon">⚠️</span> Nguy cơ ngập. Không tìm thấy đường vòng an toàn!';
    }
}

// 4. Gọi API Routing Backend
async function fetchRoute() {
    if (!currentStartCoords || !currentEndCoords) return;
    
    try {
        const res = await fetch('/api/navigation/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: currentStartCoords,
                end: currentEndCoords
            })
        });
        
        if (!res.ok) throw new Error("Routing failed");
        
        const data = await res.json();
        const routeFeature = data.features[0];
        currentRouteGeoJSON = routeFeature;
        
        // Xóa lộ trình thay thế cũ
        if (navMapInstance.getSource('nav-alt-route-source')) {
            navMapInstance.getSource('nav-alt-route-source').setData(turf.featureCollection([]));
        }
        
        renderRouteLabels(routeFeature);

        // Cập nhật Metrics
        const props = routeFeature.properties;
        const distKm = (props.segments[0].distance / 1000).toFixed(1);
        const timeMin = Math.round(props.segments[0].duration / 60);
        
        document.getElementById('nav-summary-dist').innerText = `${distKm} km`;
        document.getElementById('nav-summary-time').innerText = `${timeMin} phút`;
        
        // Tiến hành phân tích ngập
        analyzeFloodRoute();
        
        // Auto Fit Camera
        const bbox = turf.bbox(currentRouteGeoJSON);
        // Bounding box [minLng, minLat, maxLng, maxLat]
        navMapInstance.fitBounds(bbox, {
            padding: { top: 200, bottom: 150, left: 350, right: 50 }, // Bù khoảng trống cho Sidebar và UI Nổi
            duration: 1000
        });
        
    } catch (e) {
        console.error("Lỗi lấy lộ trình:", e);
    }
}

// Hàm render tên đường dùng chung
function renderRouteLabels(routeFeature) {
    if (typeof routeLabelMarkers === 'undefined') {
        window.routeLabelMarkers = [];
    }
    // Xóa các marker cũ
    window.routeLabelMarkers.forEach(m => m.remove());
    window.routeLabelMarkers = [];

    const steps = routeFeature.properties.segments[0].steps;
    const coords = routeFeature.geometry.coordinates;
    
    if (steps) {
        steps.forEach(step => {
            if (step.name && step.name !== '-' && step.way_points) {
                const startIdx = step.way_points[0];
                const endIdx = step.way_points[1];
                const stepCoords = coords.slice(startIdx, endIdx + 1);
                
                if (stepCoords.length > 1) {
                    const line = turf.lineString(stepCoords);
                    const length = turf.length(line);
                    
                    const midPoint = turf.along(line, length / 2).geometry.coordinates;
                    
                    let bearing = 0;
                    if (length > 0.01) {
                        const p1 = turf.along(line, Math.max(0, (length / 2) - 0.005)).geometry.coordinates;
                        const p2 = turf.along(line, Math.min(length, (length / 2) + 0.005)).geometry.coordinates;
                        bearing = turf.bearing(turf.point(p1), turf.point(p2));
                    }
                    
                    let rotation = bearing - 90;
                    if (rotation > 90 || rotation < -90) {
                        rotation += 180;
                    }

                    const el = document.createElement('div');
                    el.innerText = step.name;
                    el.style.color = '#ffffff';
                    el.style.fontSize = '12px';
                    el.style.fontWeight = 'bold';
                    el.style.textShadow = '0px 0px 4px #000000, 0px 0px 4px #000000, 0px 0px 4px #000000';
                    el.style.pointerEvents = 'none';
                    el.style.whiteSpace = 'nowrap';
                    el.style.transform = `translate(-50%, -50%)`;

                    const marker = new maplibregl.Marker({
                        element: el,
                        rotation: rotation,
                        rotationAlignment: 'map',
                        pitchAlignment: 'map'
                    })
                    .setLngLat(midPoint)
                    .addTo(navMapInstance);
                    
                    window.routeLabelMarkers.push(marker);
                }
            }
        });
    }
}

// 5. Autocomplete Geocoding
let geocodeTimeout = null;
async function handleGeocode(inputId, suggId, setCoordsCallback) {
    const text = document.getElementById(inputId).value;
    const suggEl = document.getElementById(suggId);
    
    if (text.length < 3) {
        suggEl.style.display = 'none';
        return;
    }
    
    clearTimeout(geocodeTimeout);
    geocodeTimeout = setTimeout(async () => {
        try {
            suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#8892b0;">⏳ Đang tìm kiếm...</div>';
            suggEl.style.display = 'block';

            const res = await fetch(`/api/navigation/geocode?text=${encodeURIComponent(text)}`);
            if (!res.ok) {
                suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#e53935;">⚠️ Lỗi API. Hãy kiểm tra API Key và khởi động lại Backend.</div>';
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
                    // fetchRoute(); // Bỏ tự động fetchRoute để người dùng tự bấm nút mũi tên
                };
                suggEl.appendChild(item);
            });
            
        } catch (e) {
            console.error("Geocoding error", e);
            suggEl.innerHTML = '<div class="nav-suggestion-item" style="color:#e53935;">⚠️ Không kết nối được Backend.</div>';
        }
    }, 500); // Debounce 500ms
}

function updateMarkers() {
    if (currentStartCoords) {
        if (!startMarker) {
            const el = document.createElement('div');
            el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L20 21L12 17L4 21L12 2Z" fill="#1E88E5" stroke="#FFFFFF" stroke-width="2"/></svg>`;
            el.style.transform = "translate(-50%, -50%)"; // Center
            el.style.cursor = "pointer";
            startMarker = new maplibregl.Marker({ element: el })
                .setLngLat(currentStartCoords)
                .addTo(navMapInstance);
        } else {
            startMarker.setLngLat(currentStartCoords);
        }
    }
    
    if (currentEndCoords) {
        if (!endMarker) {
            const el = document.createElement('div');
            // Marker đỏ có chấm tròn ở giữa giống google maps
            el.innerHTML = `<svg width="28" height="42" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z" fill="#EA4335"/><circle cx="12" cy="12" r="4.5" fill="#7D1308"/></svg>`;
            el.style.cursor = "pointer";
            endMarker = new maplibregl.Marker({ element: el, offset: [0, -21] }) // offset y bằng -1/2 height (42/2) để ghim tại mũi nhọn
                .setLngLat(currentEndCoords)
                .addTo(navMapInstance);
        } else {
            endMarker.setLngLat(currentEndCoords);
        }
    }
}

// 6. Gắn sự kiện UI
document.getElementById('nav-start-input').addEventListener('input', () => {
    handleGeocode('nav-start-input', 'nav-start-suggestions', (coords) => { currentStartCoords = coords; });
});
document.getElementById('nav-end-input').addEventListener('input', () => {
    handleGeocode('nav-end-input', 'nav-end-suggestions', (coords) => { currentEndCoords = coords; });
});

// Xử lý nút mũi tên và Enter
document.getElementById('nav-submit-btn').addEventListener('click', fetchRoute);
document.getElementById('nav-start-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchRoute();
});
document.getElementById('nav-end-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchRoute();
});

// Đóng suggestions khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-input-wrapper')) {
        document.getElementById('nav-start-suggestions').style.display = 'none';
        document.getElementById('nav-end-suggestions').style.display = 'none';
    }
});

// 7. Lắng nghe Layer Active từ layout.js để Resize
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.id === 'layer-navigation') {
            if (mutation.target.classList.contains('layer-active')) {
                initNavigationMap();
                setTimeout(() => { if (navMapInstance) navMapInstance.resize(); }, 300);
                // Phân tích lại ngập lụt nếu có route sẵn
                if (lastKnownFloodData) updateNavigationFloodData(lastKnownFloodData);
            }
        }
    });
});
observer.observe(document.getElementById('layer-navigation'), { attributes: true, attributeFilter: ['class'] });



