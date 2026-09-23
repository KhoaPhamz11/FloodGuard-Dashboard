from __future__ import annotations

import os
import json
import importlib.util
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

import pandas as pd
from pymongo import MongoClient

from backend.app.services.feature_builder import build_daily_features
from backend.app.services.model_data_store import load_model_csv
from backend.app.services.mongo_sensor import extract_station_h, parse_mongo_timestamp
from backend.app.services.station_registry import (
    DAILY_STATIONS,
    scenario_index_from_backend_name,
)


ROOT_DIR = Path(__file__).resolve().parents[3]
MODEL_DIR = ROOT_DIR / "backend" / "model_daily"
FALLBACK_MODEL_DIR = ROOT_DIR / "artifacts" / "water_flood_t1"
SCENARIO_JSON_PATH = ROOT_DIR / "data"/"scenarios_2_kich_ban.json"
CSV_SOURCE = "csv"
MONGO_SOURCE = "mongo"

# Index trong Mongo stations_data (schema 10 tram hien tai)
MONGO_STATION_INDEX = {
    "Nhà Bè": 0,       # station_1
    "Phú An": 2,       # station_3
    "Hóc Môn": 7,      # station_8
    "Lê Minh Xuân": 3, # station_4
    "Thủ Đức": 1,      # station_2
    "Gò Vấp": 9,       # station_10
    "Củ Chi": 8,       # station_9
}


@lru_cache(maxsize=1)
def _load_predictor_module():
    model_dir = MODEL_DIR if (MODEL_DIR / "predict_saved.py").exists() else FALLBACK_MODEL_DIR
    predictor_path = model_dir / "predict_saved.py"
    if not predictor_path.exists():
        raise FileNotFoundError(f"Daily model missing: {predictor_path}")
    spec = importlib.util.spec_from_file_location("floodguard_daily_predictor", predictor_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load: {predictor_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=1)
def _load_daily_frame_csv() -> pd.DataFrame:
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
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        return None
    try:
        return MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    except Exception:
        return None


def load_scenario_by_name(scenario_name: str) -> dict:
    if not SCENARIO_JSON_PATH.exists():
        raise FileNotFoundError(f"Khong tim thay: {SCENARIO_JSON_PATH}")
    with open(SCENARIO_JSON_PATH, "r", encoding="utf-8") as f:
        scenarios = json.load(f)
    for sc in scenarios:
        if sc.get("scenario_name") == scenario_name:
            return sc
    return scenarios[0]


def _mongo_index_for_station(station_name: str) -> int:
    if station_name in MONGO_STATION_INDEX:
        return MONGO_STATION_INDEX[station_name]
    return scenario_index_from_backend_name(station_name)


def fetch_hybrid_scenario_daily_features(
    station_name: str,
    scenario_name: str = "mua_nhieu_ngap",
    station_index: int | None = None,
    at: str | None = None,
    days_back: int = 14,
) -> pd.DataFrame:
    """Live H tu Mongo stations_data[i].H; lich su tu Scenario."""
    client = _get_mongo_client()
    if not client:
        raise RuntimeError("Khong the ket noi MongoDB (MONGO_URI).")

    coll = client["flood_monitoring"]["sensor_data"]
    latest_doc = coll.find_one({}, sort=[("timestamp", -1)])
    if not latest_doc:
        client.close()
        raise ValueError("MongoDB khong co ban ghi.")

    if station_index is None:
        station_index = _mongo_index_for_station(station_name)

    live_water_level = extract_station_h(latest_doc, station_index)
    target_dt = parse_mongo_timestamp(latest_doc["timestamp"]).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    if at is not None:
        at_dt = parse_mongo_timestamp(at).replace(hour=0, minute=0, second=0, microsecond=0)
        target_dt = min(target_dt, at_dt)
    client.close()

    scenario = load_scenario_by_name(scenario_name)
    stations_data = scenario.get("stations_data", [])
    sc_idx = station_index if station_index < len(stations_data) else 0
    sc = stations_data[sc_idx] if stations_data else {}
    h_scenario = float(sc.get("H", 0.0))
    r_scenario = float(sc.get("R", 0.0))
    tide_scenario = float(sc.get("H_tide", 1.2))

    dates = [target_dt - timedelta(days=i) for i in range(days_back - 1, -1, -1)]
    water_series = [h_scenario] * (days_back - 1) + [live_water_level]

    obs_df = pd.DataFrame({"ngay": dates, "tenTram": station_name, "doCaoDinhT": water_series})
    rain_df = pd.DataFrame({
        "tenTram": station_name, "ngay": dates,
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
    if station_name == "Gò Vấp" and station_df["tenTram"].eq("Gò Vấp").sum() == 0:
        donor = station_df[station_df["tenTram"].eq("Thủ Đức")].copy()
        if not donor.empty:
            donor = donor.iloc[[0]].copy()
            donor["tenTram"] = "Gò Vấp"
            donor["lon"] = 106.6660
            donor["lat"] = 10.8250
            station_df = pd.concat([station_df, donor], ignore_index=True)

    features = build_daily_features(
        observations=obs_df, rain=rain_df, tide=tide_df,
        station=station_df, weather=weather_df,
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
    module = _load_predictor_module()

    if source == MONGO_SOURCE:
        try:
            frame = fetch_hybrid_scenario_daily_features(
                station_name=station_name,
                scenario_name=scenario_name,
                station_index=_mongo_index_for_station(station_name),
                at=at,
                days_back=14,
            )
            source_desc = f"Mongo stations_data[].H + Scenario ({scenario_name})"
        except Exception as err:
            print(f"Hybrid fail ({err}), CSV fallback.")
            frame = _load_daily_frame_csv()
            source_desc = "CSV File Fallback"
    else:
        frame = _load_daily_frame_csv()
        source_desc = "CSV File"

    station_frame = frame[frame["tenTram"].eq(station_name)].copy()
    if station_frame.empty:
        raise ValueError(f"Khong co du lieu tram: {station_name}")

    if at is not None:
        timestamp = pd.Timestamp(at).normalize()
        station_frame = station_frame[station_frame["ngay"] <= timestamp]
    if station_frame.empty:
        raise ValueError(f"Khong co dong truoc {at} cho {station_name}")

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