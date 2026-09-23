from pymongo import MongoClient
import os
from dotenv import load_dotenv
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
env_backend = BASE_DIR / "backend" / ".env"
env_root = BASE_DIR / ".env"

if env_backend.exists():
    load_dotenv(dotenv_path=env_backend)
else:
    load_dotenv(dotenv_path=env_root)

client = MongoClient(os.environ["MONGO_URI"])
doc = client["flood_monitoring"]["sensor_data"].find_one(sort=[("timestamp", -1)])
print(doc.keys())
print(doc)