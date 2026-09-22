# -----------------------------------------------------------
# 50 most‑recent MongoDB documents – quick sanity test & export
# -----------------------------------------------------------

import os
import argparse
import json
from pymongo import MongoClient
from datetime import datetime
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
        description="Fetch and export the N most recent MongoDB documents."
    )
    parser.add_argument(
        "--collection",
        default="sensor_data",
        help="Collection name inside the `flood_monitoring` DB (default: sensor_data)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="How many newest documents to retrieve (default: 50)"
    )
    parser.add_argument(
        "--output",
        default="latest_documents.txt",
        help="File path to save output TXT (default: latest_documents.txt)"
    )
    return parser.parse_args()

def main():
    args = parse_args()

    # -----------------------------------------------------------------
    # 1️⃣ Lấy chuỗi kết nối từ biến môi trường
    # -----------------------------------------------------------------
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError(
            "MONGO_URI environment variable is not set. "
            "Export it before running the script, e.g.:\n"
            "  $Env:MONGO_URI = \"mongodb+srv://<user>:<pwd>@<cluster>/flood_monitoring\""
        )

    # -----------------------------------------------------------------
    # 2️⃣ Kết nối và chọn collection
    # -----------------------------------------------------------------
    client = MongoClient(mongo_uri)
    db = client["flood_monitoring"]
    coll = db[args.collection]

    # -----------------------------------------------------------------
    # 3️⃣ Truy vấn N tài liệu mới nhất (sắp xếp giảm dần theo timestamp)
    # -----------------------------------------------------------------
    cursor = coll.find(
        {}, 
        projection={"_id": 0}  # Ẩn _id để output JSON chuẩn và sạch
    ).sort("timestamp", -1).limit(args.limit)

    documents = list(cursor)

    if not documents:
        print(f"⚠️ Không tìm thấy tài liệu nào trong collection `{args.collection}`.")
        client.close()
        return

    # -----------------------------------------------------------------
    # 4️⃣ Ghi toàn bộ dữ liệu đầy đủ ra file TXT
    # -----------------------------------------------------------------
    out_path = Path(args.output).resolve()
    
    with open(out_path, "w", encoding="utf-8") as f:
        # Ghi dạng mảng JSON đầy đủ định dạng (pretty-printed)
        json.dump(documents, f, ensure_ascii=False, indent=4, sort_keys=True)

    print(f"✅ Đã xuất thành công {len(documents)} document đầy đủ ra file:")
    print(f"📂 {out_path}")

    client.close()


if __name__ == "__main__":
    main()