# MODULE PAST API BACKEND - Kết nối trực tiếp vào MongoDB (floodguard_db), lấy dữ liệu ra và mở 2 đường dẫn (API) để Frontend gọi.  
# Thư viện cần dùng: fastapi uvicorn pymongo
#fastapi: thư viện lõi để tạo API nhanh chóng    uvicorn: thư viện để chạy server fastapi    pymongo: thư viện để kết nối và thao tác với MongoDB   

# File: Backend/server.py
import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv
from pydantic import BaseModel

# Xác định đường dẫn file .env một cách tuyệt đối (nằm ở thư mục backend/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_path, override=True)

# Khởi tạo ứng dụng FastAPI
app = FastAPI(title="FloodGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kết nối vào MongoDB bằng biến môi trường (Bảo mật)
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("LỖI: Chưa cài đặt MONGO_URI trong file .env!")

client = MongoClient(MONGO_URI)
db = client["flood_monitoring"]
collection = db["sensor_data"]

# OpenRouteService Configuration
ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_BASE_URL = "https://api.openrouteservice.org"

# Schemas cho Navigation API
class RouteRequest(BaseModel):
    start: list[float]  # [lng, lat]
    end: list[float]    # [lng, lat]

@app.get("/api/debug")
def debug_env():
    return {
        "env_path": env_path,
        "env_exists": os.path.exists(env_path),
        "key": os.getenv("ORS_API_KEY")
    }

@app.get("/api/navigation/geocode")
def geocode_search(text: str):
    """
    API tìm kiếm địa điểm (Geocoding) thông qua OpenRouteService.
    Ẩn API Key khỏi frontend.
    """
    current_key = os.getenv("ORS_API_KEY")
    if not current_key or current_key == "your_openrouteservice_api_key_here":
        raise HTTPException(status_code=500, detail="Chưa cấu hình ORS_API_KEY trong backend .env")
    
    url = f"{ORS_BASE_URL}/geocode/search"
    params = {
        "api_key": current_key,
        "text": text,
        "boundary.country": "VN",
        "focus.point.lon": 106.6870,
        "focus.point.lat": 10.7930,
        "size": 5
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi gọi ORS Geocoding: {str(e)}")

@app.post("/api/navigation/route")
def get_driving_route(request: RouteRequest):
    """
    API tìm đường đi ngắn nhất (Routing) thông qua OpenRouteService.
    """
    current_key = os.getenv("ORS_API_KEY")
    if not current_key or current_key == "your_openrouteservice_api_key_here":
        raise HTTPException(status_code=500, detail="Chưa cấu hình ORS_API_KEY trong backend .env")
        
    url = f"{ORS_BASE_URL}/v2/directions/driving-car/geojson"
    headers = {
        "Authorization": current_key,
        "Content-Type": "application/json"
    }
    
    body = {
        "coordinates": [request.start, request.end]
    }
    
    try:
        response = requests.post(url, json=body, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi gọi ORS Routing: {str(e)}")



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
