# -----------------------------------------------------------
# Test Pipeline theo Kịch bản JSON (Không dùng MongoDB)
# -----------------------------------------------------------

import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from backend.app.services.feature_builder import (
    build_cuchi_hourly_features,
    build_daily_features,
)
from backend.app.services.model_data_store import load_model_csv
from backend.models_hourly.cuchi_inference import CuchiHourlyPredictor

ROOT_DIR = Path(__file__).resolve().parents[0]  # Điều chỉnh nếu đặt file ở thư mục khác
SCENARIO_JSON_PATH = ROOT_DIR / "scenarios_2_kich_ban.json"


def load_scenarios(json_path: Path = SCENARIO_JSON_PATH) -> list[dict]:
    """Đọc file JSON kịch bản."""
    if not json_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file kịch bản: {json_path}")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def create_synthetic_hourly_data(station_data: dict, hours: int = 48) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Tạo chuỗi thời gian giả lập 48 tiếng từ thông số kịch bản cho HOURLY Model.
    """
    end_dt = datetime.now().replace(minute=0, second=0, microsecond=0)
    timestamps = [end_dt - timedelta(hours=i) for i in range(hours - 1, -1, -1)]

    # 1. Giả lập Mực nước (water)
    h_val = float(station_data.get("H", 0.0))
    water_df = pd.DataFrame({
        "timestamp": timestamps,
        "water_level": [h_val] * hours,
    })

    # 2. Giả lập Thời tiết (weather)
    r_val = float(station_data.get("R", 0.0))
    weather_df = pd.DataFrame({
        "timestamp": timestamps,
        "Tram_Cu_Chi_precipitation": [r_val] * hours,
        "Tram_Cu_Chi_wind_speed_10m": [10.0] * hours,
        "Tram_Cu_Chi_wind_gusts_10m": [15.0] * hours,
        "Tram_Cu_Chi_pressure_msl": [1010.0] * hours,
        "Dap_Tri_An_precipitation": [r_val] * hours,
        "Dap_Dau_Tieng_precipitation": [r_val] * hours,
    })

    # 3. Giả lập Thủy triều (tide)
    tide_val = float(station_data.get("H_tide", 1.2))
    tide_df = pd.DataFrame({
        "timestamp": timestamps,
        "tide_vungtau_m": [tide_val] * hours,
    })

    return water_df, weather_df, tide_df


def test_hourly_model_with_scenario(scenario: dict, station_index: int = 0):
    """Test mô hình HOURLY (Củ Chi) với một trạm trong kịch bản."""
    scenario_name = scenario.get("scenario_name")
    station_data = scenario["stations_data"][station_index]
    station_name = station_data.get("station_name")

    print(f"\n==================================================")
    print(f"🧪 HOURLY MODEL TEST - KỊCH BẢN: [{scenario_name}] - Trạm: [{station_name}]")
    print(f"==================================================")
    print(f"📥 Thông số đầu vào kịch bản: H={station_data['H']}m, R={station_data['R']}mm, H_tide={station_data['H_tide']}m")

    # 1. Tạo chuỗi giả lập 48h
    water_df, weather_df, tide_df = create_synthetic_hourly_data(station_data, hours=48)
    station_df = load_model_csv("stations_master_features.csv")

    # 2. Tạo Feature Matrix
    features = build_cuchi_hourly_features(
        water=water_df,
        weather=weather_df,
        tide=tide_df,
        station=station_df,
    )

    # 3. Lấy dòng cuối cùng và chạy Predictor
    predictor = CuchiHourlyPredictor(ROOT_DIR / "backend" / "models_hourly")
    selected_row = features.iloc[-1]
    current_level = float(selected_row["y_t"])

    print("\n🔮 Kết quả dự báo mô hình HOURLY theo từng Horizon:")
    for horizon in [1, 3, 6, 12, 24]:
        pred = predictor.predict_from_features(selected_row.to_dict(), current_level, horizon)
        print(f"  • Horizon +{horizon:2d}h -> Dự báo Mực nước: {pred['predicted_water_level']:.3f} m")


def run_scenario_tests():
    scenarios = load_scenarios()

    for scenario in scenarios:
        print(f"\n📌 MÔ TẢ KỊCH BẢN: {scenario['scenario_description']}")
        # Lấy trạm đầu tiên hoặc trạm 5 (thường có biến động ngập cao) để test
        test_hourly_model_with_scenario(scenario, station_index=0)
        test_hourly_model_with_scenario(scenario, station_index=4)


if __name__ == "__main__":
    run_scenario_tests()