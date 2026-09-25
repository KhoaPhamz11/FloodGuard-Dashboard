"""
Source of truth: danh sách trạm đồng bộ Frontend ↔ Backend ↔ Scenario.
Chỉ gồm trạm sensor / model thật.
"""
from __future__ import annotations

from typing import Any

# id = frontend_station_id (1-based) = scenario station_{id}
STATION_REGISTRY: dict[int, dict[str, Any]] = {
    1: {
        "backend_name": "Nhà Bè",
        "ui_name": "Trạm Nhà Bè",
        "lat": 10.639444,
        "lon": 106.734722,
        "model": "daily",
        "scenario_key": "station_1",
    },
    2: {
        "backend_name": "Phú An",
        "ui_name": "Trạm Phú An",
        "lat": 10.778611,
        "lon": 106.707778,
        "model": "daily",
        "scenario_key": "station_2",
    },
    3: {
        "backend_name": "Hóc Môn",
        "ui_name": "Trạm Hóc Môn",
        "lat": 10.888190,
        "lon": 106.598219,
        "model": "daily",
        "scenario_key": "station_3",
    },
    4: {
        "backend_name": "Lê Minh Xuân",
        "ui_name": "Trạm Lê Minh Xuân",
        "lat": 10.777222,
        "lon": 106.537222,
        "model": "daily",
        "scenario_key": "station_4",
    },
    5: {
        "backend_name": "Thủ Đức",
        "ui_name": "Trạm Thủ Đức",
        "lat": 10.844789,
        "lon": 106.755827,
        "model": "daily",
        "scenario_key": "station_5",
    },
    6: {
        "backend_name": "Củ Chi",
        "ui_name": "Trạm Củ Chi",
        "lat": 10.955556,
        "lon": 106.512778,
        "model": "hourly",
        "scenario_key": "station_6",
    },
    7: {
        "backend_name": "Gò Vấp",
        "ui_name": "Trạm Gò Vấp",
        "lat": 10.8250,
        "lon": 106.6660,
        "model": "daily",
        "scenario_key": "station_7",
    },
}

DAILY_STATIONS: dict[str, tuple[float, float]] = {
    meta["backend_name"]: (meta["lat"], meta["lon"])
    for meta in STATION_REGISTRY.values()
    if meta["model"] == "daily"
}

FORECAST_STATION_IDS: dict[str, int] = {
    meta["backend_name"]: fid for fid, meta in STATION_REGISTRY.items()
}

CUCHI_COORDS: tuple[float, float] = (STATION_REGISTRY[6]["lat"], STATION_REGISTRY[6]["lon"])
CUCHI_SCENARIO_STATION_INDEX: int = 5  # station_6 → index 5


def scenario_index_from_frontend_id(frontend_id: int) -> int:
    return frontend_id - 1


def scenario_index_from_backend_name(name: str) -> int:
    for fid, meta in STATION_REGISTRY.items():
        if meta["backend_name"] == name:
            return scenario_index_from_frontend_id(fid)
    return 0


def frontend_id_from_backend_name(name: str) -> int | None:
    for fid, meta in STATION_REGISTRY.items():
        if meta["backend_name"] == name:
            return fid
    return None


def backend_name_from_frontend_id(frontend_id: int) -> str | None:
    meta = STATION_REGISTRY.get(frontend_id)
    return meta["backend_name"] if meta else None


def model_for_backend_name(name: str) -> str | None:
    for meta in STATION_REGISTRY.values():
        if meta["backend_name"] == name:
            return meta["model"]
    return None