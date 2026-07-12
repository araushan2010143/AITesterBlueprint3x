import io
import pandas as pd
from typing import List, Dict, Any


# Known QA column sets
TEST_CASE_COLS = {"id", "title", "steps", "expected", "priority", "status", "module", "feature"}
REQUIREMENT_COLS = {"req id", "requirement", "description", "priority", "status"}
DEFECT_COLS = {"bug id", "summary", "severity", "status", "assignee"}


def _detect_type(columns: List[str]) -> str:
    cols_lower = {c.lower().strip() for c in columns}
    if cols_lower & TEST_CASE_COLS:
        return "test_cases"
    if cols_lower & REQUIREMENT_COLS:
        return "requirements"
    if cols_lower & DEFECT_COLS:
        return "defects"
    return "general"


def parse(content: bytes, filename: str, ext: str) -> List[Dict[str, Any]]:
    buf = io.BytesIO(content)

    if ext == "csv":
        df_map = {"Sheet1": pd.read_csv(buf, dtype=str)}
    else:
        xlsx = pd.ExcelFile(buf, engine="openpyxl" if ext == "xlsx" else "xlrd")
        df_map = {sheet: xlsx.parse(sheet, dtype=str) for sheet in xlsx.sheet_names}

    pages = []
    for sheet_name, df in df_map.items():
        df = df.fillna("").astype(str)
        doc_type = _detect_type(list(df.columns))
        rows_text = []

        # Convert each row to readable key: value text
        for _, row in df.iterrows():
            row_str = " | ".join(f"{col}: {val}" for col, val in row.items() if val.strip())
            if row_str:
                rows_text.append(row_str)

        # Group into batches of 50 rows per "page"
        batch_size = 50
        for i in range(0, len(rows_text), batch_size):
            batch = rows_text[i : i + batch_size]
            page_num = (i // batch_size) + 1
            pages.append({
                "text": "\n".join(batch),
                "metadata": {
                    "filename": filename,
                    "source": filename,
                    "sheet": sheet_name,
                    "document_type": doc_type,
                    "row_start": i + 1,
                    "row_end": i + len(batch),
                    "columns": ", ".join(df.columns.tolist()),
                    "page": page_num,
                },
                "page": page_num,
            })

    return pages
