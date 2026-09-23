#!/usr/bin/env python3
"""
Test full pipeline — Trang dẫn đường tránh ngập (Navigation + Flood + Forecast).

Chạy khi backend đang listen (mặc định http://127.0.0.1:8000):

    # PowerShell
    $env:API_BASE = "http://127.0.0.1:8000"
    python tests/test_navigation_flood_pipeline.py

Hoặc:

    python tests/test_navigation_flood_pipeline.py --base http://127.0.0.1:8000

Các bước:
  1. GET  /api/latest                         — dữ liệu live / scenario stations
  2. GET  /api/navigation/geocode             — geocode điểm đi / đến
  3. POST /api/navigation/route               — route chính
  4. GET  /api/forecast/stations?horizon=24   — tô màu trạm (mode AI)
  5. GET  /api/forecast?lat&lon&horizons=24   — forecast neo trên route
  6. POST /api/navigation/route + avoid       — route vòng (nếu có CRITICAL)
  7. Tóm tắt pass/fail
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

try:
    import requests
except ImportError:
    print("Cần: pip install requests")
    sys.exit(1)


# ----- Điểm mẫu trong TP.HCM (gần trung tâm, dễ có route) -----
SAMPLE_START_TEXT = "duong ton duc thang"
SAMPLE_END_TEXT = "duong ham nghi"
# Fallback tọa độ nếu geocode fail (lng, lat) — gần Q1
FALLBACK_START = [106.7065, 10.7770]
FALLBACK_END = [106.7020, 10.7715]


class Result:
    def __init__(self):
        self.rows: list[tuple[str, bool, str]] = []

    def ok(self, name: str, detail: str = ""):
        self.rows.append((name, True, detail))
        print(f"  ✅ {name}" + (f" — {detail}" if detail else ""))

    def fail(self, name: str, detail: str = ""):
        self.rows.append((name, False, detail))
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))

    def summary(self) -> int:
        passed = sum(1 for _, ok, _ in self.rows if ok)
        total = len(self.rows)
        print("\n" + "=" * 60)
        print(f"KẾT QUẢ: {passed}/{total} passed")
        print("=" * 60)
        for name, ok, detail in self.rows:
            mark = "PASS" if ok else "FAIL"
            print(f"  [{mark}] {name}" + (f" | {detail}" if detail and not ok else ""))
        return 0 if passed == total else 1


def get_json(base: str, path: str, timeout: float = 30) -> tuple[int, Any]:
    url = f"{base.rstrip('/')}{path}"
    r = requests.get(url, timeout=timeout)
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


def post_json(base: str, path: str, payload: dict, timeout: float = 60) -> tuple[int, Any]:
    url = f"{base.rstrip('/')}{path}"
    r = requests.post(url, json=payload, timeout=timeout)
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


def pick_geocode_coords(body: Any) -> list[float] | None:
    """GeoJSON features[0].geometry.coordinates → [lng, lat]."""
    if not isinstance(body, dict):
        return None
    feats = body.get("features") or []
    if not feats:
        return None
    geom = feats[0].get("geometry") or {}
    coords = geom.get("coordinates")
    if isinstance(coords, list) and len(coords) >= 2:
        return [float(coords[0]), float(coords[1])]
    return None


def extract_route_feature(body: Any) -> dict | None:
    if not isinstance(body, dict):
        return None
    feats = body.get("features") or []
    if not feats:
        return None
    return feats[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Test pipeline dẫn đường tránh ngập")
    parser.add_argument(
        "--base",
        default=None,
        help="API base URL (mặc định env API_BASE hoặc http://127.0.0.1:8000)",
    )
    parser.add_argument("--start", default=SAMPLE_START_TEXT, help="Text geocode điểm đi")
    parser.add_argument("--end", default=SAMPLE_END_TEXT, help="Text geocode điểm đến")
    args = parser.parse_args()

    import os
    base = args.base or os.getenv("API_BASE") or "http://127.0.0.1:8000"
    res = Result()

    print(f"\n🧪 Navigation Flood Pipeline Test")
    print(f"   API: {base}\n")

    # ------------------------------------------------------------------
    # 1. Health / latest
    # ------------------------------------------------------------------
    print("① GET /api/latest")
    try:
        code, body = get_json(base, "/api/latest")
        if code != 200:
            res.fail("/api/latest", f"HTTP {code}")
        elif not isinstance(body, dict):
            res.fail("/api/latest", "body không phải JSON object")
        else:
            stations = body.get("stations_data") or body.get("stations") or []
            n = len(stations) if isinstance(stations, list) else 0
            res.ok("/api/latest", f"{n} stations_data")
            if n == 0:
                res.fail("/api/latest stations_data", "rỗng — UI sẽ không tô màu live")
            else:
                sample = stations[0]
                keys = list(sample.keys()) if isinstance(sample, dict) else []
                need = {"station_name", "H", "code"}
                missing = need - set(keys)
                if missing:
                    res.fail("stations_data schema", f"thiếu {missing}; có {keys[:12]}")
                else:
                    res.ok("stations_data schema", f"station_name/H/code OK")
    except requests.RequestException as e:
        res.fail("/api/latest", str(e))
        print("\n⚠️  Backend không reachable — dừng test.")
        return res.summary()

    # ------------------------------------------------------------------
    # 2. Geocode start / end
    # ------------------------------------------------------------------
    print("\n② GET /api/navigation/geocode")
    start_coords = None
    end_coords = None
    try:
        code, body = get_json(base, f"/api/navigation/geocode?text={requests.utils.quote(args.start)}")
        if code != 200:
            res.fail("geocode start", f"HTTP {code}")
        else:
            start_coords = pick_geocode_coords(body)
            if start_coords:
                res.ok("geocode start", f"{args.start} → {start_coords}")
            else:
                res.fail("geocode start", "không có features/coordinates")
    except requests.RequestException as e:
        res.fail("geocode start", str(e))

    try:
        code, body = get_json(base, f"/api/navigation/geocode?text={requests.utils.quote(args.end)}")
        if code != 200:
            res.fail("geocode end", f"HTTP {code}")
        else:
            end_coords = pick_geocode_coords(body)
            if end_coords:
                res.ok("geocode end", f"{args.end} → {end_coords}")
            else:
                res.fail("geocode end", "không có features/coordinates")
    except requests.RequestException as e:
        res.fail("geocode end", str(e))

    if not start_coords:
        start_coords = FALLBACK_START
        print(f"  ℹ️  Dùng FALLBACK_START {start_coords}")
    if not end_coords:
        end_coords = FALLBACK_END
        print(f"  ℹ️  Dùng FALLBACK_END {end_coords}")

    # ------------------------------------------------------------------
    # 3. Route chính
    # ------------------------------------------------------------------
    print("\n③ POST /api/navigation/route")
    route_feature = None
    try:
        code, body = post_json(
            base,
            "/api/navigation/route",
            {"start": start_coords, "end": end_coords},
        )
        if code != 200:
            res.fail("route", f"HTTP {code} body={str(body)[:200]}")
        else:
            route_feature = extract_route_feature(body)
            if not route_feature:
                res.fail("route", "không có features[0]")
            else:
                coords = (route_feature.get("geometry") or {}).get("coordinates") or []
                props = route_feature.get("properties") or {}
                segs = props.get("segments") or []
                dist = segs[0].get("distance") if segs else None
                res.ok(
                    "route",
                    f"{len(coords)} points, dist≈{dist}m" if dist else f"{len(coords)} points",
                )
                if len(coords) < 2:
                    res.fail("route geometry", "ít hơn 2 điểm")
    except requests.RequestException as e:
        res.fail("route", str(e))

    # ------------------------------------------------------------------
    # 4. Forecast all stations (mode AI — tô màu trạm)
    # ------------------------------------------------------------------
    print("\n④ GET /api/forecast/stations?horizon=24&source=mongo")
    forecasts_list: list = []
    try:
        code, body = get_json(base, "/api/forecast/stations?horizon=24&source=mongo", timeout=120)
        if code != 200:
            res.fail("forecast/stations", f"HTTP {code}")
        elif not isinstance(body, dict):
            res.fail("forecast/stations", "body không phải object")
        else:
            forecasts_list = body.get("forecasts") or []
            res.ok("forecast/stations", f"{len(forecasts_list)} forecasts")
            ready = [f for f in forecasts_list if f.get("forecast_ready")]
            ids = [f.get("frontend_station_id") for f in forecasts_list]
            res.ok(
                "forecast/stations fields",
                f"ready={len(ready)}, ids={ids}",
            )
            if not any(f.get("frontend_station_id") is not None for f in forecasts_list):
                res.fail(
                    "frontend_station_id",
                    "thiếu — applyForecastStationColors sẽ không tô màu",
                )
    except requests.RequestException as e:
        res.fail("forecast/stations", str(e))

    # ------------------------------------------------------------------
    # 5. Forecast theo điểm trên route (midpoint)
    # ------------------------------------------------------------------
    print("\n⑤ GET /api/forecast (neo midpoint route)")
    if route_feature:
        coords = (route_feature.get("geometry") or {}).get("coordinates") or []
        mid = coords[len(coords) // 2] if coords else end_coords
        lng, lat = mid[0], mid[1]
        try:
            path = (
                f"/api/forecast?latitude={lat}&longitude={lng}"
                f"&horizons=24&source=mongo"
            )
            code, body = get_json(base, path, timeout=120)
            if code != 200:
                res.fail("forecast by location", f"HTTP {code}")
            elif not isinstance(body, dict):
                res.fail("forecast by location", "body invalid")
            else:
                model = body.get("model")
                ready = body.get("forecast_ready")
                risk = body.get("risk_level") or body.get("risk_code")
                station = body.get("station")
                res.ok(
                    "forecast by location",
                    f"model={model} ready={ready} risk={risk} station={station}",
                )
                if body.get("model_status") == "unavailable":
                    res.fail("forecast model_status", body.get("reason", "unavailable"))
        except requests.RequestException as e:
            res.fail("forecast by location", str(e))
    else:
        res.fail("forecast by location", "bỏ qua — không có route")

    # ------------------------------------------------------------------
    # 6. Route vòng (avoid dummy CRITICAL polygon gần điểm đến)
    # ------------------------------------------------------------------
    print("\n⑥ POST /api/navigation/route (avoid_polygons)")
    # Buffer giả ~300m quanh end (MultiPolygon) để API không 500
    elng, elat = end_coords[0], end_coords[1]
    delta = 0.003  # ~300m
    ring = [
        [elng - delta, elat - delta],
        [elng + delta, elat - delta],
        [elng + delta, elat + delta],
        [elng - delta, elat + delta],
        [elng - delta, elat - delta],
    ]
    try:
        code, body = post_json(
            base,
            "/api/navigation/route",
            {
                "start": start_coords,
                "end": end_coords,
                "avoid_polygons": {
                    "type": "MultiPolygon",
                    "coordinates": [[ring]],
                },
            },
            timeout=90,
        )
        if code != 200:
            # Một số backend trả 4xx nếu avoid không hỗ trợ — ghi nhận, không hard-fail suite
            res.fail("route avoid", f"HTTP {code} (có thể ORS/key hạn chế)")
        else:
            alt = extract_route_feature(body)
            if alt:
                n = len((alt.get("geometry") or {}).get("coordinates") or [])
                res.ok("route avoid", f"alt route {n} points")
            else:
                res.fail("route avoid", "không có feature")
    except requests.RequestException as e:
        res.fail("route avoid", str(e))

    # ------------------------------------------------------------------
    # 7. Gợi ý kiểm tra UI (manual checklist)
    # ------------------------------------------------------------------
    print("\n⑦ Checklist UI (thủ công trên trình duyệt)")
    print("   [ ] Mở layer Navigation")
    print("   [ ] Nhập điểm đi/đến → suggestions hiện")
    print("   [ ] Bấm route → đường vẽ trên map, panel km/phút")
    print("   [ ] Mode 'Tình trạng hiện tại' → marker màu theo code live")
    print("   [ ] Mode 'Dự báo AI (24h)' → gọi forecast/stations + đổi màu")
    print("   [ ] Nếu có CRITICAL gần route → đường xanh lá (avoid)")

    return res.summary()


if __name__ == "__main__":
    sys.exit(main())
