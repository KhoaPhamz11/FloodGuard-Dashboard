from __future__ import annotations

from functools import lru_cache
from typing import Any

import pandas as pd

from backend.app.server_config import get_mongo_database


@lru_cache(maxsize=32)
def load_model_csv(filename: str) -> pd.DataFrame:
    """Load a CSV dataset previously uploaded to MongoDB by publisher.py."""
    collection = get_mongo_database()["model_csv"]
    rows = list(collection.find({"dataset": filename}, {"_id": 0, "dataset": 0}))
    if not rows:
        raise FileNotFoundError(
            f"MongoDB model dataset is missing: {filename}. "
            "Run publisher.py --mode csv first."
        )
    frame = pd.DataFrame(rows)
    for column in frame.columns:
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric.notna().any():
            frame[column] = numeric.where(numeric.notna(), frame[column])
    return frame
