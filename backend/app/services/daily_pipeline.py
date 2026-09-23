from __future__ import annotations

import os
import json
import importlib.util
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import pandas as pd
from pymongo import MongoClient

from backend.app.services.feature_builder import build_daily_features
from backend.app.services.model_data_store import load_model_csv
from backend.app.services.station_registry import (
    DAILY_STATIONS,
    scenario_index_from_backend_name,
)


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
MODEL_DIR = ROOT_DIR / "backend" / "model_daily"
FALLBACK_MODEL_DIR = ROOT_DIR / "artifacts" / "water_flood_t1"
SCENARIO_JSON_PATH = ROOT_DIR / "scenarios_2_kich_ban.json"
CSV_SOURCE = "csv"
MONGO_SOURCE = "mongo"


@lru_cache(maxsize=1)
def _load_predictor_module():
    """Nạp module dự báo saved model cho daily pipeline."""
    model_dir = MODEL_DIR if (MODEL_DIR / "predict_saved.py").exists() else FALLBACK_MODEL_DIR
    predictor_path = model_dir / "predict_saved.py"
    if not predictor_path.exists():
        raise FileNotFoundError(f"Daily model artifact is missing: {predictor_path}")
    spec = importlib.util.spec_from_file_location("floodguard_daily_predictor", predictor_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load daily predictor: {predictor_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=1)
def _load_daily_frame_csv() -> pd.DataFrame:
    """Tải dữ liệu Daily fallback hoàn toàn từ các file CSV tĩnh."""
    observations = load_model_csv("feature_matrix_external_clean.csv")
    observations["ngay"] = pd.to_datetime(observations["ngay"], errors="raise")
    return build_daily_features(
        observations=observations,
        rain=load_model_csv("rain_daily_station_obs.csv"),
        tide=load_model_csv("tide_daily.csv"),
        station=load_model_csv("stations_master_features.csv"),
        weather=load_model_csv("historical_weather_features_openmeteo_bangkok.csv"),
    ).assign(
        ngay=observations.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["ngay"],
        tenTram=observations.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["tenTram"],
        doCaoDinhT=observations.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["doCaoDinhT"],
    )


def _get_mongo_client():
    """Tạo MongoClient kết nối tới MongoDB."""
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        return None
    try:
        return MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    except Exception:
        return None


def load_scenario_by_name(scenario_name: str) -> dict:
    """Đọc file JSON kịch bản."""
    if not SCENARIO_JSON_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy file kịch bản: {SCENARIO_JSON_PATH}")

    with open(SCENARIO_JSON_PATH, "r", encoding="utf-8") as f:
        scenarios = json.load(f)

    for sc in scenarios:
        if sc.get("scenario_name") == scenario_name:
            return sc

    return scenarios[0]


def fetch_hybrid_scenario_daily_features(
    station_name: str,
    scenario_name: str = "mua_nhieu_ngap",
    station_index: int | None = None,
    at: str | None = None,
    days_back: int = 14,
) -> pd.DataFrame:
    """
    Hybrid Model (đồng bộ hourly):
    - Mực nước HIỆN TẠI: MongoDB live
    - Lịch sử lags / mưa / triều: Scenario JSON
    """
    client = _get_mongo_client()
    if not client:
        raise RuntimeError("Không thể kết nối MongoDB (Kiểm tra MONGO_URI).")

    db = client["flood_monitoring"]
    coll = db["sensor_data"]

    if at:
        target_dt = pd.to_datetime(at)
        latest_doc = coll.find_one({"timestamp": {"$lte": target_dt}}, sort=[("timestamp", -1)])
    else:
        latest_doc = coll.find_one({}, sort=[("timestamp", -1)])

    if not latest_doc:
        client.close()
        raise ValueError("MongoDB không có bản ghi phù hợp.")

    live_water_level = float(latest_doc["water_level"])
    target_dt = pd.to_datetime(latest_doc["timestamp"]).normalize()
    client.close()

    scenario = load_scenario_by_name(scenario_name)
    stations_data = scenario.get("stations_data", [])

    if station_index is None:
        station_index = scenario_index_from_backend_name(station_name)
    if station_index >= len(stations_data):
        station_index = 0

    sc_station = stations_data[station_index]
    h_scenario = float(sc_station.get("H", 0.0))
    r_scenario = float(sc_station.get("R", 0.0))
    tide_scenario = float(sc_station.get("H_tide", 1.2))

    dates = [target_dt - timedelta(days=i) for i in range(days_back - 1, -1, -1)]
    water_series = [h_scenario] * (days_back - 1) + [live_water_level]

    obs_df = pd.DataFrame({
        "ngay": dates,
        "tenTram": station_name,
        "doCaoDinhT": water_series,
    })

    rain_df = pd.DataFrame({
        "tenTram": station_name,
        "ngay": dates,
        "rain": [r_scenario] * days_back,
        "rain_max_intensity": [r_scenario / 2.0] * days_back,
        "rain_hours": [2.0] * days_back,
        "rain_lag1": [r_scenario] * days_back,
        "rain_lag2": [r_scenario] * days_back,
        "rain_lag3": [r_scenario] * days_back,
        "rain_lag7": [r_scenario] * days_back,
        "rain_roll3": [r_scenario * 3] * days_back,
        "rain_roll7": [r_scenario * 7] * days_back,
        "rain_mean3": [r_scenario] * days_back,
        "rain_mean7": [r_scenario] * days_back,
    })

    weather_df = pd.DataFrame({
        "ngay": dates,
        "st_Cu_Chi_precipitation": [r_scenario] * days_back,
        "st_Cu_Chi_wind_gusts_10m": [15.0] * days_back,
        "st_Cu_Chi_pressure_msl": [1010.0] * days_back,
        "dam_Tri_An_precipitation": [r_scenario] * days_back,
        "dam_Dau_Tieng_precipitation": [r_scenario] * days_back,
    })

    tide_df = pd.DataFrame({
        "date": dates,
        "tide_max": [tide_scenario] * days_back,
        "tide_min": [max(0.0, tide_scenario - 1.5)] * days_back,
        "tide_mean": [tide_scenario - 0.75] * days_back,
        "tide_range": [1.5] * days_back,
    })

    station_df = load_model_csv("stations_master_features.csv")
    # Gò Vấp chưa có trong CSV master → clone metadata từ Thủ Đức
    if station_name == "Gò Vấp" and station_df["tenTram"].eq("Gò Vấp").sum() == 0:
        donor = station_df[station_df["tenTram"].eq("Thủ Đức")].copy()
        if not donor.empty:
            donor = donor.iloc[[0]].copy()
            donor["tenTram"] = "Gò Vấp"
            donor["lon"] = 106.6660
            donor["lat"] = 10.8250
            station_df = pd.concat([station_df, donor], ignore_index=True)

    features = build_daily_features(
        observations=obs_df,
        rain=rain_df,
        tide=tide_df,
        station=station_df,
        weather=weather_df,
    )

    features = features.assign(
        ngay=obs_df.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["ngay"],
        tenTram=obs_df.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["tenTram"],
        doCaoDinhT=obs_df.sort_values(["tenTram", "ngay"]).reset_index(drop=True)["doCaoDinhT"],
    )

    return features


def predict_daily_station(
    station_name: str,
    at: str | None = None,
    scenario_name: str = "mua_nhieu_ngap",
    source: str = MONGO_SOURCE,
) -> dict:
    """Dự báo đỉnh mực nước và mức cảnh báo (Horizon 24h)."""
    module = _load_predictor_module()

    if source == MONGO_SOURCE:
        try:
            frame = fetch_hybrid_scenario_daily_features(
                station_name=station_name,
                scenario_name=scenario_name,
                station_index=scenario_index_from_backend_name(station_name),
                at=at,
                days_back=14,
            )
            source_desc = f"MongoDB (Live y_t) + Scenario Lags ({scenario_name})"
        except Exception as err:
            print(f"⚠️ Lỗi fetch dữ liệu Hybrid ({err}), tự động Fallback về CSV File.")
            frame = _load_daily_frame_csv()
            source_desc = "CSV File Fallback"
    else:
        frame = _load_daily_frame_csv()
        source_desc = "CSV File"

    station_frame = frame[frame["tenTram"].eq(station_name)].copy()
    if station_frame.empty:
        raise ValueError(f"Không có dữ liệu cho trạm: {station_name}")

    if at is not None:
        timestamp = pd.Timestamp(at).normalize()
        station_frame = station_frame[station_frame["ngay"] <= timestamp]

    if station_frame.empty:
        raise ValueError(f"Không có dòng dữ liệu phù hợp trước mốc {at} cho trạm {station_name}")

    row = station_frame.sort_values("ngay").tail(1)
    result = module.predict_saved(row, h=1).iloc[0].to_dict()

    alarm_level = int(result.get("alarm_level", 0))
    risk_map = {0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL"}

    return {
        "station": station_name,
        "source": source_desc,
        "scenario_name": scenario_name,
        "model": "daily",
        "horizon_h": 24,
        "feature_date": row.iloc[0]["ngay"].isoformat(),
        "live_water_level_m": float(row.iloc[0]["doCaoDinhT"]),
        "predicted_water_level": float(result["pred_peak"]),
        "target_timestamp": (row.iloc[0]["ngay"] + pd.Timedelta(hours=24)).isoformat(),
        "alarm_level": alarm_level,
        "risk_level": risk_map.get(alarm_level, "SAFE"),
        "risk_code": alarm_level,
    }