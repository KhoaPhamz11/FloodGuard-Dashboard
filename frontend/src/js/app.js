// File này đóng vai trò là người nhạc trưởng điều khiển các module.
// Vòng lặp mỗi giây: nó kêu thằng api.js đi lấy cục dữ liệu mới về, sau đó chia cục đó cho 3 module khác là: stations.js, charts.js, và notifications.js để mỗi đứa tự làm phần việc của mình trên giao diện


let updateInterval; // Biến lưu trữ đồng hồ đếm nhịp

async function initDashboard() {                                                            // HÀM 1: KHỞI TẠO HỆ THỐNG KHI MỞ WEB
    console.log("Đang khởi tạo Dashboard FloodGuard...");                                   
   
    if (typeof initStationClickEvents === "function") initStationClickEvents();             // Đánh thức các sự kiện lắng nghe (Click chuột, đổi dropdown)
    if (typeof initChartEvents === "function") initChartEvents();

    if (typeof initRealtimeChart === "function") initRealtimeChart("realtime-rain");        // Khởi tạo khung biểu đồ ban đầu (mặc định trạm 1, xem lượng mưa realtime)
    const initialData = await fetchLatestData();                                            // Gọi mẻ dữ liệu đầu tiên về để hiển thị ngay lập tức (không phải đợi 1 giây)
    if (initialData) {
        console.log("Dữ liệu phút đầu tiên nhận được:", initialData);
        updateDashboardUI(initialData);                                                     // Truyền cho các module vẽ lên màn hình
    }
    startRealtimeUpdates();                                                                 // Bật công tắc cho vòng lặp chạy mỗi giây
}

// HÀM 2: PHÂN PHỐI DỮ LIỆU CHO 3 MODULE (PHẦN 1, 2, 3)
function updateDashboardUI(latestData) {  
    if (typeof updateStationCards === "function") {                  // Gọi Phần 1: Cập nhật 9 ô cảnh báo (Lưu ý: stations.js chỉ cần mảng 'stations')
        updateStationCards(latestData.stations);
    }
    if (typeof updateRealtimeChart === "function") {                 // Gọi Phần 2: Cập nhật biểu đồ Realtime
        updateRealtimeChart(latestData);
    }
    if (typeof updateNotificationFeed === "function") {              // Gọi Phần 3: Cập nhật bảng tin sự cố
        updateNotificationFeed(latestData);
    }
}

function startRealtimeUpdates() {                                   //HÀM 3: VÒNG LẶP REALTIME    
    updateInterval = setInterval(async () => {                     // Cứ mỗi 1000ms (1 giây thực tế = 1 phút mô phỏng), đoạn code trong này sẽ chạy 1 lần
        const latestData = await fetchLatestData();               // Nhờ api.js đi lấy data mới
        if (latestData) {                                            // Nếu lấy thành công, chia bài cho các module UI
            updateDashboardUI(latestData);
        }
    }, 1000);
}

// ĐIỂM KÍCH HOẠT: KHI HTML LOAD XONG
document.addEventListener("DOMContentLoaded", () => {               // Trình duyệt phải tải xong hết các thẻ <div>, <span> thì JS mới được quyền chạy
    initDashboard();
});
