from __future__ import annotations

import os
from pathlib import Path

from pymongo import MongoClient
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("LỖI: Chưa cài đặt MONGO_URI trong file .env!")

_client = MongoClient(MONGO_URI)


def get_mongo_database():
    return _client["flood_monitoring"]
