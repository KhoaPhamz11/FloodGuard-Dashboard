from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

class CuchiHourlyPredictor:
    def __init__(self, model_dir):
        self.model_dir = Path(model_dir)
        with open(self.model_dir / 'feature_schema.json', 'r', encoding='utf-8') as f:
            self.schema = json.load(f)
        self.features = self.schema['features']
        self.horizons = [int(h) for h in self.schema['horizons_hours']]
        self.models = {h: joblib.load(self.model_dir / f'cuchi_lgb_h{h}h_production.joblib') for h in self.horizons}

    def predict_from_features(self, feature_row, current_water_level, horizon):
        horizon = int(horizon)
        if horizon not in self.models:
            raise ValueError(f'Unsupported horizon: {horizon}; available={self.horizons}')
        X = pd.DataFrame([feature_row]) if isinstance(feature_row, dict) else feature_row.copy()
        missing = [c for c in self.features if c not in X.columns]
        if missing:
            raise ValueError(f'Missing model features: {missing}')
        X = X[self.features].replace([np.inf, -np.inf], np.nan).fillna(0)
        delta = float(self.models[horizon].predict(X)[0])
        return {
            'horizon_h': horizon,
            'current_water_level': float(current_water_level),
            'predicted_delta': delta,
            'predicted_water_level': float(current_water_level) + delta,
        }

