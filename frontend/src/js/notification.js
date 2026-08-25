// Nhận gói dữ liệu mới nhất được chuyển từ app.js  kiểm tra xem trong 9 trạm có trạm nào đang ở trạng thái nguy hiểm (khác Safe) hoặc có nguyên nhân gây ngập nào khác ngoài Normal không
//Nếu có nó sẽ tạo ra một thẻ html nhỏ chứa đầy đủ thông tin: Thời gian, tên trạm, trạng thái, nguyên nhân và lời cảnh báo. Sau đó nó dán tờ thông báo này lên đầu mảng tin (notification- feed)



function updateNotificationFeed(latestData) {                    //HÀM 1: DUYỆT QUA 9 TRẠM ĐỂ TÌM SỰ CỐ (Hàm này sẽ được gọi mỗi giây từ app.js)    
    const feed = document.getElementById("notification-feed");          // Tìm cái bảng tin trên giao diện HTML và gắn vào biến feed.
    if (!feed) return;                                                 // Nếu chưa có thẻ này trong HTML thì thoát ra an toàn               
    const timeString = latestData.datetime_str;                       // Lấy thời gian hiện tại của gói dữ liệu, latestdata là 1 gói tin json bao gồm nhiều objects mỗi objects là 1 station nhưng dùng chung 1 thời gian.
  
    latestData.stations.forEach(station => {                         // Duyệt qua từng trạm một đặt tên cho mỗi object(trạm) là station.
        if (station.status !== "SAFE" || station.root_cause !== "NORMAL") {   // Nếu trạng thái của trạm thứ i không phải là safe hoặc nguyên nhân gốc rễ không phải normal thì:
            createNotificationItem(feed, timeString, station);                  // Gọi hàm tạo cảnh báo với input là thẻ thông báo của html, thời gian, và trạm thứ i đang chuyệt
        }
    });
}



function createNotificationItem(feedElement, timeString, station) {         //Hàm tạo cảnh báo với 3 input là thẻ thông báo của html, thời gian, và trạm thứ i đang chuyệt     
    const alertItem = document.createElement("div");                        // Tạo ra một cái thẻ <div> trống trong bộ nhớ quản lí bằn biến Alert Item 

    alertItem.classList.add("alert-item");                                  // Khung bo góc cơ bản của từng dòng tin.
    if (station.status === "ADVISORY") {                                    // Nếu là cảnh báo nhẹ thì thêm hiệu ứng Advisory cho thẻ <div>
        alertItem.classList.add("status-advisory");                 
    } else if (station.status === "WARNING") {                              // Nếu là cảnh báo nặng thì thêm hiệu ứng Warning cho thẻ <div>.
        alertItem.classList.add("status-warning");
    } else if (station.status === "CRITICAL") {                             //Nếu là nguy hiểm thì thêm hiệu ứng Criticalcho thẻ <div>
        alertItem.classList.add("status-critical");
    }

    // Viết nội dung chữ vào thẻ div dùng dấu backtick (`) để nhúng biến vào chuỗi HTML dễ dàng hơn (gọi là Template Literal)
    alertItem.innerHTML = `                     
        <strong>[${timeString}] ${station.name}</strong><br>
        <span>Trạng thái: <b>${station.status}</b></span> | <span>Nguyên nhân: <b>${station.root_cause}</b></span><br>
        <span><em>${station.message}</em></span>
    `;

    feedElement.prepend(alertItem);                              // Dán thẻ div này vào vị trí ĐẦU TIÊN của bảng tin (prepend) để giúp tin mới nhất luôn nằm trên cùng, đẩy tin cũ xuống dưới    
    if (feedElement.children.length > 50) {                     // Dọn dẹp: Không để bảng tin dài vô tận làm nặng trình duyệt, feedElement tập hợp các phần tử con của HTML trực tiếp bên trong thẻ thông báo của html (FeedElemnet)
        feedElement.removeChild(feedElement.lastChild);         
    }
}