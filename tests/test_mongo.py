# -----------------------------------------------------------
# MongoDB Get Top 10 Latest Documents Test
# Truy vấn 10 bản ghi mới nhất từ MongoDB collection
# -----------------------------------------------------------

import os
import argparse
import json
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# Nạp file .env từ thư mục backend hoặc root
BASE_DIR = Path(__file__).resolve().parent.parent
env_backend = BASE_DIR / "backend" / ".env"
env_root = BASE_DIR / ".env"

if env_backend.exists():
    load_dotenv(dotenv_path=env_backend)
else:
    load_dotenv(dotenv_path=env_root)

def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch top N latest documents from MongoDB based on timestamp."
    )
    parser.add_argument(
        "--collection",
        default="sensor_data",
        help="Collection name inside `flood_monitoring` DB (default: sensor_data)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Số lượng bản ghi mới nhất cần lấy (default: 10)"
    )
    parser.add_argument(
        "--output",
        default="top10_latest_documents.json",
        help="File path to save output JSON (default: top10_latest_documents.json)"
    )
    return parser.parse_args()

def main():
    args = parse_args()

    # 1️⃣ Lấy chuỗi kết nối từ biến môi trường
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("LỖI: Chưa cài đặt MONGO_URI trong file .env!")

    client = MongoClient(mongo_uri)
    db = client["flood_monitoring"]
    coll = db[args.collection]

    print(f"🔄 Đang truy vấn top {args.limit} bản ghi mới nhất từ collection `{args.collection}`...")

    # -----------------------------------------------------------------
    # BƯỚC 1: Query sắp xếp TIMESTAMP GIẢM DẦN (-1) & LIMIT
    # -----------------------------------------------------------------
    cursor = coll.find({}, projection={"_id": 0}).sort("timestamp", -1).limit(args.limit)
    documents = list(cursor)

    if not documents:
        print(f"⚠️ Collection `{args.collection}` đang rỗng hoặc không tìm thấy dữ liệu!")
        client.close()
        return

    print(f"✅ Đã lấy thành công {len(documents)} bản ghi.")
    print(f"🕒 Mốc thời gian mới nhất: {documents[0].get('timestamp')}")
    print(f"🕒 Mốc thời gian cũ nhất trong top 10: {documents[-1].get('timestamp')}")

    # -----------------------------------------------------------------
    # BƯỚC 2: Xuất kết quả ra file JSON
    # -----------------------------------------------------------------
    out_path = Path(args.output).resolve()
    
    def json_converter(o):
        if isinstance(o, datetime):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o)} is not JSON serializable")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(documents, f, ensure_ascii=False, indent=4, default=json_converter)

    print(f"📂 Kết quả đã lưu tại: {out_path}")

    client.close()

if __name__ == "__main__":
    main()