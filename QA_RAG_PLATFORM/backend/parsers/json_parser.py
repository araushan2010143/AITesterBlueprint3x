import json
from typing import List, Dict, Any


def _flatten(obj: Any, prefix: str = "") -> List[str]:
    lines = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            lines.extend(_flatten(v, f"{prefix}.{k}" if prefix else k))
    elif isinstance(obj, list):
        for i, item in enumerate(obj[:100]):  # cap at 100 items per array
            lines.extend(_flatten(item, f"{prefix}[{i}]"))
    else:
        lines.append(f"{prefix}: {obj}")
    return lines


def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    try:
        data = json.loads(content.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return [{"text": content.decode("utf-8", errors="replace"),
                 "metadata": {"filename": filename}, "page": 1}]

    # Detect Postman collection
    if isinstance(data, dict) and "info" in data and "item" in data:
        return _parse_postman(data, filename)

    lines = _flatten(data)
    batch_size = 200
    pages = []
    for i in range(0, len(lines), batch_size):
        batch = "\n".join(lines[i : i + batch_size])
        pages.append({
            "text": batch,
            "metadata": {"filename": filename, "source": filename, "page": (i // batch_size) + 1},
            "page": (i // batch_size) + 1,
        })
    return pages or [{"text": "{}", "metadata": {"filename": filename}, "page": 1}]


def _parse_postman(data: dict, filename: str) -> List[Dict[str, Any]]:
    pages = []
    items = data.get("item", [])
    for i, item in enumerate(items):
        name = item.get("name", f"Request {i+1}")
        request = item.get("request", {})
        method = request.get("method", "GET") if isinstance(request, dict) else "GET"
        url = ""
        if isinstance(request, dict):
            url_obj = request.get("url", "")
            url = url_obj.get("raw", "") if isinstance(url_obj, dict) else str(url_obj)
        body = ""
        if isinstance(request, dict) and request.get("body"):
            body = str(request["body"].get("raw", ""))[:500]
        text = f"Name: {name}\nMethod: {method}\nURL: {url}\nBody: {body}"
        pages.append({
            "text": text,
            "metadata": {"filename": filename, "source": filename, "type": "postman", "page": i + 1},
            "page": i + 1,
        })
    return pages
