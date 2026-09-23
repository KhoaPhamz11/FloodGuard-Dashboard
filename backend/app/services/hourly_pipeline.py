from __future__ import annotations

import os
from datetime import datetime, timedelta
from functools import lru_cache
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import pandas as pd
import requests
from pymongo import MongoClient

from backend.app.services.feature_builder import build_cuchi_hourly_features
from backend.app.services.model_data_store import load_model_csv
from backend.app.services.openmeteo_service import fetch_openmeteo_weather
from backend.app.services.station_registry import (
    CUCHI_COORDS,
    CUCHI_SCENARIO_STATION_INDEX,
    DAILY_STATIONS,
    FORECAST_STATION_IDS,
)
from backend.models_hourly.cuchi_inference import CuchiHourlyPredictor
from backend.app.services.daily_pipeline import predict_daily_station, load_scenario_by_name


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
MODEL_DIR = ROOT_DIR / "backend" / "models_hourly"
CSV_SOURCE = "csv"
MONGO_SOURCE = "mongo"
HOURLY_RADIUS_KM = 5.0
FLOOD_THRESHOLDS = ((1.60, "CRITICAL", 3), (1.50, "WARNING", 2), (1.40, "ADVISORY", 1))

UHSLC_VUNGTAU_URL = "https://uhslc.soest.hawaii.edu/data/csv/fast/hourly/h078.csv"


def _fetch_uhslc_live_tide(start_dt: datetime, end_dt: datetime) -> pd.DataFrame:
    res = requests.get(UHSLC_VUNGTAU_URL, timeout=10)
    res.raise_for_status()

    df = pd.read_csv(UHSLC_VUNGTAU_URL, header=None, names=["year", "month", "day", "hour", "tide_mm"])
    df = df[df["tide_mm"] > -5000].copy()
    df["timestamp"] = pd.to_datetime(df[["year", "month", "day", "hour"]])
    df["tide_vungtau_m"] = df["tide_mm"] / 1000.0

    df = df[(df["timestamp"] >= start_dt) & (df["timestamp"] <= end_dt)]
    if df.empty:
        raise ValueError("Dữ liệu UHSLC không chứa khoảng thời gian yêu cầu.")

    return df[["timestamp", "tide_vungtau_m"]].reset_index(drop=True)


def _get_mongo_client():
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        return None
    try:
        return MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    except Exception:
        return None


def fetch_hybrid_scenario_hourly_features(
    scenario_name: str = "mua_nhieu_ngap",
    station_index: int = CUCHI_SCENARIO_STATION_INDEX,
    at: str | None = None,
    hours_back: int = 48,
) -> pd.DataFrame:
    """
    Hybrid Hourly (đồng bộ Daily):
    - Live y_t từ MongoDB
    - Lịch sử water / weather / tide từ Scenario JSON
    """
    client = _get_mongo_client()
    if not client:
        raise RuntimeError("Không thể kết nối MongoDB (Kiểm tra biến MONGO_URI).")

    db = client["flood_monitoring"]
    coll = db["sensor_data"]

    if at:
        target_dt = pd.to_datetime(at).to_pydatetime()
        latest_doc = coll.find_one({"timestamp": {"$lte": target_dt}}, sort=[("timestamp", -1)])
    else:
        latest_doc = coll.find_one({}, sort=[("timestamp", -1)])

    if not latest_doc:
        client.close()
        raise ValueError("MongoDB không có bản ghi phù hợp.")

    live_water_level = float(latest_doc["water_level"])
    target_dt = pd.to_datetime(latest_doc["timestamp"]).to_pydatetime().replace(
        minute=0, second=0, microsecond=0
    )
    client.close()

    scenario = load_scenario_by_name(scenario_name)
    stations_data = scenario.get("stations_data", [])
    if station_index >= len(stations_data):
        station_index = 0

    sc_station = stations_data[station_index]
    h_scenario = float(sc_station.get("H", 0.0))
    r_scenario = float(sc_station.get("R", 0.0))
    tide_scenario = float(sc_station.get("H_tide", 1.2))

    timestamps = [target_dt - timedelta(hours=i) for i in range(hours_back - 1, -1, -1)]
    water_series = [h_scenario] * (hours_back - 1) + [live_water_level]

    water_df = pd.DataFrame({"timestamp": timestamps, "water_level": water_series})
    weather_df = pd.DataFrame({
        "timestamp": timestamps,
        "Tram_Cu_Chi_precipitation": [r_scenario] * hours_back,
        "Tram_Cu_Chi_wind_speed_10m": [10.0] * hours_back,
        "Tram_Cu_Chi_wind_gusts_10m": [15.0] * hours_back,
        "Tram_Cu_Chi_pressure_msl": [1010.0] * hours_back,
        "Dap_Tri_An_precipitation": [r_scenario] * hours_back,
        "Dap_Dau_Tieng_precipitation": [r_scenario] * hours_back,
    })
    tide_df = pd.DataFrame({
        "timestamp": timestamps,
        "tide_vungtau_m": [tide_scenario] * hours_back,
    })
    station_df = load_model_csv("stations_master_features.csv")

    return build_cuchi_hourly_features(
        water=water_df,
        weather=weather_df,
        tide=tide_df,
        station=station_df,
        start=timestamps[0],
        end=target_dt,
    )


def fetch_hybrid_cuchi_features(at: str | None = None, hours_back: int = 48) -> pd.DataFrame:
    """Hybrid realtime: Mongo + Open-Meteo + UHSLC (fallback)."""
    client = _get_mongo_client()
    if not client:
        raise RuntimeError("Không thể kết nối MongoDB (Kiểm tra biến MONGO_URI).")

    db = client["flood_monitoring"]
    coll = db["sensor_data"]

    if at:
        target_dt = pd.to_datetime(at).to_pydatetime()
        latest_doc = coll.find_one({"timestamp": {"$lte": target_dt}}, sort=[("timestamp", -1)])
    else:
        latest_doc = coll.find_one({}, sort=[("timestamp", -1)])

    if not latest_doc:
        client.close()
        raise ValueError("MongoDB không có dữ liệu phù hợp trong khoảng thời gian này.")

    target_dt = pd.to_datetime(latest_doc["timestamp"]).to_pydatetime()
    start_dt = target_dt - timedelta(hours=hours_back)

    cursor = coll.find(
        {"timestamp": {"$gte": start_dt, "$lte": target_dt}},
        projection={"_id": 0},
    ).sort("timestamp", 1)
    docs = list(cursor)
    client.close()

    if not docs:
        raise ValueError("Không tìm thấy bản ghi mực nước nào trong khung thời gian Lookback.")

    water_df = pd.DataFrame(docs)

    try:
        weather_df = fetch_openmeteo_weather(start_dt - timedelta(hours=12), target_dt)
    except Exception as err:
        print(f"⚠️ Không thể kết nối Open-Meteo API ({err}), dùng CSV thời tiết dự phòng.")
        weather_df = load_model_csv("cuchi-historical_weather_features.csv")

    try:
        tide_df = _fetch_uhslc_live_tide(start_dt - timedelta(hours=12), target_dt)
    except Exception as err:
        print(f"⚠️ Không thể kết nối UHSLC API ({err}), dùng CSV thủy triều dự phòng.")
        tide_df = load_model_csv("tide_hourly.csv")

    station_df = load_model_csv("stations_master_features.csv")
    return build_cuchi_hourly_features(
        water=water_df,
        weather=weather_df,
        tide=tide_df,
        station=station_df,
        start=start_dt,
        end=target_dt,
    )


@lru_cache(maxsize=1)
def _load_hourly_features() -> pd.DataFrame:
    features = build_cuchi_hourly_features(
        water=load_model_csv("Cu-Chi-post.csv"),
        weather=load_model_csv("cuchi-historical_weather_features.csv"),
        tide=load_model_csv("tide_hourly.csv"),
        station=load_model_csv("stations_master_features.csv"),
    )
    expected = _load_predictor().features
    if list(features.columns) != expected:
        raise ValueError("Hourly feature columns do not match the production model schema")
    return features


@lru_cache(maxsize=1)
def _load_predictor() -> CuchiHourlyPredictor:
    return CuchiHourlyPredictor(MODEL_DIR)


def _select_replay_row(
    features: pd.DataFrame, predictor: CuchiHourlyPredictor, at: str | None
) -> tuple[pd.Series, pd.Timestamp]:
    complete = features.dropna(subset=predictor.features)
    if complete.empty:
        raise ValueError("No hourly timestamp has a complete production feature row")
    if at is None:
        timestamp = complete.index[-1]
    else:
        timestamp = pd.Timestamp(at).floor("h")
        if timestamp < complete.index[0] or timestamp > complete.index[-1]:
            raise ValueError(
                f"Requested time {timestamp.isoformat()} is outside the range "
                f"{complete.index[0].isoformat()} to {complete.index[-1].isoformat()}"
            )
        available = complete.index[complete.index <= timestamp]
        if len(available) == 0:
            raise ValueError(f"No complete feature row exists at or before {timestamp}")
        timestamp = available[-1]
    return complete.loc[timestamp], timestamp


def _water_level_rate(features: pd.DataFrame, timestamp: pd.Timestamp) -> tuple[float, float]:
    position = features.index.get_loc(timestamp)
    if isinstance(position, slice) or position == 0:
        raise ValueError("Cannot calculate water-level rate without a previous timestamp")
    previous = features.iloc[position - 1]
    current = features.iloc[position]
    delta_seconds = (timestamp - features.index[position - 1]).total_seconds()
    if delta_seconds <= 0 or pd.isna(previous["y_t"]) or pd.isna(current["y_t"]):
        raise ValueError("Cannot calculate water-level rate from invalid adjacent water levels")
    return (
        (float(current["y_t"]) - float(previous["y_t"])) / delta_seconds,
        delta_seconds,
    )


def _risk_from_level(level: float) -> tuple[str, int]:
    for threshold, risk, code in FLOOD_THRESHOLDS:
        if level >= threshold:
            return risk, code
    return "SAFE", 0


def predict_cuchi(
    horizons: list[int] | None = None,
    at: str | None = None,
    source: str = MONGO_SOURCE,
    scenario_name: str = "mua_nhieu_ngap",
) -> dict:
    if source not in {CSV_SOURCE, MONGO_SOURCE}:
        raise ValueError(f"Unsupported source: {source}; available={CSV_SOURCE}, {MONGO_SOURCE}")

    predictor = _load_predictor()
    selected_horizons = predictor.horizons if horizons is None else horizons
    unsupported = [h for h in selected_horizons if h not in predictor.horizons]
    if unsupported:
        raise ValueError(f"Unsupported horizons: {unsupported}; available={predictor.horizons}")

    if source == MONGO_SOURCE:
        try:
            features = fetch_hybrid_scenario_hourly_features(
                scenario_name=scenario_name,
                station_index=CUCHI_SCENARIO_STATION_INDEX,
                at=at,
                hours_back=48,
            )
            source_desc = f"MongoDB (Live y_t) + Scenario Lags ({scenario_name})"
        except Exception as e:
            print(f"⚠️ Lỗi fetch Scenario Hybrid ({e}), thử Hybrid realtime...")
            try:
                features = fetch_hybrid_cuchi_features(at=at, hours_back=48)
                source_desc = "MongoDB + Open-Meteo + UHSLC API (Hybrid realtime)"
            except Exception as e2:
                print(f"⚠️ Lỗi Hybrid realtime ({e2}), Fallback CSV.")
                features = _load_hourly_features()
                source_desc = "CSV File Fallback"
    else:
        features = _load_hourly_features()
        source_desc = "CSV File"

    selected, timestamp = _select_replay_row(features, predictor, at)
    current_level = float(selected["y_t"])
    rate, delta_seconds = _water_level_rate(features, timestamp)
    forecasts = [
        predictor.predict_from_features(selected.to_dict(), current_level, horizon)
        for horizon in selected_horizons
    ]
    max_level = max(item["predicted_water_level"] for item in forecasts)
    risk_level, risk_code = _risk_from_level(max_level)

    return {
        "station": "Củ Chi",
        "source": source_desc,
        "scenario_name": scenario_name if source == MONGO_SOURCE else None,
        "data_file": "MongoDB + Scenario JSON / OpenMeteo+UHSLC fallback",
        "replay": False,
        "feature_timestamp": timestamp.isoformat(),
        "current_water_level": current_level,
        "water_level_rate_m_per_s": rate,
        "water_level_rate_m_per_hour": rate * 3600,
        "delta_t_seconds": delta_seconds,
        "forecast_ready": True,
        "risk_level": risk_level,
        "risk_code": risk_code,
        "forecasts": forecasts,
    }


def predict_latest_cuchi(horizons: list[int] | None = None) -> dict:
    return predict_cuchi(horizons=horizons, source=MONGO_SOURCE)


def _distance_km(latitude: float, longitude: float, target: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(radians, [latitude, longitude, target[0], target[1]])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(value))


def predict_for_location(
    latitude: float,
    longitude: float,
    horizons: list[int] | None = None,
    at: str | None = None,
    source: str = MONGO_SOURCE,
    scenario_name: str = "mua_nhieu_ngap",
) -> dict:
    selected_horizons = horizons or [1, 3, 6]
    is_daily_request = len(selected_horizons) == 1 and selected_horizons[0] == 24

    if not is_daily_request:
        hourly_horizons = [h for h in selected_horizons if h in [1, 3, 6]] or [1, 3, 6]
        result = predict_cuchi(
            horizons=hourly_horizons,
            at=at,
            source=source,
            scenario_name=scenario_name,
        )
        distance = _distance_km(latitude, longitude, CUCHI_COORDS)
        result.update({
            "model": "hourly",
            "distance_to_station_km": distance,
            "routing_reason": "Horizon 1h/3h/6h -> Hourly Model (Củ Chi)",
        })
        return result

    station_name, station_distance = min(
        ((name, _distance_km(latitude, longitude, coords)) for name, coords in DAILY_STATIONS.items()),
        key=lambda item: item[1],
    )
    try:
        daily_result = predict_daily_station(
            station_name, at=at, scenario_name=scenario_name, source=source
        )
        return {
            "station": station_name,
            "model": "daily",
            "model_status": "ready",
            "routing_reason": "Horizon 24h -> Daily Model",
            "distance_to_station_km": station_distance,
            "requested_horizons": [24],
            "forecast": daily_result,
            "forecast_ready": True,
            "risk_level": {0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL"}.get(
                int(daily_result["alarm_level"]), "SAFE"
            ),
            "risk_code": int(daily_result["alarm_level"]),
        }
    except (FileNotFoundError, ImportError, ValueError) as error:
        return {
            "station": station_name,
            "model": "daily",
            "model_status": "unavailable",
            "reason": str(error),
            "distance_to_station_km": station_distance,
            "requested_horizons": [24],
            "forecast": None,
            "forecast_ready": False,
            "risk_level": "SAFE",
            "risk_code": 0,
        }


def predict_all_stations(
    at: str | None, horizon: int, scenario_name: str = "mua_nhieu_ngap"
) -> dict:
    requested_time = pd.Timestamp.now().floor("h") if at is None else pd.Timestamp(at).floor("h")
    target_time = requested_time + pd.Timedelta(hours=horizon)
    forecasts = []

    try:
        h_list = [horizon] if horizon in (1, 3, 6) else [1]
        hourly = predict_cuchi(h_list, source=MONGO_SOURCE, scenario_name=scenario_name)
        hourly_forecast = hourly["forecasts"][0]
        forecasts.append({
            "station": "Củ Chi",
            "frontend_station_id": FORECAST_STATION_IDS["Củ Chi"],
            "model": "hourly",
            "forecast_ready": True,
            "target_timestamp": target_time.isoformat(),
            "risk_code": _risk_from_level(float(hourly_forecast["predicted_water_level"]))[1],
        })
    except (ValueError, FileNotFoundError):
        forecasts.append({
            "station": "Củ Chi",
            "frontend_station_id": FORECAST_STATION_IDS["Củ Chi"],
            "model": "hourly",
            "forecast_ready": False,
            "risk_code": 0,
        })

    for station_name, station_id in FORECAST_STATION_IDS.items():
        if station_name == "Củ Chi":
            continue
        if horizon != 24:
            forecasts.append({
                "station": station_name,
                "frontend_station_id": station_id,
                "model": "daily",
                "forecast_ready": False,
                "risk_code": 0,
            })
            continue
        try:
            daily = predict_daily_station(station_name, scenario_name=scenario_name)
            daily_target = pd.Timestamp(daily["target_timestamp"])
            forecasts.append({
                "station": station_name,
                "frontend_station_id": station_id,
                "model": "daily",
                "forecast_ready": True,
                "target_timestamp": daily_target.isoformat(),
                "risk_code": int(daily["alarm_level"]),
            })
        except (ValueError, FileNotFoundError, ImportError):
            forecasts.append({
                "station": station_name,
                "frontend_station_id": station_id,
                "model": "daily",
                "forecast_ready": False,
                "risk_code": 0,
            })

    return {
        "requested_timestamp": requested_time.isoformat(),
        "target_timestamp": target_time.isoformat(),
        "horizon_h": horizon,
        "forecasts": forecasts,
    }