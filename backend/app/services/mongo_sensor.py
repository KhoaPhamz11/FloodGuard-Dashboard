"""
Helpers đọc schema Mongo thực tế:

  sensor_data document = {
    timestamp, processed_at,
    stations_data: [ { station_name, H, R, H_tide, V, code, ... }, ... ]
  }

Không có field top-level `water_level`.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd


def parse_mongo_timestamp(value: Any) -> datetime:
    """Chuẩn hóa timestamp Mongo (string hoặc datetime) → naive datetime."""
    ts = pd.to_datetime(value, errors="raise")
    if getattr(ts, "tzinfo", None) is not None:
        ts = ts.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
    return ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts


def extract_station_h(doc: dict, station_index: int = 0) -> float:
    """Lấy mực nước H từ stations_data[index]."""
    stations = doc.get("stations_data") or []
    if not stations:
        raise ValueError("Mongo document thiếu stations_data")
    idx = station_index if station_index < len(stations) else 0
    row = stations[idx]
    if "H" not in row or row["H"] is None:
        raise KeyError(f"stations_data[{idx}] thiếu field H; keys={list(row.keys())}")
    return float(row["H"])


def extract_station_fields(doc: dict, station_index: int = 0) -> dict:
    """Lấy H, R, H_tide từ một trạm trong snapshot."""
    stations = doc.get("stations_data") or []
    if not stations:
        raise ValueError("Mongo document thiếu stations_data")
    idx = station_index if station_index < len(stations) else 0
    row = stations[idx]
    return {
        "H": float(row.get("H") or 0.0),
        "R": float(row.get("R") or 0.0),
        "H_tide": float(row.get("H_tide") or 1.2),
        "station_name": row.get("station_name"),
        "code": int(row.get("code") or 0),
    }


def water_series_from_docs(
    docs: list[dict],
    station_index: int,
) -> pd.DataFrame:
    """
    Chuyển list snapshot Mongo → DataFrame hourly-compatible:
      timestamp | water_level
    """
    rows = []
    for doc in docs:
        try:
            ts = parse_mongo_timestamp(doc["timestamp"])
            h = extract_station_h(doc, station_index)
            rows.append({"timestamp": ts, "water_level": h})
        except (KeyError, ValueError, TypeError):
            continue
    if not rows:
        raise ValueError("Không tìm thấy bản ghi mực nước nào trong khung thời gian Lookback.")
    df = pd.DataFrame(rows).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    return df.reset_index(drop=True)