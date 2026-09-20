from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[3]
HOURLY_SCHEMA_PATH = ROOT_DIR / "backend" / "models_hourly" / "feature_schema.json"
DAILY_SCHEMA_PATH = ROOT_DIR / "backend" / "model_daily" / "feature_schema.json"


def _schema_features() -> list[str]:
    with HOURLY_SCHEMA_PATH.open(encoding="utf-8") as file:
        return json.load(file)["features"]


def _daily_schema_features() -> list[str]:
    with DAILY_SCHEMA_PATH.open(encoding="utf-8") as file:
        return json.load(file)["features"]


def _lag(frame: pd.DataFrame, column: str, periods: int) -> pd.Series:
    return frame[column].shift(periods)


def _rolling_previous(frame: pd.DataFrame, column: str, window: int, method: str) -> pd.Series:
    values = frame[column].shift(1).rolling(window, min_periods=window)
    return getattr(values, method)()


def _hourly_index(values: pd.Series) -> pd.DatetimeIndex:
    timestamps = pd.to_datetime(values, errors="raise").dt.floor("h")
    return pd.DatetimeIndex(timestamps.drop_duplicates().sort_values())


def build_cuchi_hourly_features(
    water: pd.DataFrame,
    weather: pd.DataFrame,
    tide: pd.DataFrame,
    station: pd.DataFrame,
    start: str | pd.Timestamp | None = None,
    end: str | pd.Timestamp | None = None,
) -> pd.DataFrame:
    water_frame = water.rename(
        columns={
            "Date Time, GMT+07:00": "timestamp",
            "Water Level, meters": "water_level",
        }
    ).copy()
    water_frame["timestamp"] = pd.to_datetime(water_frame["timestamp"], errors="raise")
    water_series = (
        water_frame
        .set_index("timestamp")["water_level"]
        .sort_index()
    )
    hourly_index = pd.date_range(
        start=water_series.index.min().floor("h"),
        end=water_series.index.max().floor("h"),
        freq="h",
    )
    water_frame = water_series.reindex(hourly_index, method="ffill").rename("y_t")

    weather_frame = weather.copy()
    weather_frame["timestamp"] = pd.to_datetime(weather_frame["date"], errors="raise")
    weather_frame = weather_frame.set_index("timestamp")

    tide_frame = tide.rename(columns={"datetime_nhabe": "timestamp"}).copy()
    tide_frame["timestamp"] = pd.to_datetime(tide_frame["timestamp"], errors="raise")
    tide_frame = tide_frame.set_index("timestamp")["tide_vungtau_m"].resample("h").mean()
    tide_frame.name = "tide_vungtau_m"

    index = _hourly_index(pd.Series(water_frame.index))
    frame = pd.DataFrame(index=index)
    frame["y_t"] = water_frame.reindex(index)
    frame = frame.join(weather_frame, how="left").join(tide_frame, how="left")

    weather_columns = {
        "Tram_Cu_Chi_precipitation": "Tram_Cu_Chi_precipitation",
        "Tram_Cu_Chi_wind_speed_10m": "Tram_Cu_Chi_wind_speed_10m",
        "Tram_Cu_Chi_wind_gusts_10m": "Tram_Cu_Chi_wind_gusts_10m",
        "Tram_Cu_Chi_pressure_msl": "Tram_Cu_Chi_pressure_msl",
        "Dap_Tri_An_precipitation": "Dap_Tri_An_precipitation",
        "Dap_Dau_Tieng_precipitation": "Dap_Dau_Tieng_precipitation",
    }
    missing_weather = [column for column in weather_columns if column not in frame]
    if missing_weather:
        raise ValueError(f"Weather source is missing columns: {missing_weather}")

    frame["hour"] = frame.index.hour
    frame["hour_sin"] = np.sin(2 * np.pi * frame["hour"] / 24)
    frame["hour_cos"] = np.cos(2 * np.pi * frame["hour"] / 24)
    frame["dow"] = frame.index.dayofweek
    frame["dow_sin"] = np.sin(2 * np.pi * frame["dow"] / 7)
    frame["dow_cos"] = np.cos(2 * np.pi * frame["dow"] / 7)

    for periods in (1, 2, 3, 6, 12, 24):
        frame[f"wl_lag{periods}"] = _lag(frame, "y_t", periods)
    for window in (3, 6, 12):
        frame[f"wl_roll_mean{window}"] = _rolling_previous(frame, "y_t", window, "mean")
        frame[f"wl_roll_max{window}"] = _rolling_previous(frame, "y_t", window, "max")

    for periods in (1, 2, 3, 6):
        frame[f"tide_vt_lag{periods}"] = _lag(frame, "tide_vungtau_m", periods)
    frame["tide_vt_delta1"] = frame["tide_vungtau_m"] - frame["tide_vt_lag1"]

    frame["rain"] = frame["Tram_Cu_Chi_precipitation"]
    for periods in (1, 2, 3):
        frame[f"rain_lag{periods}"] = _lag(frame, "rain", periods)
    for window in (3, 6):
        frame[f"rain_sum{window}"] = frame["rain"].rolling(window, min_periods=window).sum()
    for column in ("Dap_Tri_An_precipitation", "Dap_Dau_Tieng_precipitation"):
        frame[f"{column}_sum3"] = frame[column].rolling(3, min_periods=3).sum()

    station_row = station.loc[station["tenTram"].eq("Củ Chi")]
    if station_row.empty:
        raise ValueError("Station metadata does not contain Củ Chi")
    station_values = station_row.iloc[0]
    station_mapping = {
        "station_lon": "lon",
        "station_lat": "lat",
        "station_dist_to_river_m": "dist_to_river_m",
        "station_tide_inf_sigmoid": "tide_inf_sigmoid",
        "station_tide_inf_exp": "tide_inf_exp",
        "station_pct_impervious": "pct_impervious",
        "station_channel_length_m": "channel_length_m",
        "station_channel_density_m_m2": "channel_density_m_m2",
    }
    for feature, source in station_mapping.items():
        frame[feature] = station_values[source]

    if start is not None:
        frame = frame.loc[pd.Timestamp(start) :]
    if end is not None:
        frame = frame.loc[: pd.Timestamp(end)]

    features = _schema_features()
    missing_features = [feature for feature in features if feature not in frame]
    if missing_features:
        raise ValueError(f"Hourly feature builder did not create: {missing_features}")
    return frame[features]


def validate_hourly_features(features: pd.DataFrame, warmup_hours: int = 24) -> None:
    expected = _schema_features()
    if list(features.columns) != expected:
        raise ValueError("Hourly feature columns do not match feature_schema.json")
    usable = features.iloc[warmup_hours:]
    missing = usable.columns[usable.isna().any()].tolist()
    if missing:
        raise ValueError(f"Hourly features contain missing values after warm-up: {missing}")


def _add_daily_lags(frame: pd.DataFrame, column: str) -> None:
    for periods in (1, 2, 3):
        frame[f"{column}_lag{periods}"] = frame.groupby("tenTram")[column].shift(periods)


def _add_daily_weather_features(frame: pd.DataFrame, column: str) -> None:
    _add_daily_lags(frame, column)
    frame[f"{column}_sum3"] = frame.groupby("tenTram")[column].transform(
        lambda values: values.rolling(3, min_periods=3).sum()
    )


def prepare_daily_weather(weather: pd.DataFrame) -> pd.DataFrame:
    """Convert the historical hourly weather file into daily model inputs."""
    frame = weather.copy()
    date_column = "ngay" if "ngay" in frame else "date"
    frame["ngay"] = pd.to_datetime(frame[date_column], errors="raise").dt.normalize()
    frame = frame.rename(
        columns={
            column: column.replace("Dap_", "dam_").replace("Tram_", "st_")
            for column in frame.columns
            if column.startswith(("Dap_", "Tram_"))
        }
    )

    weather_columns = [
        column for column in frame.columns
        if column not in {"date", "ngay", "tenTram"}
    ]
    if not weather_columns:
        raise ValueError("Daily weather source must contain weather columns")

    aggregations = {}
    for column in weather_columns:
        if column.endswith("_precipitation") or column.endswith("_rain"):
            aggregations[column] = "sum"
        elif column.endswith("_wind_gusts_10m"):
            aggregations[column] = "mean"
        else:
            aggregations[column] = "mean"
    return frame.groupby("ngay", as_index=False).agg(aggregations)


def build_daily_features(
    observations: pd.DataFrame,
    rain: pd.DataFrame,
    tide: pd.DataFrame,
    station: pd.DataFrame,
    weather: pd.DataFrame,
) -> pd.DataFrame:
    frame = observations.copy()
    frame["ngay"] = pd.to_datetime(frame["ngay"], errors="raise").dt.normalize()
    if "tenTram" not in frame or "doCaoDinhT" not in frame:
        raise ValueError("Daily observations require tenTram, ngay and doCaoDinhT")

    rain_frame = rain.copy()
    rain_frame["ngay"] = pd.to_datetime(rain_frame["ngay"], errors="raise").dt.normalize()
    rain_columns = [
        "rain",
        "rain_max_intensity",
        "rain_hours",
        "rain_lag1",
        "rain_lag2",
        "rain_lag3",
        "rain_lag7",
        "rain_roll3",
        "rain_roll7",
        "rain_mean3",
        "rain_mean7",
    ]
    missing_rain = [column for column in rain_columns if column not in rain_frame]
    if missing_rain:
        raise ValueError(f"Rain source is missing columns: {missing_rain}")
    rain_frame = rain_frame[["tenTram", "ngay", *rain_columns]]
    frame = frame.drop(columns=[column for column in rain_columns if column in frame], errors="ignore")
    frame = frame.merge(rain_frame, on=["tenTram", "ngay"], how="left")

    tide_frame = tide.copy()
    tide_frame["date"] = pd.to_datetime(tide_frame["date"], errors="raise").dt.normalize()
    tide_frame = tide_frame.rename(columns={"date": "ngay"})
    tide_columns = ["tide_max", "tide_min", "tide_mean", "tide_range"]
    missing_tide = [column for column in tide_columns if column not in tide_frame]
    if missing_tide:
        raise ValueError(f"Tide source is missing columns: {missing_tide}")
    frame = frame.drop(columns=[column for column in tide_columns if column in frame], errors="ignore")
    frame = frame.merge(tide_frame[["ngay", *tide_columns]], on="ngay", how="left")
    frame = frame.sort_values(["tenTram", "ngay"]).reset_index(drop=True)

    station_columns = [
        "lon",
        "lat",
        "dist_to_river_m",
        "tide_inf_sigmoid",
        "tide_inf_exp",
        "pct_impervious",
        "channel_length_m",
        "channel_density_m_m2",
    ]
    frame = frame.drop(columns=[column for column in station_columns if column in frame], errors="ignore")
    frame = frame.merge(station[["tenTram", *station_columns]], on="tenTram", how="left")
    frame["month"] = frame["ngay"].dt.month
    frame["day"] = frame["ngay"].dt.day
    frame["doy"] = frame["ngay"].dt.dayofyear
    frame["month_sin"] = np.sin(2 * np.pi * frame["month"] / 12)
    frame["month_cos"] = np.cos(2 * np.pi * frame["month"] / 12)
    frame["doy_sin"] = np.sin(2 * np.pi * frame["doy"] / 365.25)
    frame["doy_cos"] = np.cos(2 * np.pi * frame["doy"] / 365.25)
    frame["tide_doy_sin"] = frame["doy_sin"]
    frame["tide_doy_cos"] = frame["doy_cos"]

    for periods in (1, 2, 3, 5, 7):
        for column in tide_columns:
            frame[f"{column}_lag{periods}"] = frame[column].shift(periods)

    lunar_reference = pd.Timestamp("2000-01-06")
    lunar_age = ((frame["ngay"] - lunar_reference).dt.total_seconds() / 86400) % 29.530588
    frame["lunar_day"] = lunar_age
    frame["moon_phase_sin"] = np.sin(2 * np.pi * lunar_age / 29.530588)
    frame["moon_phase_cos"] = np.cos(2 * np.pi * lunar_age / 29.530588)
    frame["spring_neap_sin"] = np.sin(2 * np.pi * lunar_age / 14.765294)
    frame["spring_neap_cos"] = np.cos(2 * np.pi * lunar_age / 14.765294)

    weather_frame = prepare_daily_weather(weather)
    weather_columns = [column for column in weather_frame.columns if column != "ngay"]
    weather_keys = ["ngay"]
    frame = frame.merge(weather_frame[weather_keys + weather_columns], on=weather_keys, how="left")
    for column in weather_columns:
        if column.endswith("_precipitation") or column.endswith("_rain"):
            _add_daily_weather_features(frame, column)
        elif column.endswith("_wind_gusts_10m") or column.endswith("_pressure_msl"):
            _add_daily_lags(frame, column)

    frame["station_mean_peak"] = frame.groupby("tenTram")["doCaoDinhT"].transform("mean")
    frame["y_t"] = frame["doCaoDinhT"]
    features = _daily_schema_features()
    missing_features = [feature for feature in features if feature not in frame]
    if missing_features:
        raise ValueError(
            "Daily feature builder requires raw weather columns for: "
            + ", ".join(missing_features)
        )
    return frame[features]