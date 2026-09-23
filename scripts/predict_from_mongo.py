import argparse
import json
from pathlib import Path
from datetime import datetime

from backend.app.services.mongo_hourly_pipeline import predict_from_mongo

def main() -> None:
    parser = argparse.ArgumentParser(description="Run hourly Cuchi prediction using the simulated MongoDB dump and save the result.")
    parser.add_argument(
        "--horizons",
        type=str,
        default=None,
        help="Comma‑separated list of forecast horizons in hours (e.g. '1,3,6'). If omitted, all model horizons are used.",
    )
    parser.add_argument(
        "--at",
        type=str,
        default=None,
        help="Timestamp (ISO format) to select a specific feature row. Defaults to the latest row.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Number of newest MongoDB documents to read (mirrors the original publisher limit).",
    )
    args = parser.parse_args()

    horizons = None
    if args.horizons:
        horizons = [int(h) for h in args.horizons.split(",") if h]

    result = predict_from_mongo(horizons=horizons, at=args.at, limit=args.limit)

    # Ensure the predict folder exists
    predict_dir = Path(__file__).resolve().parents[2] / "predict"
    predict_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = predict_dir / f"prediction_{timestamp}.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"[INFO] Prediction saved to {out_path.resolve()}")

if __name__ == "__main__":
    main()

