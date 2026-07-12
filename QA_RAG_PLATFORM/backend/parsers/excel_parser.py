import io
import pandas as pd
from typing import List, Dict, Any, Optional


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


def _find_col(df_cols: List[str], candidates: List[str]) -> Optional[str]:
    """Return first df column that matches any candidate name (case-insensitive)."""
    lower_map = {c.lower().strip(): c for c in df_cols}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


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
        col_names = list(df.columns)
        doc_type = _detect_type(col_names)

        # Detect key columns for filter value extraction
        module_col    = _find_col(col_names, ["module"])
        feature_col   = _find_col(col_names, ["feature"])
        priority_col  = _find_col(col_names, ["priority", "test priority"])
        author_col    = _find_col(col_names, ["author", "created by", "owner"])
        release_col   = _find_col(col_names, ["release", "version", "sprint"])
        auto_col      = _find_col(col_names, ["automation status", "automation", "automated"])

        # Collect unique values across ALL rows (for filter dropdowns)
        def unique_vals(col):
            if not col:
                return []
            return sorted({v.strip() for v in df[col].tolist() if v.strip()})

        catalog = {
            "modules":    unique_vals(module_col),
            "features":   unique_vals(feature_col),
            "priorities": unique_vals(priority_col),
            "authors":    unique_vals(author_col),
            "releases":   unique_vals(release_col),
            "automation_statuses": unique_vals(auto_col),
        }

        rows_text = []
        for _, row in df.iterrows():
            row_str = " | ".join(f"{col}: {val}" for col, val in row.items() if val.strip())
            if row_str:
                rows_text.append(row_str)

        batch_size = 50
        for i in range(0, len(rows_text), batch_size):
            batch = rows_text[i : i + batch_size]
            page_num = (i // batch_size) + 1
            meta = {
                "filename": filename,
                "source": filename,
                "sheet": sheet_name,
                "document_type": doc_type,
                "row_start": i + 1,
                "row_end": i + len(batch),
                "columns": ", ".join(col_names),
                "page": page_num,
            }
            # Attach catalog only to first page so ingest can pick it up
            if i == 0:
                meta["_catalog"] = catalog
            pages.append({"text": "\n".join(batch), "metadata": meta, "page": page_num})

    return pages
