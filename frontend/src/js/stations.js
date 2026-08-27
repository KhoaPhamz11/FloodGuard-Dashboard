//Đọc dữ liệu của 9 trạm sau đó đưa các con số độ sâu H(t),tốc độ dâng V(t), và Risk Score  lên trên 9 ô đó.
// Đổi màu ô dựa trên cảnh báo và xử lí hiệu ứng khi người dùng click vào 1 ô.
/* 
Kiến thức sử dụng:forEach() để lặp qua mảng 9 trạm.  
document.getElementById() để túm lấy các thẻ HTML theo đúng hợp đồng ID.  
classList.remove() và classList.add() để gỡ màu cũ, khoác màu mới.  
addEventListener("click") để lắng nghe cú click chuột của người dùng.  
*/

let currentSelectedStationId = 1;  // Biến lưu trạng thái xem người dùng đang click chọn trạm nào (mặc định mở web lên là trạm 1)

// HÀM MỚI THÊM VÀO (lần sửa trước): TẠO SẴN KHUNG HTML CHO 9 Ô TRẠM
// HTML để trống #stationsGrid và ghi chú "sẽ tạo động bằng JavaScript" nhưng không có hàm nào làm việc đó,
// nên card luôn = null, updateStationCards()/initStationClickEvents() bên dưới không tìm thấy gì để chạy.
// Được gọi 1 lần lúc khởi động, TRƯỚC initStationClickEvents() (xem app.js, hàm initDashboard()).
function createStationCards() {
    const grid = document.getElementById("stationsGrid");           // Tìm khung lưới 3x3 khai báo trong index.html
    if (!grid) return;                                               // Nếu chưa có khung này thì thoát ra an toàn

    for (let i = 1; i <= 9; i++) {                                   // Tạo đúng 9 thẻ với ID mà các hàm bên dưới đang tìm (station-card-1 ... station-card-9)
        const card = document.createElement("div");
        card.className = "station-card";                            // Class mặc định, màu trạng thái sẽ do updateStationCards() thêm vào khi có data
        card.id = `station-card-${i}`;

        card.innerHTML = `
            <div class="station-name">Trạm ${i}</div>
            <div class="station-depth">Độ sâu: <span id="depth-val-${i}">--</span> m</div>
            <div class="station-rate">Tốc độ dâng: <span id="rate-val-${i}">--</span> m/phút</div>
            <div class="station-risk" id="risk-val-${i}">--</div>
            <div class="station-status-text">Đang chờ dữ liệu...</div>
        `;

        grid.appendChild(card);                                      // Dán thẻ trạm vào khung lưới
    }
}

// HÀM MỚI THÊM VÀO (lần này): Mongo lưu tên trạm dạng chuỗi "station_1".."station_9" (field station_name),
// KHÔNG có field số station_id như code cũ giả định. Hàm này bóc số ra từ chuỗi để khớp với
// id="station-card-1"..."station-card-9" đã tạo ở createStationCards() phía trên.
// Dùng chung cho cả chart.js và notification.js (gọi trực tiếp vì stations.js được nạp trước 2 file đó trong index.html).
function getStationNumericId(station) {
    return parseInt(station.station_name.split("_")[1], 10);
}

// HÀM MỚI THÊM VÀO (lần này): Mongo trả field "code" (số, ví dụ 0) thay vì chữ "SAFE"/"ADVISORY"/"WARNING"/"CRITICAL"
// như code cũ giả định (station.status thật ra là tiếng Việt "An toàn", không dùng để so sánh được).
// Hàm này dịch code số sang đúng 4 mức mà CSS (status-safe, status-advisory, status-warning, status-critical) đang cần.
// QUY ƯỚC TẠM: 0 = An toàn, 1 = Cảnh báo nhẹ, 2 = Cảnh báo, 3 = Nguy hiểm
// -> NHÓM KIỂM TRA LẠI cho khớp đúng thang code thật bên xử lý dữ liệu (S_risk/T_crit_min), sửa lại map bên dưới nếu khác.
function getStatusFromCode(code) {
    const map = { 0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL" };
    return map[code] !== undefined ? map[code] : "SAFE";
}

function updateStationCards(stationsData) {   // HÀM 1: CẬP NHẬT SỐ LIỆU VÀ MÀU SẮC 9 Ô (Hàm này sẽ được gọi mỗi giây bởi app.js khi có data mới) với station data là dữ liệu của mảng gồm 9 object ứng với thông tin của 9 trạm.
    stationsData.forEach(station => {       
        const id = getStationNumericId(station);                        // SỬA: lấy id số từ station_name (station.station_id không tồn tại trong data thật)
        const card = document.getElementById(`station-card-${id}`);     // tìm trong html card của trạm có id ứng với 'id' đã gán vào biến card.
        const depthVal = document.getElementById(`depth-val-${id}`);    // tìm trong html độ sâu có id ứng với 'id' đã gán vào biến depthVal
        const rateVal = document.getElementById(`rate-val-${id}`);      // tìm trong html tốc độ dâng có id ứng với 'id' đã gán vào biến rateVal
        const riskVal = document.getElementById(`risk-val-${id}`);      // tìm trong html risk score có id ứng với 'id' đã gán vào biến riskVal
        if (!card) return;                                              // Nếu HTML chưa viết xong thẻ này thì bỏ qua để không báo lỗi

        if (depthVal) depthVal.textContent = Number(station.H).toFixed(2);       // SỬA: field thật là 'H' (không phải depth_H); toFixed(2) cho khỏi lòi số thập phân dài
        if (rateVal) rateVal.textContent = Number(station.V).toFixed(2);         // SỬA: field thật là 'V' (không phải rise_rate_V)
        if (riskVal) riskVal.textContent = Number(station.S_risk).toFixed(2);    // SỬA: field thật là 'S_risk' (không phải risk_score)

        const status = getStatusFromCode(station.code);                 // SỬA: suy ra SAFE/ADVISORY/WARNING/CRITICAL từ 'code' thay vì đọc thẳng station.status

        // 3. Xử lý đổi màu theo trạng thái (Hợp đồng Class)
        card.classList.remove("status-safe", "status-advisory", "status-warning", "status-critical");     // Bước A: Lột sạch các class màu cũ đi
        if (status === "SAFE") {                  // Bước B: Mặc áo mới tùy theo status hiện tại
            card.classList.add("status-safe");            // Nếu status là an toàn thì thêm thẻ safe
        } else if (status === "ADVISORY") {       // Nếu status là cảnh báo nhẹ thì thêm thẻ advisory
            card.classList.add("status-advisory");       
        } else if (status === "WARNING") {        // Nếu status là cánh báo thì thêm thẻ warning                                
            card.classList.add("status-warning");
        } else if (status === "CRITICAL") {       // Nếu status là cánh báo nguy hiểm thì thêm thẻ critical
            card.classList.add("status-critical");
        }
    });
}

function initStationClickEvents() {     // HÀM 2: LẮNG NGHE SỰ KIỆN CLICK CHUỘT (Hàm này chỉ chạy 1 lần duy nhất khi web vừa load xong)
    for (let i = 1; i <= 9; i++) {                                  // Hàm này tìm 9 cái thẻ của 9 trạm, rồi gắn sự kiện click chuột cho từng cái card.
        const card = document.getElementById(`station-card-${i}`);
        if (card) {
            card.addEventListener("click", () => {                  // Khi người dùng click chuột vào thẻ card nào, gọi hàm selectStation cho card đó.
                selectStation(i);
            });
        }
    }
}


function selectStation(stationId) {                                              // HÀM 3: XỬ LÝ KHI NGƯỜI DÙNG CHỌN 1 TRẠM, id được gán làm biến đầu vào.
    currentSelectedStationId = stationId;                                        // Lưu lại ID trạm vừa chọn
                         
    for (let i = 1; i <= 9; i++) {                                               // Gỡ bỏ hiệu ứng "đang được chọn" (viền sáng) ở
        const card = document.getElementById(`station-card-${i}`);   
        if (card) {                                                              //  đây phải duyệt qua 9 thằng vì sẽ không biết thằng được chọn trước đó là thằng nào.
            card.classList.remove("station-selected");
        }
    }
    const selectedCard = document.getElementById(`station-card-${stationId}`);   // Gắn hiệu ứng "đang được chọn" vào đúng cái ô vừa click
    if (selectedCard) {
        selectedCard.classList.add("station-selected");
    }
    
    const chartModelDropdown = document.getElementById("chart-mode-select");   // Không thay đổi dropdown đọc xem người dùng hiện tại đang xem biểu đồ nào
    let currentChartType = "realtime-rain";                                   //Giá trị mặc định an toàn

    if (chartModelDropdown) {                                                   
        currentChartType = chartModelDropdown.value;
    }
    
    if (typeof updateChartForStation === "function") {                          // Ra lệnh vẽ lại biểu đồ với 2 thông số độc lập: (Trạm vừa click, Loại biểu đồ đang chọn)
        updateChartForStation(currentSelectedStationId, currentChartType);
    }
    // Ghi chú: Tương lai chúng ta sẽ gọi hàm của charts.js ở đây để vẽ lại biểu đồ
    // ví dụ: updateChartForStation(stationId);
}