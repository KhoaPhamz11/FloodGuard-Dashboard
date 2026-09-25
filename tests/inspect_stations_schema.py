#!/usr/bin/env python3
"""
Script kiểm tra chi tiết cấu trúc dữ liệu trạm từ Backend (/api/latest).
Chạy: python tests/inspect_stations_schema.py
"""

import os
import sys
import json

try:
    import requests
except ImportError:
    print("Cần cài đặt: pip install requests")
    sys.exit(1)

BASE_URL = os.getenv("API_BASE", "http://127.0.0.1:8000")


def inspect_stations():
    url = f"{BASE_URL.rstrip('/')}/api/latest"
    print(f"🔍 Đang gửi yêu cầu tới: {url}\n")
    
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            print(f"❌ Lỗi HTTP {r.status_code}: {r.text[:200]}")
            return

        data = r.json()
        stations = data.get("stations_data") or data.get("stations") or []
        print(f"📊 Tổng số trạm Backend trả về: {len(stations)}\n")
        
        if not stations:
            print("⚠️ Mảng trạm rỗng!")
            return

        print("=" * 85)
        print(f"{'STT':<4} | {'station_name':<18} | {'tenTram':<18} | {'code':<6} | {'Các key tồn tại'}")
        print("=" * 85)

        for idx, st in enumerate(stations, 1):
            if isinstance(st, dict):
                st_name = str(st.get("station_name", "N/A"))
                ten_tram = str(st.get("tenTram", "N/A"))
                code = str(st.get("code", "N/A"))
                keys = list(st.keys())
                print(f"{idx:<4} | {st_name:<18} | {ten_tram:<18} | {code:<6} | {keys}")

        print("=" * 85)
        print("\n📌 MẪU DỮ LIỆU CHI TIẾT CỦA TRẠM ĐẦU TIÊN:")
        print(json.dumps(stations[0], ensure_ascii=False, indent=2))

    except requests.RequestException as e:
        print(f"❌ Không thể kết nối tới Backend: {e}")


if __name__ == "__main__":
    inspect_stations()