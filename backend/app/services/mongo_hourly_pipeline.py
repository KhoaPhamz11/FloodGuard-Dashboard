from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

import pandas as pd

from backend.app.services.feature_builder import build_cuchi_hourly_features
from backend.app.services.model_data_store import load_model_csv
from backend.app.services.mongodb_service import load_latest_documents
from backend.models_hourly.cuchi_inference import CuchiHourlyPredictor

# Constants – reuse same values as in hourly_pipeline
ROOT_DIR = Path(__file__).resolve().parents[3]
MODEL_DIR = ROOT_DIR / "backend" / "models_hourly"

# Cached loaders – identical to hourly_pipeline for consistency
@pd.api.extensions.register_series_accessor("cuchi")
def _load_predictor() -> CuchiHourlyPredictor:
    """Load and cache the hourly Cuchi predictor.

    The function is deliberately simple (no lru_cache) because the script
    will be executed once per run and the overhead is negligible.
    """
    return CuchiHourlyPredictor(MODEL_DIR)

def _load_hourly_features_from_mongo(limit: int = 50) -> pd.DataFrame:
    """Build the feature DataFrame using the simulated MongoDB dump.

    Parameters
    ----------
    limit: int
        Number of newest MongoDB documents to use (mirrors the original
        ``publisher`` limit argument).  The loader returns a DataFrame with the
        same column names as ``Cu-Chi-post.csv`` (e.g. ``y_t`` for water level).
    """
    water_df = load_latest_documents(limit=limit)
    # Load the static auxiliary CSVs required by ``build_cuchi_hourly_features``
    weather_df = load_model_csv("cuchi-historical_weather_features.csv")
    tide_df = load_model_csv("tide_hourly.csv")
    station_df = load_model_csv("stations_master_features.csv")
    return build_cuchi_hourly_features(
        water=water_df,
        weather=weather_df,
        tide=tide_df,
        station=station_df,
    )

def predict_from_mongo(
    horizons: Optional[List[int]] = None,
    at: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """Run the hourly Cuchi model using the simulated MongoDB data.

    This function mirrors ``backend.app.services.hourly_pipeline.predict_cuchi``
    but sources the water‑level observations from ``latest_documents.txt``
    instead of the CSV ``Cu-Chi-post.csv``.

    Parameters
    ----------
    horizons: list[int] | None
        Desired forecast horizons in hours.  If ``None`` all horizons supported
        by the model are used.
    at: str | None
        Timestamp (ISO‑format or any pandas‑parseable string) to select a
        specific row from the feature matrix.  ``None`` selects the most recent
        complete row.
    limit: int
        Number of newest MongoDB documents to read – forwarded to
        ``load_latest_documents``.
    """
    predictor = _load_predictor()
    selected_horizons = predictor.horizons if horizons is None else horizons
    unsupported = [h for h in selected_horizons if h not in predictor.horizons]
    if unsupported:
        raise ValueError(
            f"Unsupported horizons: {unsupported}; available={predictor.horizons}"
        )

    # Build features from MongoDB dump
    features = _load_hourly_features_from_mongo(limit=limit)

    # Ensure schema matches model expectation (same as hourly_pipeline)
    expected = predictor.features
    if list(features.columns) != expected:
        raise ValueError(
            "Hourly feature columns do not match the production model schema"
        )

    # Select row (same logic as hourly_pipeline._select_replay_row)
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
    selected = complete.loc[timestamp]

    # Current water level & rate – same as hourly_pipeline
    position = features.index.get_loc(timestamp)
    if isinstance(position, slice) or position == 0:
        raise ValueError("Cannot calculate water-level rate without a previous timestamp")
    previous = features.iloc[position - 1]
    current = features.iloc[position]
    delta_seconds = (timestamp - features.index[position - 1]).total_seconds()
    if delta_seconds <= 0 or pd.isna(previous["y_t"]) or pd.isna(current["y_t"]):
        raise ValueError("Cannot calculate water-level rate from invalid adjacent water levels")
    rate = (float(current["y_t"]) - float(previous["y_t"])) / delta_seconds

    # Forecasts for each horizon
    forecasts = [
        predictor.predict_from_features(selected.to_dict(), float(current["y_t"]), horizon)
        for horizon in selected_horizons
    ]
    max_level = max(item["predicted_water_level"] for item in forecasts)
    # Re‑use the same risk mapping as hourly_pipeline
    from backend.app.services.hourly_pipeline import _risk_from_level

    risk_level, risk_code = _risk_from_level(max_level)

    return {
        "station": "Củ Chi",
        "source": "mongo",
        "data_file": "MongoDB:latest_documents.txt",
        "replay": False,
        "feature_timestamp": timestamp.isoformat(),
        "current_water_level": float(current["y_t"]),
        "water_level_rate_m_per_s": rate,
        "water_level_rate_m_per_hour": rate * 3600,
        "delta_t_seconds": delta_seconds,
        "forecast_ready": True,
        "risk_level": risk_level,
        "risk_code": risk_code,
        "forecasts": forecasts,
    }

