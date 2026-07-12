import yaml
import json
from typing import List, Dict, Any


def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    text = content.decode("utf-8", errors="replace")
    try:
        data = yaml.safe_load(text)
    except Exception:
        try:
            data = json.loads(text)
        except Exception:
            return [{"text": text, "metadata": {"filename": filename}, "page": 1}]

    if not isinstance(data, dict):
        return [{"text": text, "metadata": {"filename": filename}, "page": 1}]

    pages = []
    info = data.get("info", {})
    api_title = info.get("title", filename)
    api_version = info.get("version", "")
    base_desc = f"API: {api_title} v{api_version}\n{info.get('description', '')}"

    paths = data.get("paths", {})
    for i, (path, methods) in enumerate(paths.items()):
        if not isinstance(methods, dict):
            continue
        for method, spec in methods.items():
            if method.startswith("x-") or not isinstance(spec, dict):
                continue
            summary = spec.get("summary", "")
            description = spec.get("description", "")
            tags = ", ".join(spec.get("tags", []))
            params = []
            for p in spec.get("parameters", []):
                if isinstance(p, dict):
                    params.append(f"  - {p.get('name')} ({p.get('in')}): {p.get('description', '')}")
            responses = list(spec.get("responses", {}).keys())

            text_block = (
                f"Endpoint: {method.upper()} {path}\n"
                f"Summary: {summary}\n"
                f"Description: {description}\n"
                f"Tags: {tags}\n"
                f"Parameters:\n" + ("\n".join(params) if params else "  None") + "\n"
                f"Response Codes: {', '.join(str(r) for r in responses)}"
            )
            pages.append({
                "text": text_block,
                "metadata": {
                    "filename": filename,
                    "source": filename,
                    "api_title": api_title,
                    "endpoint": f"{method.upper()} {path}",
                    "document_type": "api_docs",
                    "page": i + 1,
                },
                "page": i + 1,
            })

    if not pages:
        pages = [{"text": base_desc, "metadata": {"filename": filename, "document_type": "api_docs"}, "page": 1}]

    return pages
