# -*- coding: utf-8 -*-
"""Tests for the full FloodGuard AI pipeline (hourly & daily models).

The test invokes the high‑level entry point `predict_all_stations` from
`backend.app.services.hourly_pipeline` which internally:
  * loads the hourly feature matrix (Hybrid MongoDB + Open‑Meteo or CSV fallback)
  * runs the hourly predictor for Củ Chi
  * runs the daily predictor for the remaining stations

The goal is to ensure that the pipeline runs without raising exceptions
and returns a JSON‑serialisable dictionary containing the expected keys.
"""

import json
import pytest

# Import the function under test.  The project root (d:\\FloodGuard-Dashboard) is
# added to `sys.path` by the test runner, so a absolute import works.
import sys, os
# Add project root to PYTHONPATH so absolute imports work in tests
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from backend.app.services.hourly_pipeline import predict_all_stations

@pytest.mark.parametrize("horizon", [24])
def test_predict_all_stations_returns_structure(horizon):
    """Run the full pipeline and validate the result structure.

    The function should return a dict with the following top‑level keys:
        * ``requested_timestamp`` – ISO‑8601 string of the request time
        * ``target_timestamp``    – ISO‑8601 string of the forecast target
        * ``horizon_h``           – the horizon value passed in
        * ``forecasts``           – list of per‑station forecast dicts
    Each forecast dict must contain at least:
        * ``station`` – station name
        * ``model``   – ``hourly`` or ``daily``
        * ``forecast_ready`` – bool
        * ``risk_code`` – integer risk level (0‑3)
    """
    # Execute the pipeline – this will hit the MongoDB and Open‑Meteo services.
    # In CI environments those services may be unavailable, but the code
    # contains graceful fall‑backs to CSV files, so the call should still succeed.
    result = predict_all_stations(at=None, horizon=horizon)

    # Basic sanity checks – ensure the result is a dict and JSON‑serialisable.
    assert isinstance(result, dict), "Result should be a dictionary"
    json.dumps(result)  # will raise if not serialisable

    # Verify required top‑level keys.
    for key in ["requested_timestamp", "target_timestamp", "horizon_h", "forecasts"]:
        assert key in result, f"Missing top‑level key: {key}"

    forecasts = result["forecasts"]
    assert isinstance(forecasts, list) and forecasts, "Forecasts list should be non‑empty"

    # Validate each station forecast entry.
    for forecast in forecasts:
        assert isinstance(forecast, dict), "Each forecast must be a dict"
        for field in ["station", "model", "forecast_ready", "risk_code"]:
            assert field in forecast, f"Missing field '{field}' in forecast for station {forecast.get('station')}`"
        # risk_code should be 0‑3
        assert 0 <= int(forecast["risk_code"]) <= 3, "risk_code out of expected range"

    # Spot‑check that Củ Chi uses the hourly model.
    cuchi = next((f for f in forecasts if f.get("station") == "Củ Chi"), None)
    assert cuchi is not None, "Củ Chi forecast entry missing"
    assert cuchi["model"] == "hourly", "Củ Chi should be processed by the hourly model"

    # The remaining stations should be using the daily model.
    daily_stations = [f for f in forecasts if f["station"] != "Củ Chi"]
    for ds in daily_stations:
        assert ds["model"] == "daily", f"Station {ds['station']} expected to use daily model"

