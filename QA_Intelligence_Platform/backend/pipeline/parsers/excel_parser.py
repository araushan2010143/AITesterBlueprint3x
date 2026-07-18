"""Excel parser — one row = one test case chunk."""
from __future__ import annotations
import os


def parse_excel_testcases(path: str, sheet_name: str = 0) -> list[tuple[str, dict]]:
    """
    Parse an Excel test case sheet.
    Returns list of (text, metadata) — one per row.
    Each row is one retrieval unit.
    """
    import pandas as pd

    filename = os.path.basename(path)
    df = pd.read_excel(path, sheet_name=sheet_name, dtype=str).fillna("")

    results = []
    for i, row in df.iterrows():
        row_dict = row.to_dict()
        text = "\n".join(f"{k}: {v}" for k, v in row_dict.items() if v.strip())
        metadata = {
            "source":           "excel",
            "filename":         filename,
            "path":             path,
            "row_index":        i,
            "testcase":         str(row_dict.get("Test Case ID", row_dict.get("TC_ID", ""))),
            "module":           str(row_dict.get("Module", "")),
            "feature":          str(row_dict.get("Feature", "")),
            "priority":         str(row_dict.get("Priority", "")),
            "automation_status": str(row_dict.get("Automation Status", "")),
        }
        results.append((text, metadata))
    return results
