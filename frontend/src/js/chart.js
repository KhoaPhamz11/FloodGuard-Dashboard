// File này dùng để vẽ biểu đồ. 
// Có 2 loại biểu đồ, biểu đồ realtime và biểu đồ vẽ cứ cách 6 tiếng vẽ 1 lần.
/* 
destroy(): Trước khi vẽ một loại biểu đồ mới (ví dụ đang vẽ đường chuyển sang vẽ cột), họa sĩ phải lấy giẻ lau sạch bảng cũ đi. Nếu không, các biểu đồ sẽ bị vẽ đè lên nhau sinh ra lỗi hiển thị
push() và shift(): Đối với biểu đồ Realtime, ta muốn nó chạy liên tục từ phải sang trái. 
Mỗi giây ta sẽ nhét (push) 1 điểm mới vào đuôi, và xóa (shift) 1 điểm cũ nhất ở đầu đi. Giống như một chiếc băng chuyền vậy!
*/


let floodChart = null; // Biến lưu trữ biểu đồ hiện tại (để destroy trước khi vẽ mới)
let currentChartStationId = 1; // Mặc định mở web là trạm 1
let currentChartType = "realtime-rain"; // Mặc định mở web là xem lượng mưa realtime

function initChartEvents() {                                             // HÀM 1: LẮNG NGHE SỰ KIỆN ĐỔI DROPDOWN BIỂU ĐỒ
    const chartModeSelect = document.getElementById("chart-mode-select");            // Gắn thẻ dropdown chọn biểu đồ trên html cho biến chartModeSelect. Giả sử thẻ dropdown bên trong có nhiều options.
    if (chartModeSelect) {                                                           
        chartModeSelect.addEventListener("change", (event) => {                     // Nếu có thẻ dropdown thì chờ và lắng ghe xem người dùng có thay đổi option của dropdown.
            const newChartType = event.target.value;                                // Nếu có thì xác định xem biểu đồ đc chọn mới là loại gì (event.target là dropdown nào vừa được tác độn, thêm.value là giá trị nào trong dropdown đang được chọn)
            updateChartForStation(currentChartStationId, newChartType);             // Gọi hàm vẽ lại biểu đồ với Trạm giữ nguyên, Loại biểu đồ mới
        });
    }
}

async function updateChartForStation(stationId, chartType) {           // HÀM 2: QUẢN LÝ LUỒNG VẼ BIỂU ĐỒ KHI ĐỔI TRẠM/CHẾ ĐỘ
    currentChartStationId = stationId;                                             // Lưu lại trạng thái mới nhất, với trạng thái mới nhất là input của biểu đồ.
    currentChartType = chartType;
    if (chartType === "history-rain-6h" || chartType === "history-tide-6h") {      // Chia luồng: Xem biểu đồ lịch sử hay xem Realtime?
        await renderHistoryChart(stationId, chartType);                            // Nếu là xem biểu đồ lịch sử thì mở hàm xây dựng biểu đồ lịch sử
    } else {
        initRealtimeChart(chartType);                                             // Nếu không phải hàm biểu đồ lịch sử thì mở hàm xây dựng biểu đồ realtime, tạo khung trục x,y thôi, còn dữ liệu thật thì nạp vào mỗi giây ở hàm 5.
    }
}



async function renderHistoryChart(stationId, chartType) {             // HÀM 3: VẼ BIỂU ĐỒ LỊCH SỬ 6 TIẾNG (360 ĐIỂM)
    const historyData = await fetchHistoryData();                               // Nhờ api.js gọi lấy data 6 tiếng (mảng 360 phần tử), hàm fetchHistoryData là hàm trong app.js
    if (!historyData || historyData.length === 0) return;                       // Nếu lịch sử trống thì return

    const labels = [];                                                          
    const dataPoints = [];
// Khúc này là thêm điểm lên biểu đồ.
    historyData.forEach(minuteData => {                                        // Duyệt qua từng objects trong data, đặt tên cho từng thằng objects là minutedata
        labels.push(minuteData.datetime_str); // Trục X là thời gian           // Nhãn ban đầu rỗng, mình đẩy thời gian vào nhãn tương đương với trục x. LƯU Ý KHÚC NÀY CẦN XÁC NHẬN LẠI CẤU TRÚC FILE JSON.
        const station = minuteData.stations.find(s => s.station_id === stationId);    // Trong danh sách các trạm trong 1 objects/1 phút (minuteData.stations), tìm trạm nào coi có id trùng với id của trạm đang được chọn.
        if (station) {                                                                
            if (chartType === "history-rain-6h") {                                    // Nếu biểu đồ đang là lượng mưa trong 6h thì
                dataPoints.push(station.rainfall_R);                                  // Thêm điểm mới vào cuối trục y ứng với lượng mưa của trạm có id trùng. 
            } else if (chartType === "history-tide-6h") {                             // Nếu biểu đồ là thuỷ triều trong 6h thì 
                dataPoints.push(station.tide_H);                                      // Thêm điểm mới vào cuối trục tung y ứng với thuỷ triều của trạm có id trùng.
            }
        }
    });

    if (floodChart) floodChart.destroy();                                             //Xóa biểu đồ cũ nếu có tồn tại 
    const ctx = document.getElementById("flood-chart-canvas");                        // Tìm thẻ canvas gắn vào ctx
    const chartStyle = chartType === "history-rain-6h" ? "bar" : "line";              // loại biểu đồ, nếu là lượng mưa thì biểu đồ cột, không phải thì đường (thuỷ triều)
    const labelName = chartType === "history-rain-6h" ? "Lượng mưa 6h (mm/phút)" : "Thủy triều 6h (m)"; // Nhãn tên nếu chọn biểu đồ lượng mưa 6h thì nhãn tên là lượng mưa 6h còn không là thuỷ triều 6h(mm/phút).

    floodChart = new Chart(ctx, {                                                     // Bắt đầu vẽ biểu đồ, với input là thẻ canvas và thông tin data biểu đồ.
        type: chartStyle,                                                             // Loại biểu đồ thì phụ thuộc vào biểu đồ đang được chọn.
        data: {
            labels: labels,                                                           // Bên trái là thuộc tính labels mà chart yêu cầu, bên phải là labels mà chúng ta định nghĩa ở trên là tức là trục x thời gian mình đã khai báo trước đó.                                 
            datasets: [{
                label: labelName,                                                     //Data để vẽ biểu đồ thì lấy lấy nhãn tên phụ thuộc vào biểu đồ đang được chọn.
                data: dataPoints,                                                     //Data điểm thì đã được thêm ở phái trên (giá trị trục y), ở đây nó sẽ ghép với trục x labels tương ứng.
                backgroundColor: "rgba(54, 162, 235, 0.5)",                        // Set up màu, viền
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,                                                       // Độ rộng viền
                pointRadius: 0 // Tắt chấm tròn để biểu đồ 360 điểm không bị rối mắt
            }]
        },
        options: { responsive: true }
    });
}



function initRealtimeChart(chartType) {                        // HÀM 4: KHỞI TẠO BIỂU ĐỒ REALTIME RỖNG (biến đầu vào là loại biểu đồ)
    if (floodChart) floodChart.destroy();                      // Xoá biểu đồ trước đó
    const ctx = document.getElementById("flood-chart-canvas"); // Gán thẻ <canvas> bằng biến ctx
    let chartStyle = "line";                                   // dạng biểu đồ mặc định là biểu đồ đường.
    let labelName = "";                                        // Tên biểu đồ để không.

     // Phân loại biểu đồ 
    if (chartType === "realtime-rain") {                       // Nếu là biểu đồ mưa thì loại biểu đồ là cột và name là lượng mưa realtime.  
        chartStyle = "bar";     
        labelName = "Lượng mưa Realtime (mm/phút)";
    } else if (chartType === "realtime-drainage") {             // Nếu là biểu đồ thoát nước thì loại biểu đồ là đường và name là khả năng thoát nước.
        chartStyle = "line";
        labelName = "Khả năng thoát nước (mm/phút)";            
    } else if (chartType === "realtime-tide") {                 // Nếu là biểu đồ thuỷ triều thì loại biểu đồ là đường và name là thuỷ triều real time.
        chartStyle = "line";
        labelName = "Thủy triều Realtime (m)";
    }

    floodChart = new Chart(ctx, {                               // Khúc trên là quy định nhãn, tên, loại biểu đồ, khúc dưới này là bước vẽ biểu đồ.
        type: chartStyle,                                       // loại biểu đồ là ở trên.                                     
        data: { 
            labels: [], // Khởi tạo rỗng
            datasets: [{
                label: labelName,                               // tên biểu đồ là label name quy định ở trên.
                data: [], // Khởi tạo rỗng
                backgroundColor: "rgba(255, 99, 132, 0.5)",   // tạo màu cho nền, cho viền.
                borderColor: "rgba(255, 99, 132, 1)",
                borderWidth: 2,
                tension: 0.3 // Làm cong đường line cho mượt
            }]
        },
        options: { 
            responsive: true,
            animation: false // Tắt animation mặc định để lúc push điểm mới không bị giật
        }
    });
}


function updateRealtimeChart(latestData) {                      // HÀM 5: BƠM DỮ LIỆU VÀO BIỂU ĐỒ REALTIME (GỌI MỖI GIÂY)
   
    if (!floodChart || currentChartType.includes("history")) return;                          // Nếu chưa có biểu đồ, hoặc đang xem lịch sử thì không làm gì cả
    const station = latestData.stations.find(s => s.station_id === currentChartStationId);   // Tìm đúng thông số của trạm đang chọn latest data là 1 objects chứa 9 trạm nên phải duyệt qua từng trạm để chọn ra trạm đang được chọn, nếu không tìm thấy thì return.
    // Nếu là cấu trúc file Json kiểu nhét time vào từng thông tin của trạm thì có thể dùng code:
    // const time = station.datetime_str rồi sau đó push vào label bằng cách thay đổi floodChart.data.labels.push(latestData.datetime_str);  thành floodChart.data.labels.push(time);  
    if (!station) return;
    
    let newValue = 0;                                                                       // Mặc định giá trị mới ban đầu =0
    if (currentChartType === "realtime-rain") {                                             // Nếu là biểu đồ lượng mưa thì newvalue là giá trị tương ứng trong object.
        newValue = station.rainfall_R;                                                              
    } else if (currentChartType === "realtime-drainage") {                                  // Nếu biểu đồ thoát nước thì newvalue là giá trị tương ứng trong object.
        newValue = station.drainage_D;
    } else if (currentChartType === "realtime-tide") {                                      // Nếu biểu đồ thuỷ triều thì newvalue là giá trị tương ứng trong object.
        newValue = station.tide_H;
    }

    floodChart.data.labels.push(latestData.datetime_str);                                   // Đưa vào labels rỗng (trục x) đã khai báo ở trên bằng biến thời gian trong objects. LƯU Ý KHÚC NÀY CẦN XÁC NHẬN LẠI FILE JSON.
    floodChart.data.datasets[0].data.push(newValue);                                        // Đưa vào data rổng trong dataset (giá trị của trục y) bằng newvalue ở trên

    
    if (floodChart.data.labels.length > 60) {                                               // // Xét nếu dài quá 60 điểm (60 phút mô phỏng), xóa điểm cũ nhất ở đầu
        floodChart.data.labels.shift();
        floodChart.data.datasets[0].data.shift();
    }
    
    floodChart.update(); //                                                                 Ra lệnh cập nhật nét vẽ lên màn hình
}

