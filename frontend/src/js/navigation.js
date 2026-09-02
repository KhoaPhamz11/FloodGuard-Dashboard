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
        
        // Marker Sources
        navMapInstance.addSource('nav-markers-source', {
            'type': 'geojson',
            'data': turf.featureCollection([])
        });
        navMapInstance.addLayer({
            'id': 'nav-markers-layer',
            'type': 'circle',
            'source': 'nav-markers-source',
            'paint': {
                'circle-radius': 8,
                'circle-color': ['match', ['get', 'type'], 'start', '#28a745', 'end', '#ff9800', '#fff'],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });

        // Áp dụng lại Flood Data nếu có sẵn trước khi map load
        if (lastKnownFloodData) {
            updateNavigationFloodData(lastKnownFloodData);
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
            const buffer = turf.buffer(point, FLOOD_ALERT_RADIUS_KM, { units: 'kilometers' });
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
        statusEl.innerHTML = '<span class="nav-status-icon">⚠️</span> Nguy cơ ngập trên tuyến';
    } else {
        statusEl.className = 'nav-summary-status safe';
        statusEl.innerHTML = '<span class="nav-status-icon">✓</span> Lộ trình an toàn';
    }
    document.getElementById('nav-summary-panel').style.display = 'block';
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
    const features = [];
    if (currentStartCoords) features.push(turf.point(currentStartCoords, { type: 'start' }));
    if (currentEndCoords) features.push(turf.point(currentEndCoords, { type: 'end' }));
    
    if (navMapInstance && navMapInstance.getSource('nav-markers-source')) {
        navMapInstance.getSource('nav-markers-source').setData(turf.featureCollection(features));
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



