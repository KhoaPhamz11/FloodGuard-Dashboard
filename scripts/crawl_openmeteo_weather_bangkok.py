from __future__ import annotations

import argparse
import time
from pathlib import Path

import pandas as pd
import requests


API_URL = "https://archive-api.open-meteo.com/v1/archive"
TIMEZONE = "Asia/Bangkok"
HOURLY_VARIABLES = [
    "pressure_msl",
    "surface_pressure",
    "precipitation",
    "rain",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]

SITES = {
    "Dap_Tri_An": (11.106, 107.000),
    "Dap_Dau_Tieng": (11.297, 106.354),
    "Tram_Hoc_Mon": (10.888190, 106.598219),
    "Tram_Le_Minh_Xuan": (10.777222, 106.537222),
    "Tram_Thu_Duc": (10.844789, 106.755827),
    "Tram_Nha_Be": (10.639444, 106.734722),
    "Tram_Phu_An": (10.778611, 106.707778),
}


def fetch_site(
    session: requests.Session,
    site: str,
    latitude: float,
    longitude: float,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(HOURLY_VARIABLES),
        "timezone": TIMEZONE,
    }
    response = session.get(API_URL, params=params, timeout=120)
    response.raise_for_status()
    payload = response.json()
    if payload.get("timezone") != TIMEZONE or payload.get("utc_offset_seconds") != 25200:
        raise ValueError(f"Open-Meteo returned unexpected timezone for {site}: {payload.get('timezone')}")

    hourly = payload.get("hourly")
    if not hourly or "time" not in hourly:
        raise ValueError(f"Open-Meteo returned no hourly data for {site}")
    frame = pd.DataFrame(hourly).rename(columns={"time": "date"})
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.strftime("%Y-%m-%d %H:%M:%S")
    return frame.rename(columns={column: f"{site}_{column}" for column in HOURLY_VARIABLES})


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl Open-Meteo weather in Asia/Bangkok time.")
    parser.add_argument("--start", default="2017-01-01")
    parser.add_argument("--end", default="2023-12-31")
    parser.add_argument(
        "--output",
        default="data/historical_weather_features_openmeteo_bangkok.csv",
    )
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    with requests.Session() as session:
        for index, (site, (latitude, longitude)) in enumerate(SITES.items()):
            print(f"[{index + 1}/{len(SITES)}] {site} ({latitude}, {longitude})")
            frames.append(fetch_site(session, site, latitude, longitude, args.start, args.end))
            if index < len(SITES) - 1:
                time.sleep(1)

    result = frames[0]
    for frame in frames[1:]:
        result = result.merge(frame, on="date", how="outer", validate="one_to_one")
    result = result.sort_values("date").reset_index(drop=True)

    expected_columns = ["date"] + [f"{site}_{variable}" for site in SITES for variable in HOURLY_VARIABLES]
    result = result[expected_columns]
    if result["date"].duplicated().any():
        raise ValueError("Crawled weather data contains duplicate timestamps")
    if result[expected_columns[1:]].isna().any().any():
        missing = result.columns[result.isna().any()].tolist()
        raise ValueError(f"Crawled weather data contains missing values: {missing}")

    result.to_csv(output, index=False)
    print(f"Wrote {len(result):,} rows and {len(result.columns)} columns to {output}")
    print(f"Range: {result['date'].iloc[0]} -> {result['date'].iloc[-1]}")


if __name__ == "__main__":
    main()
