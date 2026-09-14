import json
import joblib
from pathlib import Path
import numpy as np
import pandas as pd
import xgboost as xgb

try:
    from catboost import CatBoostRegressor
except Exception:
    CatBoostRegressor = None

PACKAGE_DIR = Path(__file__).resolve().parent

with open(PACKAGE_DIR / "feature_schema.json", encoding="utf-8") as f:
    SCHEMA = json.load(f)
with open(PACKAGE_DIR / "thresholds.json", encoding="utf-8") as f:
    THRESHOLDS = json.load(f)
with open(PACKAGE_DIR / "station_mean_maps.json", encoding="utf-8") as f:
    STATION_MEANS = json.load(f)
with open(PACKAGE_DIR / "conformal_q90.json", encoding="utf-8") as f:
    Q90 = json.load(f)

FEAT = SCHEMA["features"]
THR_I, THR_II, THR_III = 1.40, 1.50, 1.60


def load_models(h: int):
    d = PACKAGE_DIR / f"h{h}"
    models = []
    if (d / "lgb.joblib").exists():
        models.append(joblib.load(d / "lgb.joblib"))
    if (d / "xgb.json").exists():
        m = xgb.XGBRegressor()
        m.load_model(str(d / "xgb.json"))
        models.append(m)
    if (d / "cat.cbm").exists() and CatBoostRegressor is not None:
        m = CatBoostRegressor()
        m.load_model(str(d / "cat.cbm"))
        models.append(m)
    return models


def station_threshold(station: str, h: int) -> float:
    vals = [
        r["threshold"] for r in THRESHOLDS
        if int(r["horizon"]) == int(h) and r["tenTram"] == station
    ]
    if vals:
        return float(vals[0])
    same_h = [r["threshold"] for r in THRESHOLDS if int(r["horizon"]) == int(h)]
    return float(np.median(same_h)) if same_h else THR_I


def predict_saved(df: pd.DataFrame, h: int = 1) -> pd.DataFrame:
    x = df.copy()
    x["y_t"] = x["doCaoDinhT"]

    if "station_mean_peak" not in x.columns:
        means = STATION_MEANS.get(str(h), {})
        gm = np.mean(list(means.values())) if means else float(x["y_t"].mean())
        x["station_mean_peak"] = [means.get(s, gm) for s in x["tenTram"]]

    X = x[FEAT].fillna(0)
    pred_delta = np.mean([m.predict(X) for m in load_models(h)], axis=0)
    pred_peak = x["y_t"].to_numpy() + pred_delta
    q = float(Q90[str(h)])

    out = x[["tenTram"]].copy()
    out["pred_delta"] = pred_delta
    out["pred_peak"] = pred_peak
    out["pred_lo"] = pred_peak - q
    out["pred_hi"] = pred_peak + q
    out["flood_threshold"] = [station_threshold(s, h) for s in out["tenTram"]]
    out["flood_warning"] = (out["pred_peak"] >= out["flood_threshold"]).astype(int)
    out["standby_warning"] = (out["pred_hi"] >= out["flood_threshold"]).astype(int)

    # 4-level severity (IV merged into III)
    out["alarm_level"] = np.select(
        [
            out["pred_peak"] >= THR_III,
            out["pred_peak"] >= THR_II,
            out["pred_peak"] >= THR_I,
        ],
        [3, 2, 1],
        default=0,
    )
    return out
