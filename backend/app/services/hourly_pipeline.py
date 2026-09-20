from __future__ import annotations

from functools import lru_cache
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import pandas as pd

from backend.app.services.feature_builder import (
    build_cuchi_hourly_features,
)
from backend.app.services.model_data_store import load_model_csv
from backend.models_hourly.cuchi_inference import CuchiHourlyPredictor
from backend.app.services.daily_pipeline import predict_daily_station


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
MODEL_DIR = ROOT_DIR / "backend" / "models_hourly"
CSV_SOURCE = "csv"
MONGO_SOURCE = "mongo"
CUCHI_COORDS = (10.955556, 106.512778)
HOURLY_RADIUS_KM = 5.0
FLOOD_THRESHOLDS = ((1.60, "CRITICAL", 3), (1.50, "WARNING", 2), (1.40, "ADVISORY", 1))
DAILY_STATIONS = {
    "Nhà Bè": (10.639444, 106.734722),
    "Phú An": (10.778611, 106.707778),
    "Hóc Môn": (10.888190, 106.598219),
    "Lê Minh Xuân": (10.777222, 106.537222),
    "Thủ Đức": (10.844789, 106.755827),
}
FORECAST_STATION_IDS = {
    "Củ Chi": 9,
    "Hóc Môn": 8,
    "Nhà Bè": 5,
    "Phú An": 3,
}


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


def _select_replay_row(features: pd.DataFrame, predictor: CuchiHourlyPredictor, at: str | None) -> tuple[pd.Series, pd.Timestamp]:
    complete = features.dropna(subset=predictor.features)
    if complete.empty:
        raise ValueError("No hourly timestamp has a complete production feature row")
    if at is None:
        timestamp = complete.index[-1]
    else:
        timestamp = pd.Timestamp(at).floor("h")
        if timestamp < complete.index[0] or timestamp > complete.index[-1]:
            raise ValueError(
                f"Requested time {timestamp.isoformat()} is outside the hourly CSV range "
                f"{complete.index[0].isoformat()} to {complete.index[-1].isoformat()}"
            )
        available = complete.index[complete.index <= timestamp]
        if len(available) == 0:
            raise ValueError(f"No complete CSV feature row exists at or before {timestamp}")
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
) -> dict:
    if source not in {CSV_SOURCE, MONGO_SOURCE}:
        raise ValueError(f"Unsupported source: {source}; available={CSV_SOURCE}, {MONGO_SOURCE}")

    features = _load_hourly_features()
    predictor = _load_predictor()
    selected_horizons = predictor.horizons if horizons is None else horizons
    unsupported = [h for h in selected_horizons if h not in predictor.horizons]
    if unsupported:
        raise ValueError(
            f"Unsupported horizons: {unsupported}; available={predictor.horizons}"
        )

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
        "source": source,
        "data_file": "MongoDB:model_csv/Cu-Chi-post.csv",
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
) -> dict:
    distance = _distance_km(latitude, longitude, CUCHI_COORDS)
    if distance <= HOURLY_RADIUS_KM:
        result = predict_cuchi(horizons=horizons, at=at, source=source)
        result.update({"model": "hourly", "distance_to_station_km": distance})
        return result
    station_name, station_distance = min(
        ((name, _distance_km(latitude, longitude, coords)) for name, coords in DAILY_STATIONS.items()),
        key=lambda item: item[1],
    )
    try:
        daily_result = predict_daily_station(station_name, at=at)
        return {
            "station": station_name,
            "model": "daily",
            "model_status": "ready",
            "distance_to_station_km": station_distance,
            "requested_horizons": [24],
            "forecast": daily_result,
            "forecast_ready": True,
            "risk_level": {0: "SAFE", 1: "ADVISORY", 2: "WARNING", 3: "CRITICAL"}.get(int(daily_result["alarm_level"]), "SAFE"),
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


def predict_all_stations(at: str | None, horizon: int) -> dict:
    requested_time = pd.Timestamp.now().floor("h") if at is None else pd.Timestamp(at).floor("h")
    target_time = requested_time + pd.Timedelta(hours=horizon)
    forecasts = []

    try:
        hourly = predict_cuchi([horizon], source=MONGO_SOURCE)
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
        forecasts.append({"station": "Củ Chi", "frontend_station_id": 9, "model": "hourly", "forecast_ready": False, "risk_code": 0})

    for station_name, station_id in FORECAST_STATION_IDS.items():
        if station_name == "Củ Chi":
            continue
        if horizon != 24:
            forecasts.append({"station": station_name, "frontend_station_id": station_id, "model": "daily", "forecast_ready": False, "risk_code": 0})
            continue
        try:
            daily = predict_daily_station(station_name)
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
            forecasts.append({"station": station_name, "frontend_station_id": station_id, "model": "daily", "forecast_ready": False, "risk_code": 0})
    return {"requested_timestamp": requested_time.isoformat(), "target_timestamp": target_time.isoformat(), "horizon_h": horizon, "forecasts": forecasts}