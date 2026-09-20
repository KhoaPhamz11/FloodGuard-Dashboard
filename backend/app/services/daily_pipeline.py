from __future__ import annotations

import importlib.util
from functools import lru_cache
from pathlib import Path

import pandas as pd

from backend.app.services.feature_builder import build_daily_features
from backend.app.services.model_data_store import load_model_csv


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
MODEL_DIR = ROOT_DIR / "backend" / "model_daily"
FALLBACK_MODEL_DIR = ROOT_DIR / "artifacts" / "water_flood_t1"


@lru_cache(maxsize=1)
def _load_predictor_module():
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
def _load_daily_frame() -> pd.DataFrame:
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


def predict_daily_station(station_name: str, at: str | None = None) -> dict:
    module = _load_predictor_module()
    frame = _load_daily_frame()
    station_frame = frame[frame["tenTram"].eq(station_name)].copy()
    if station_frame.empty:
        raise ValueError(f"No daily observation data for station: {station_name}")
    if at is not None:
        timestamp = pd.Timestamp(at).normalize()
        available_dates = station_frame["ngay"].sort_values()
        if timestamp < available_dates.iloc[0] or timestamp > available_dates.iloc[-1]:
            raise ValueError(
                f"Requested date {timestamp.date()} is outside the daily CSV range "
                f"{available_dates.iloc[0].date()} to {available_dates.iloc[-1].date()}"
            )
        station_frame = station_frame[station_frame["ngay"] <= timestamp]
    if station_frame.empty:
        raise ValueError(f"No daily row exists at or before {at} for {station_name}")
    row = station_frame.sort_values("ngay").tail(1)
    result = module.predict_saved(row, h=1).iloc[0].to_dict()
    result["station"] = station_name
    result["model"] = "daily"
    result["horizon_h"] = 24
    result["feature_date"] = row.iloc[0]["ngay"].isoformat()
    result["predicted_water_level"] = float(result["pred_peak"])
    result["target_timestamp"] = (row.iloc[0]["ngay"] + pd.Timedelta(hours=24)).isoformat()
    return result
