# backend/app/services/openmeteo_service.py
from datetime import datetime
import pandas as pd
import requests

# Tọa độ 3 điểm khí tượng trong model
LOCATIONS = {
    "Cu_Chi": {"lat": 10.955556, "lon": 106.512778},
    "Tri_An": {"lat": 11.1091, "lon": 107.0183},
    "Dau_Tieng": {"lat": 11.3325, "lon": 106.3686},
}


def fetch_openmeteo_weather(start_dt: datetime, end_dt: datetime) -> pd.DataFrame:
    """
    Gọi Open-Meteo API lấy thời tiết Củ Chi, Trị An, Dầu Tiếng
    và rename cột đúng schema feature_builder hourly (Tram_ / Dap_).
    """
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")

    data_frames = []

    for loc_name, coords in LOCATIONS.items():
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "start_date": start_str,
            "end_date": end_str,
            "hourly": ["precipitation", "wind_speed_10m", "wind_gusts_10m", "surface_pressure"],
            "timezone": "Asia/Ho_Chi_Minh",
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        res_json = response.json()

        hourly = res_json.get("hourly", {})
        df_loc = pd.DataFrame({
            "date": pd.to_datetime(hourly["time"]),
            f"{loc_name}_precipitation": hourly["precipitation"],
            f"{loc_name}_wind_speed_10m": hourly["wind_speed_10m"],
            f"{loc_name}_wind_gusts_10m": hourly["wind_gusts_10m"],
            f"{loc_name}_pressure_msl": hourly["surface_pressure"],
        })
        df_loc.set_index("date", inplace=True)
        data_frames.append(df_loc)

    weather_df = pd.concat(data_frames, axis=1).reset_index()

    weather_df = weather_df.rename(columns={
        "Cu_Chi_precipitation": "Tram_Cu_Chi_precipitation",
        "Cu_Chi_wind_speed_10m": "Tram_Cu_Chi_wind_speed_10m",
        "Cu_Chi_wind_gusts_10m": "Tram_Cu_Chi_wind_gusts_10m",
        "Cu_Chi_pressure_msl": "Tram_Cu_Chi_pressure_msl",
        "Tri_An_precipitation": "Dap_Tri_An_precipitation",
        "Tri_An_wind_speed_10m": "Dap_Tri_An_wind_speed_10m",
        "Tri_An_wind_gusts_10m": "Dap_Tri_An_wind_gusts_10m",
        "Tri_An_pressure_msl": "Dap_Tri_An_pressure_msl",
        "Dau_Tieng_precipitation": "Dap_Dau_Tieng_precipitation",
        "Dau_Tieng_wind_speed_10m": "Dap_Dau_Tieng_wind_speed_10m",
        "Dau_Tieng_wind_gusts_10m": "Dap_Dau_Tieng_wind_gusts_10m",
        "Dau_Tieng_pressure_msl": "Dap_Dau_Tieng_pressure_msl",
    })

    return weather_df