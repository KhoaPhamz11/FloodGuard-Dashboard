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

async function fetchHistoryData() { // Hàm lấy dữ liệu lịch sử 6 tiếng (Dùng khi người dùng chọn xem biểu đồ history)
    try {
        const response = await fetch("/api/history"); // Gửi yêu cầu đến endpoint của Backend
        const data = await response.json(); // Trích xuất cục JSON từ câu trả lời của Backend
        return data;
    } catch (error) {
        console.error("Lỗi kết nối API history:", error);
        return null;
    }
}