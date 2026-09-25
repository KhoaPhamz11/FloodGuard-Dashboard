from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

from backend.app.server_config import get_mongo_database

# Thư mục data local (cùng cấp project root)
ROOT_DIR = Path(__file__).resolve().parents[3]  # chỉnh nếu cấu trúc khác
LOCAL_DATA_DIRS = [
    ROOT_DIR / "data",
    ROOT_DIR / "backend" / "data",
    Path("data"),
]


def _load_from_local(filename: str) -> pd.DataFrame | None:
    for folder in LOCAL_DATA_DIRS:
        path = folder / filename
        if path.is_file():
            return pd.read_csv(path)
    return None


@lru_cache(maxsize=32)
def load_model_csv(filename: str) -> pd.DataFrame:
    """Ưu tiên CSV local; nếu không có thì đọc Mongo (publisher)."""
    # 1) Local trước
    frame = _load_from_local(filename)
    if frame is not None:
        for column in frame.columns:
            numeric = pd.to_numeric(frame[column], errors="coerce")
            if numeric.notna().any():
                frame[column] = numeric.where(numeric.notna(), frame[column])
        return frame

    # 2) Mongo fallback
    try:
        collection = get_mongo_database()["model_csv"]
        rows = list(collection.find({"dataset": filename}, {"_id": 0, "dataset": 0}))
    except Exception:
        rows = []

    if not rows:
        raise FileNotFoundError(
            f"Dataset missing (local + Mongo): {filename}. "
            f"Đặt file vào data/ hoặc chạy publisher.py --mode csv."
        )

    frame = pd.DataFrame(rows)
    for column in frame.columns:
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric.notna().any():
            frame[column] = numeric.where(numeric.notna(), frame[column])
    return frame