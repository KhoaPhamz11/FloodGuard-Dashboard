import json
from pathlib import Path
import pandas as pd


def _read_latest_documents_file() -> str:
    """Return the raw text content of the simulated MongoDB dump.

    The project stores the most recent MongoDB documents in the file
    ``latest_documents.txt`` at the repository root.  The file may contain
    either a JSON array (e.g. ``[ {...}, {...} ]``) or a newline‑separated
    series of JSON objects.  This helper reads the file and returns the
    raw string for parsing.
    """
    project_root = Path(__file__).resolve().parents[3]
    file_path = project_root / "latest_documents.txt"
    if not file_path.is_file():
        raise FileNotFoundError(f"MongoDB snapshot not found: {file_path}")
    return file_path.read_text(encoding="utf-8")


def _parse_latest_documents(raw: str) -> list[dict]:
    """Parse the raw text into a list of JSON objects.

    The function first tries to interpret the whole string as a JSON array.
    If that fails, it falls back to a line‑by‑line JSON decoding strategy.
    This makes the loader tolerant to either of the two common dump formats.
    """
    raw = raw.strip()
    if not raw:
        return []
    try:
        # Try a full JSON array first.
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: each line should be a JSON object.
        records = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
        return records


def load_latest_documents(limit: int = 50) -> pd.DataFrame:
    """Load the simulated MongoDB collection as a ``pandas.DataFrame``.

    Parameters
    ----------
    limit: int, optional
        Maximum number of newest documents to return.  The original script
        that writes ``latest_documents.txt`` uses a ``--limit`` argument, so we
        mirror that behaviour here.  If ``limit`` is ``None`` all documents are
        returned.
    """
    raw = _read_latest_documents_file()
    records = _parse_latest_documents(raw)
    if limit is not None:
        records = records[:limit]
    return pd.DataFrame(records)
