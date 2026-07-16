"""Route uploaded files to the correct parser based on extension."""
from pathlib import Path
from typing import List, Dict, Any


def parse_file(file_path: str, filename: str) -> List[Dict[str, Any]]:
    """
    Parse any supported file type.
    Returns list of: {text, metadata, page}
    """
    ext = Path(filename).suffix.lower().lstrip(".")
    content = Path(file_path).read_bytes()

    if ext == "pdf":
        from backend.parsers.pdf_parser import parse as parse_pdf
        return parse_pdf(content, filename)

    elif ext in ("xls", "xlsx", "csv"):
        from backend.parsers.excel_parser import parse as parse_excel
        return parse_excel(content, filename, ext)

    elif ext in ("doc", "docx"):
        from backend.parsers.word_parser import parse as parse_word
        return parse_word(content, filename)

    elif ext in ("html", "htm"):
        from backend.parsers.html_parser import parse as parse_html
        return parse_html(content, filename)

    elif ext in ("md", "markdown"):
        from backend.parsers.markdown_parser import parse as parse_md
        return parse_md(content, filename)

    elif ext in ("json",):
        # Route OpenAPI/Swagger JSON specs to the dedicated parser
        from backend.parsers.openapi_parser import is_openapi, parse as parse_openapi
        if is_openapi(content):
            return parse_openapi(content, filename)
        from backend.parsers.json_parser import parse as parse_json
        return parse_json(content, filename)

    elif ext in ("yaml", "yml"):
        from backend.parsers.openapi_parser import is_openapi, parse as parse_openapi
        from backend.parsers.swagger_parser import parse as parse_swagger
        # Route structured OpenAPI specs to the richer parser; plain YAML to swagger_parser
        if is_openapi(content):
            return parse_openapi(content, filename)
        return parse_swagger(content, filename)

    elif ext in ("ts", "js", "py", "java"):
        from backend.parsers.code_parser import parse as parse_code
        return parse_code(content, filename, ext)

    elif ext in ("txt", "xml"):
        text = content.decode("utf-8", errors="replace")
        return [{"text": text, "metadata": {"filename": filename, "source": filename}, "page": 1}]

    else:
        # Fallback: try to read as text
        try:
            text = content.decode("utf-8", errors="replace")
            return [{"text": text, "metadata": {"filename": filename, "source": filename}, "page": 1}]
        except Exception:
            raise ValueError(f"Unsupported file type: {ext}")


SUPPORTED_EXTENSIONS = {
    "pdf", "xls", "xlsx", "csv", "doc", "docx",
    "html", "htm", "md", "markdown", "json",
    "yaml", "yml", "ts", "js", "py", "java",
    "txt", "xml",
}
