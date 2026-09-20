// File: js/api.js  - File frontend gọi API từ Backend FastAPI
// Nhiệm vụ: Gọi API lấy dữ liệu từ Backend FastAPI
async function fetchLatestData() {   // Hàm lấy dữ liệu mới nhất (Realtime - dùng mỗi giây)
    try {
        const response = await fetch("/api/latest");   // Gửi yêu cầu đến endpoint của Backend
        const data = await response.json(); // Trích xuất cục JSON từ câu trả lời của Backend
        return data; 
    } catch (error) {  // Nếu sập mạng hoặc Backend tắt, báo lỗi ra màn hình F12
        console.error("Lỗi khi gọi API latest:", error);
        return null;
    }
}

async function fetchHistoryData(minutes = 360) { // Hàm lấy dữ liệu lịch sử (Dùng khi người dùng chọn xem biểu đồ history)
    try {
        const response = await fetch(`/api/history?minutes=${minutes}`); // Gửi yêu cầu đến endpoint của Backend
        const data = await response.json(); // Trích xuất cục JSON từ câu trả lời của Backend
        return data;
    } catch (error) {
        console.error("Lỗi kết nối API history:", error);
        return null;
    }
}

async function fetchForecast({ latitude, longitude, at, horizons = [1, 3, 6, 24] }) {
    const params = new URLSearchParams({
        latitude,
        longitude,
        horizons: horizons.join(","),
        source: "mongo"
    });
    if (at) params.set("at", at);
    const response = await fetch(`/api/forecast?${params}`);
    if (!response.ok) throw new Error(`Forecast request failed: ${response.status}`);
    return response.json();
}

async function fetchStationForecasts({ at, horizon }) {
    const params = new URLSearchParams({ horizon, source: "mongo" });
    const response = await fetch(`/api/forecast/stations?${params}`);
    if (!response.ok) throw new Error(`Station forecast request failed: ${response.status}`);
    return response.json();
}