import os
import csv
import pathlib

# Directory where CSV files are stored (both deep in project)
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV_DIRS = [
    PROJECT_ROOT / "backend" / "models_hourly",
    PROJECT_ROOT / "backend" / "model_daily",
    PROJECT_ROOT / "data",
]

# Destination folder for the generated .txt summaries
OUT_DIR = PROJECT_ROOT / "csv_summaries"
OUT_DIR.mkdir(exist_ok=True)

# Helper to write a single summary file
def write_summary(csv_path: pathlib.Path):
    try:
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = [next(reader) for _ in range(5)]  # up to 5 sample rows
    except StopIteration:
        # File has fewer than 5 data rows – keep whatever we have
        rows = []
    except Exception as e:
        print(f"[WARN] Could not read {csv_path}: {e}")
        return

    summary_path = OUT_DIR / f"{csv_path.stem}_summary.txt"
    with summary_path.open("w", encoding="utf-8") as out:
        out.write(f"CSV file: {csv_path}\n")
        out.write("Features (columns):\n")
        out.write(", ".join(header) + "\n\n")
        out.write("First up to 5 data rows (sample):\n")
        for i, row in enumerate(rows, start=1):
            out.write(f"{i}. " + ", ".join(row) + "\n")
        if not rows:
            out.write("[No data rows]\n")
    print(f"[INFO] Summary written to {summary_path}")

if __name__ == "__main__":
    for base in CSV_DIRS:
        if not base.is_dir():
            continue
        for csv_file in base.rglob("*.csv"):
            write_summary(csv_file)

