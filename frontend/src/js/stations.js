//Đọc dữ liệu của 9 trạm sau đó đưa các con số độ sâu H(t),tốc độ dâng V(t), và Risk Score  lên trên 9 ô đó.
// Đổi màu ô dựa trên cảnh báo và xử lí hiệu ứng khi người dùng click vào 1 ô.
/* 
Kiến thức sử dụng:forEach() để lặp qua mảng 9 trạm.  
document.getElementById() để túm lấy các thẻ HTML theo đúng hợp đồng ID.  
classList.remove() và classList.add() để gỡ màu cũ, khoác màu mới.  
addEventListener("click") để lắng nghe cú click chuột của người dùng.  
*/

let currentSelectedStationId = 1;  // Biến lưu trạng thái xem người dùng đang click chọn trạm nào (mặc định mở web lên là trạm 1)

function updateStationCards(stationsData) {   // HÀM 1: CẬP NHẬT SỐ LIỆU VÀ MÀU SẮC 9 Ô (Hàm này sẽ được gọi mỗi giây bởi app.js khi có data mới) với station data là dữ liệu của mảng gồm 9 object ứng với thông tin của 9 trạm.
    stationsData.forEach(station => {       
        const id = station.station_id;                                  // Khi duyệt qua id thứ i thì gán id đó cho biến 'id'
        const card = document.getElementById(`station-card-${id}`);     // tìm trong html card của trạm có id ứng với 'id' đã gán vào biến card.
        const depthVal = document.getElementById(`depth-val-${id}`);    // tìm trong html độ sâu có id ứng với 'id' đã gán vào biến depthVal
        const rateVal = document.getElementById(`rate-val-${id}`);      // tìm trong html tốc độ dâng có id ứng với 'id' đã gán vào biến rateVal
        const riskVal = document.getElementById(`risk-val-${id}`);      // tìm trong html risk score có id ứng với 'id' đã gán vào biến riskVal
        if (!card) return;                                              // Nếu HTML chưa viết xong thẻ này thì bỏ qua để không báo lỗi

      
        if (depthVal) depthVal.textContent = station.depth_H;           // Nếu biến DepthVal có tồn tại thì gán vào biến depth_H của station thứ i và đưa lên trên màn hình.
        if (rateVal) rateVal.textContent = station.rise_rate_V;         // Nếu biến rateVal có tồn tại thì gán vào biến rise_rase_V của station thứ i và đưa lên trên màn hình.
        if (riskVal) riskVal.textContent = station.risk_score;          // Nếu biến riskVal có tồn tại thì gán vào biến risk_score của station thứ i và đưa lên trên màn hình.

        // 3. Xử lý đổi màu theo trạng thái (Hợp đồng Class)
        card.classList.remove("status-safe", "status-advisory", "status-warning", "status-critical");     // Bước A: Lột sạch các class màu cũ đi
        if (station.status === "SAFE") {                  // Bước B: Mặc áo mới tùy theo status hiện tại
            card.classList.add("status-safe");            // Nếu status là an toàn thì thêm thẻ safe
        } else if (station.status === "ADVISORY") {       // Nếu status là cảnh báo nhẹ thì thêm thẻ advisory
            card.classList.add("status-advisory");       
        } else if (station.status === "WARNING") {        // Nếu status là cánh báo thì thêm thẻ warning                                
            card.classList.add("status-warning");
        } else if (station.status === "CRITICAL") {       // Nếu status là cánh báo nguy hiểm thì thêm thẻ critical
            card.classList.add("status-critical");
        }
    });
}

function buildStationCardsAndDropdown() {
    const grid = document.getElementById("stationsGrid");
    const select = document.getElementById("station-select");
    if (!grid) return;

    grid.innerHTML = "";
    if (select) select.innerHTML = "";

    for (let i = 1; i <= 9; i++) {
        // Build card
        const card = document.createElement("div");
        card.className = "station-card status-safe";
        card.id = `station-card-${i}`;
        
        card.innerHTML = `
            <h3>Trạm ${i}</h3>
            <div class="station-metrics">
                <p>Mực nước ngập: <span id="depth-val-${i}">0</span> m</p>
                <p>Tốc độ dâng: <span id="rate-val-${i}">0</span> m/s</p>
                <p>Rủi ro: <span id="risk-val-${i}">0</span></p>
            </div>
        `;
        grid.appendChild(card);

        // Build option
        if (select) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = `Trạm ${i}`;
            select.appendChild(option);
        }
    }
    
    if (select) {
        select.addEventListener("change", (e) => {
            selectStation(parseInt(e.target.value));
        });
    }
}

function initStationClickEvents() {     // HÀM 2: LẮNG NGHE SỰ KIỆN CLICK CHUỘT (Hàm này chỉ chạy 1 lần duy nhất khi web vừa load xong)
    buildStationCardsAndDropdown();
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