# MODULE PAST API BACKEND - Kết nối trực tiếp vào MongoDB (floodguard_db), lấy dữ liệu ra và mở 2 đường dẫn (API) để Frontend gọi.  
# Thư viện cần dùng: fastapi uvicorn pymongo
#fastapi: thư viện lõi để tạo API nhanh chóng    uvicorn: thư viện để chạy server fastapi    pymongo: thư viện để kết nối và thao tác với MongoDB   

# File: Backend/server.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient

# Khởi tạo ứng dụng FastAPI
app = FastAPI(title="FloodGuard API")  #Tạo app


app.add_middleware(    # Cấu hình CORS cho app: Cho phép Frontend (JavaScript) gọi API mà không bị chặn lỗi bảo mật
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép mọi nguồn truy cập (thuận tiện khi code local)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kết nối vào MongoDB
MONGO_URI = "mongodb+srv://pineapple130306_db_user:siinario123@test.nuzu7tt.mongodb.net/?retryWrites=true&w=majority" # 1. Dán chuỗi kết nối lấy từ MongoDB Atlas vào đây
client = MongoClient(MONGO_URI)        # 2. Khởi tạo kết nối qua đường link Cloud
db = client["flood_monitoring"]           # Đổi tên nếu nhóm bạn đặt tên DB khác
collection = db["sensor_data"]     # Đổi tên nếu nhóm bạn đặt tên Collection khác


"""
    API 1: Lấy dữ liệu mới nhất của 1 phút hiện tại.
    Tương đương lệnh lấy 1 document có timestamp lớn nhất.
    """
@app.get("/api/latest")   # Mở một ô cửa sổ đón khách có biển hiệu là /api/latest. Khi Frontend gọi tới đây, hàm bên dưới sẽ tự động kích hoạt.  
def get_latest_data():    
    # Tìm 1 document, sắp xếp theo 'timestamp' giảm dần (-1)
    latest_record = collection.find_one({}, sort=[("timestamp", -1)])   #rong MongoDB, số -1 nghĩa là sắp xếp từ lớn đến bé (giảm dần).Ví dụ trong kho có dữ liệu của phút 1, 2, 3 ... đến phút 500. Sắp xếp giảm dần thì phút 500 sẽ nhảy lên đầu tiên.
    
    if latest_record:
        # MongoDB tự sinh ra trường '_id' (kiểu ObjectId). 
        # JavaScript không đọc được kiểu này nên ta phải ép nó về chuỗi (string)
        latest_record["_id"] = str(latest_record["_id"]) # Mỗi khi lưu một dòng vào MongoDB, nó tự sinh ra một mã định danh.Nếu để nguyên kiểu này gửi qua mạng, trình duyệt sẽ bị "nghẹn" và báo lỗi không đọc được JSON. Do đó, ta phải đổi nó thành dạng chữ thường (string) để gửi đi mượt mà.
        return latest_record  
    return {"error": "Không tìm thấy dữ liệu"}


    """
    API 2: Lấy dữ liệu lịch sử 6 tiếng (360 phút) để vẽ biểu đồ.
    """
@app.get("/api/history")
def get_history_data():
   
    # Lấy 360 document mới nhất, sắp xếp giảm dần
    records = list(collection.find({}, sort=[("timestamp", -1)]).limit(360))  # lấy 360 document mới nhất, sắp xếp giảm dần theo timestamp. 
      
    for r in records:   # Xử lý '_id' cho từng record trong danh sách
        r["_id"] = str(r["_id"])
    records.reverse()   # Vì lấy giảm dần (mới nhất đứng đầu 360,359,358..), ta cần đảo ngược list lại (reverse) để khi Frontend vẽ biểu đồ Chart.js, thời gian sẽ chạy từ trái (cũ) sang phải (mới)
    return records

# Serve Frontend Static Files
import os
from fastapi.staticfiles import StaticFiles

# Construct absolute paths to the frontend directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_PUBLIC = os.path.join(BASE_DIR, "../../frontend/public")
FRONTEND_SRC = os.path.join(BASE_DIR, "../../frontend/src")

# Mount /src so index.html can load css/js
app.mount("/src", StaticFiles(directory=FRONTEND_SRC), name="src")
# Mount / (root) to serve index.html
app.mount("/", StaticFiles(directory=FRONTEND_PUBLIC, html=True), name="public")
