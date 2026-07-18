"""CSV parser — one row = one chunk."""
from __future__ import annotations
import os


def parse_csv(path: str) -> list[tuple[str, dict]]:
    import pandas as pd
    filename = os.path.basename(path)
    df = pd.read_csv(path, dtype=str).fillna("")
    results = []
    for i, row in df.iterrows():
        text = "\n".join(f"{k}: {v}" for k, v in row.to_dict().items() if v.strip())
        metadata = {"source": "csv", "filename": filename, "path": path, "row_index": i}
        results.append((text, metadata))
    return results
