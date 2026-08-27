// Nhận gói dữ liệu mới nhất được chuyển từ app.js  kiểm tra xem trong 9 trạm có trạm nào đang ở trạng thái nguy hiểm (khác Safe) hoặc có nguyên nhân gây ngập nào khác ngoài Normal không
//Nếu có nó sẽ tạo ra một thẻ html nhỏ chứa đầy đủ thông tin: Thời gian, tên trạm, trạng thái, nguyên nhân và lời cảnh báo. Sau đó nó dán tờ thông báo này lên đầu mảng tin (notification- feed)



function updateNotificationFeed(latestData) {                    //HÀM 1: DUYỆT QUA 9 TRẠM ĐỂ TÌM SỰ CỐ (Hàm này sẽ được gọi mỗi giây từ app.js)    
    const feed = document.getElementById("notification-feed");          // Tìm cái bảng tin trên giao diện HTML và gắn vào biến feed.
    if (!feed) return;                                                 // Nếu chưa có thẻ này trong HTML thì thoát ra an toàn               
    const timeString = latestData.timestamp;                          // SỬA: field thật là 'timestamp' (không phải datetime_str)
  
    latestData.stations_data.forEach(station => {                    // SỬA: field thật là 'stations_data' (không phải stations)
        if (station.code !== 0) {                                    // SỬA: Mongo không có field 'root_cause'; dùng 'code' !== 0 (quy ước 0 = An toàn, xem getStatusFromCode ở stations.js) để biết trạm nào đang có sự cố
            createNotificationItem(feed, timeString, station);                  // Gọi hàm tạo cảnh báo với input là thẻ thông báo của html, thời gian, và trạm thứ i đang chuyệt
        }
    });
}



function createNotificationItem(feedElement, timeString, station) {         //Hàm tạo cảnh báo với 3 input là thẻ thông báo của html, thời gian, và trạm thứ i đang chuyệt     
    const alertItem = document.createElement("div");                        // Tạo ra một cái thẻ <div> trống trong bộ nhớ quản lí bằn biến Alert Item 
    const status = typeof getStatusFromCode === "function" ? getStatusFromCode(station.code) : "ADVISORY";  // SỬA: suy ra SAFE/ADVISORY/WARNING/CRITICAL từ 'code' (hàm dùng chung viết trong stations.js), vì station.status thật là tiếng Việt "An toàn" không so sánh trực tiếp được

    alertItem.classList.add("alert-item");                                  // Khung bo góc cơ bản của từng dòng tin.
    if (status === "ADVISORY") {                                            // Nếu là cảnh báo nhẹ thì thêm hiệu ứng Advisory cho thẻ <div>
        alertItem.classList.add("status-advisory");                 
    } else if (status === "WARNING") {                                      // Nếu là cảnh báo nặng thì thêm hiệu ứng Warning cho thẻ <div>.
        alertItem.classList.add("status-warning");
    } else if (status === "CRITICAL") {                                     //Nếu là nguy hiểm thì thêm hiệu ứng Criticalcho thẻ <div>
        alertItem.classList.add("status-critical");
    }

    // SỬA: Mongo không có field 'root_cause' hay 'message' như code cũ giả định.
    // Tạm dùng 'description' (chữ Việt có sẵn, vd "An toàn") + 'S_risk' để thay thế.
    // Nhóm chỉnh lại nội dung hiển thị ở đây nếu backend sau này thêm field message/nguyên nhân riêng.
    alertItem.innerHTML = `                     
        <strong>[${timeString}] ${station.station_name}</strong><br>
        <span>Trạng thái: <b>${station.description}</b></span><br>
        <span><em>Risk score: ${Number(station.S_risk).toFixed(2)}</em></span>
    `;

    feedElement.prepend(alertItem);                              // Dán thẻ div này vào vị trí ĐẦU TIÊN của bảng tin (prepend) để giúp tin mới nhất luôn nằm trên cùng, đẩy tin cũ xuống dưới    
    if (feedElement.children.length > 50) {                     // Dọn dẹp: Không để bảng tin dài vô tận làm nặng trình duyệt, feedElement tập hợp các phần tử con của HTML trực tiếp bên trong thẻ thông báo của html (FeedElemnet)
        feedElement.removeChild(feedElement.lastChild);         
    }
}