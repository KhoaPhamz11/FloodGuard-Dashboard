/**
 * test_forecast_pipeline.mjs
 * ---------------------------
 * Script test pipeline Forecast + Navigation
 * Điểm đầu: Đinh Độc Lập
 * Điểm đến: Landmark 81
 *
 * Cách chạy:
 *   node tests/test_forecast_pipeline.mjs
 *
 * Yêu cầu: Backend đang chạy tại http://127.0.0.1:8000
 */

const BASE_URL = process.env.API_BASE || 'http://127.0.0.1:8000';

const START_TEXT = 'Đinh Độc Lập, Ho Chi Minh City, HC, Vietnam';
const END_TEXT   = 'Landmark 81, Ho Chi Minh City, HC, Vietnam';

async function geocode(text) {
    const url = `${BASE_URL}/api/navigation/geocode?text=${encodeURIComponent(text)}`;
    console.log(`\n📍 Geocode: "${text}"`);
    console.log(`   → GET ${url}`);

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Geocode failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    if (!data.features || data.features.length === 0) {
        throw new Error('Không tìm thấy kết quả geocode');
    }

    const best = data.features[0];
    const coords = best.geometry.coordinates; // [lng, lat]
    const label = best.properties?.label || best.properties?.name || text;

    console.log(`   ✓ Kết quả: ${label}`);
    console.log(`   ✓ Coords : [${coords[0]}, ${coords[1]}]`);
    return { coords, label, raw: best };
}

async function fetchRoute(startCoords, endCoords) {
    const url = `${BASE_URL}/api/navigation/route`;
    console.log(`\n🛣️  Route: ${startCoords} → ${endCoords}`);
    console.log(`   → POST ${url}`);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start: startCoords,
            end: endCoords
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Route failed: ${res.status} ${res.statusText}\n${text}`);
    }

    const data = await res.json();
    if (!data.features || data.features.length === 0) {
        throw new Error('API trả về không có feature route');
    }

    const route = data.features[0];
    const props = route.properties?.segments?.[0] || {};
    const distKm = props.distance ? (props.distance / 1000).toFixed(2) : '—';
    const timeMin = props.duration ? Math.round(props.duration / 60) : '—';

    console.log(`   ✓ Distance : ${distKm} km`);
    console.log(`   ✓ Duration : ${timeMin} phút`);
    console.log(`   ✓ Steps    : ${props.steps?.length || 0} bước`);
    console.log(`   ✓ Coords count: ${route.geometry?.coordinates?.length || 0}`);

    return { route, data };
}

async function tryForecastEndpoints(lat, lng) {
    console.log(`\n🤖 Thử các endpoint Forecast phổ biến (lat=${lat}, lng=${lng})`);

    const candidates = [
        // Các path có thể tồn tại trong hệ thống
        `/api/forecast?latitude=${lat}&longitude=${lng}&horizons=24`,
        `/api/forecast/point?lat=${lat}&lng=${lng}&horizon=24`,
        `/api/forecast/stations?horizon=24`,
        `/api/stations/forecast?horizon=24`,
        `/api/ai/forecast?latitude=${lat}&longitude=${lng}`,
        `/api/navigation/forecast?latitude=${lat}&longitude=${lng}&horizons=24`,
        `/api/latest`, // endpoint đang lỗi trong screenshot
    ];

    const results = [];

    for (const path of candidates) {
        const url = `${BASE_URL}${path}`;
        try {
            console.log(`   → GET ${path}`);
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const status = res.status;
            let body = null;
            try {
                body = await res.json();
            } catch {
                body = await res.text();
            }

            console.log(`     Status: ${status}`);
            if (status >= 200 && status < 300) {
                console.log(`     ✓ Thành công!`);
                results.push({ path, status, body });
            } else {
                console.log(`     ✗ ${status}`);
            }
        } catch (err) {
            console.log(`     ✗ Lỗi: ${err.message}`);
        }
    }

    return results;
}

async function main() {
    console.log('='.repeat(60));
    console.log('  FLOODGUARD – Test Forecast + Navigation Pipeline');
    console.log('  Start: Đinh Độc Lập  →  End: Landmark 81');
    console.log('='.repeat(60));
    console.log(`Base URL: ${BASE_URL}`);

    try {
        // 1. Geocode điểm đầu & điểm cuối
        const start = await geocode(START_TEXT);
        const end   = await geocode(END_TEXT);

        // 2. Lấy lộ trình
        const { route, data: routeData } = await fetchRoute(start.coords, end.coords);

        // 3. Lấy điểm giữa route để test forecast
        const coords = route.geometry.coordinates;
        const midIdx = Math.floor(coords.length / 2);
        const mid = coords[midIdx];
        console.log(`\n📌 Điểm giữa route (dùng để forecast): [${mid[0]}, ${mid[1]}]`);

        // 4. Thử các endpoint forecast
        const forecastResults = await tryForecastEndpoints(mid[1], mid[0]);

        // 5. In summary
        console.log('\n' + '='.repeat(60));
        console.log('  TÓM TẮT');
        console.log('='.repeat(60));
        console.log(`Start coords : [${start.coords[0]}, ${start.coords[1]}]`);
        console.log(`End coords   : [${end.coords[0]}, ${end.coords[1]}]`);
        console.log(`Route OK     : Yes`);
        console.log(`Forecast endpoints thành công: ${forecastResults.length}`);

        if (forecastResults.length > 0) {
            console.log('\n📦 Output của endpoint forecast thành công đầu tiên:');
            console.log(JSON.stringify(forecastResults[0].body, null, 2));
        } else {
            console.log('\n⚠️  Không endpoint forecast nào trả về 2xx.');
            console.log('   → Kiểm tra backend đã implement /api/forecast* chưa.');
            console.log('   → Hoặc xem log backend để biết path chính xác.');
        }

        // In thêm raw route (rút gọn)
        console.log('\n📦 Route properties (rút gọn):');
        console.log(JSON.stringify({
            type: routeData.type,
            features_count: routeData.features?.length,
            first_feature_props: route.properties
        }, null, 2));

    } catch (err) {
        console.error('\n❌ Lỗi pipeline:', err.message);
        process.exit(1);
    }
}

main();