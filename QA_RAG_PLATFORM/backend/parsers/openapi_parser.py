"""
OpenAPI 3.x / Swagger 2.0 parser.

Enhancements over swagger_parser.py:
  - Request / response body schema extraction with one-level $ref resolution
  - Component/definition schema catalogue page
  - Security scheme descriptions per endpoint
  - Optional Neo4j APIEndpoint node population
  - is_openapi() heuristic for dispatcher routing of JSON files

Returns per-endpoint page dicts compatible with the standard chunker pipeline.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)


# ── $ref resolution ───────────────────────────────────────────────────────────

def _resolve_ref(ref: str, root: Dict) -> Dict:
    """Resolve a $ref pointer one level deep (e.g. '#/components/schemas/Foo')."""
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return {}
    node: Any = root
    for part in ref.lstrip("#/").split("/"):
        if not isinstance(node, dict):
            return {}
        node = node.get(part, {})
    return node if isinstance(node, dict) else {}


# ── Schema summarisation ──────────────────────────────────────────────────────

def _schema_summary(schema: Any, root: Dict, depth: int = 0) -> str:
    """Convert a JSON Schema dict to a compact human-readable string."""
    if depth > 3 or not isinstance(schema, dict):
        return ""

    if "$ref" in schema:
        resolved = _resolve_ref(schema["$ref"], root)
        ref_name = schema["$ref"].split("/")[-1]
        inner = _schema_summary(resolved, root, depth + 1)
        return f"{ref_name}({inner})" if inner else ref_name

    typ = schema.get("type", "object")

    if typ == "array":
        return f"array[{_schema_summary(schema.get('items', {}), root, depth + 1)}]"

    props: Dict = schema.get("properties", {})
    if props:
        required = set(schema.get("required", []))
        parts = []
        for name, prop in list(props.items())[:8]:
            r = "*" if name in required else ""
            if "$ref" in prop:
                ptype = prop["$ref"].split("/")[-1]
            else:
                ptype = prop.get("type", "?")
            parts.append(f"{name}{r}:{ptype}")
        tail = ", ..." if len(props) > 8 else ""
        return "{" + ", ".join(parts) + tail + "}"

    return typ


# ── Request / response helpers ────────────────────────────────────────────────

def _request_body_summary(spec: Dict, root: Dict) -> str:
    rb = spec.get("requestBody", {})
    if not rb:
        return ""
    content = rb.get("content", {})
    for mt in ("application/json", "multipart/form-data", "application/x-www-form-urlencoded"):
        schema = content.get(mt, {}).get("schema", {})
        if schema:
            return _schema_summary(schema, root)
    return ""


def _response_summary(spec: Dict, root: Dict) -> str:
    responses = spec.get("responses", {})
    for code in ("200", "201", "204"):
        resp = responses.get(code, {})
        content = resp.get("content", {})
        schema = content.get("application/json", {}).get("schema", {})
        if schema:
            return f"{code}: {_schema_summary(schema, root)}"
        if resp:
            return f"{code}: {resp.get('description', '')}"
    if responses:
        first = next(iter(responses))
        return f"{first}: {responses[first].get('description', '')}"
    return ""


def _security_str(spec: Dict, global_sec: List, schemes: Dict) -> str:
    sec_list = spec.get("security", global_sec)
    if not sec_list:
        return "none"
    parts = []
    for sec_item in sec_list:
        for name in sec_item:
            stype = schemes.get(name, {}).get("type", name)
            parts.append(f"{name}({stype})")
    return ", ".join(parts) or "none"


# ── Main parse ────────────────────────────────────────────────────────────────

def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parse an OpenAPI 3.x or Swagger 2.0 spec into per-endpoint page dicts."""
    text = content.decode("utf-8", errors="replace")

    root: Dict = {}
    try:
        root = yaml.safe_load(text) or {}
    except Exception:
        pass
    if not isinstance(root, dict) or not root:
        try:
            root = json.loads(text)
        except Exception:
            return [{
                "text": text,
                "metadata": {"filename": filename, "document_type": "api_docs"},
                "page": 1,
            }]

    spec_ver = str(root.get("openapi", root.get("swagger", "")))
    is_v3 = spec_ver.startswith("3")

    info = root.get("info", {})
    api_title   = info.get("title", filename)
    api_version = info.get("version", "")
    api_desc    = info.get("description", "")

    # Base URL
    if is_v3:
        servers = root.get("servers", [])
        base_url = servers[0].get("url", "") if servers else ""
    else:
        host      = root.get("host", "")
        base_path = root.get("basePath", "")
        base_url  = f"{host}{base_path}" if host else base_path

    # Security schemes
    if is_v3:
        schemes = root.get("components", {}).get("securitySchemes", {})
    else:
        schemes = root.get("securityDefinitions", {})

    global_security = root.get("security", [])

    pages: List[Dict[str, Any]] = []

    # ── Per-endpoint pages ────────────────────────────────────────────────────
    paths = root.get("paths", {})
    for page_idx, (path, methods) in enumerate(paths.items()):
        if not isinstance(methods, dict):
            continue
        for method, spec in methods.items():
            if method.lower() in ("parameters", "summary", "description") or method.startswith("x-"):
                continue
            if not isinstance(spec, dict):
                continue

            summary    = spec.get("summary", "")
            desc       = spec.get("description", "")
            tags       = ", ".join(spec.get("tags", []))
            op_id      = spec.get("operationId", "")
            deprecated = spec.get("deprecated", False)

            # Parameters
            param_lines = []
            for p in spec.get("parameters", []):
                if not isinstance(p, dict):
                    continue
                if "$ref" in p:
                    p = _resolve_ref(p["$ref"], root)
                param_lines.append(
                    f"  - {p.get('name', '?')} "
                    f"(in={p.get('in', '?')}, "
                    f"{'required' if p.get('required') else 'optional'}): "
                    f"{p.get('description', '')}"
                )

            req_body_str  = _request_body_summary(spec, root) if is_v3 else ""
            resp_str      = _response_summary(spec, root)
            sec_str       = _security_str(spec, global_security, schemes)

            lines = [
                f"API: {api_title} v{api_version}",
                f"Base URL: {base_url}",
                f"Endpoint: {method.upper()} {path}",
                f"Operation ID: {op_id}",
                f"Summary: {summary}",
                f"Description: {desc}",
                f"Tags: {tags}",
                f"Deprecated: {deprecated}",
                f"Security: {sec_str}",
                "Parameters:",
                ("\n".join(param_lines) if param_lines else "  None"),
            ]
            if req_body_str:
                lines.append(f"Request Body Schema: {req_body_str}")
            if resp_str:
                lines.append(f"Response Schema: {resp_str}")

            pages.append({
                "text": "\n".join(lines),
                "metadata": {
                    "filename":     filename,
                    "source":       filename,
                    "api_title":    api_title,
                    "api_version":  api_version,
                    "endpoint":     f"{method.upper()} {path}",
                    "http_method":  method.upper(),
                    "path":         path,
                    "operation_id": op_id,
                    "tags":         tags,
                    "security":     sec_str,
                    "deprecated":   str(deprecated),
                    "document_type": "api_docs",
                    "page":         page_idx + 1,
                },
                "page": page_idx + 1,
            })

    # ── Schemas/definitions catalogue page ────────────────────────────────────
    if is_v3:
        component_schemas = root.get("components", {}).get("schemas", {})
    else:
        component_schemas = root.get("definitions", {})

    if component_schemas:
        schema_lines = [f"API: {api_title} — Data Model Catalogue\n"]
        for schema_name, schema_def in list(component_schemas.items())[:60]:
            summary_str = _schema_summary(schema_def, root)
            sdesc = schema_def.get("description", "") if isinstance(schema_def, dict) else ""
            schema_lines.append(f"Schema: {schema_name}\n  Structure: {summary_str}\n  Description: {sdesc}")
        pages.append({
            "text": "\n".join(schema_lines),
            "metadata": {
                "filename":      filename,
                "source":        filename,
                "api_title":     api_title,
                "document_type": "api_docs",
                "section":       "schemas",
                "page":          len(pages) + 1,
            },
            "page": len(pages) + 1,
        })

    if not pages:
        pages = [{
            "text": f"API: {api_title} v{api_version}\n{api_desc}",
            "metadata": {"filename": filename, "document_type": "api_docs"},
            "page": 1,
        }]

    return pages


# ── Graph population ──────────────────────────────────────────────────────────

def populate_graph(content: bytes, filename: str, team_id: str = "") -> int:
    """
    Upsert APIEndpoint nodes into Neo4j for every path/method in the spec.
    Returns the number of endpoints upserted (0 when Neo4j is disabled).
    """
    try:
        from backend.graph.neo4j_client import is_enabled
        if not is_enabled():
            return 0
        from backend.graph.graph_builder import GraphBuilder
        builder = GraphBuilder(team_id=team_id)
    except Exception as exc:
        logger.warning("OpenAPI graph population skipped: %s", exc)
        return 0

    text = content.decode("utf-8", errors="replace")
    root: Dict = {}
    try:
        root = yaml.safe_load(text) or {}
    except Exception:
        pass
    if not isinstance(root, dict) or not root:
        try:
            root = json.loads(text)
        except Exception:
            return 0

    info = root.get("info", {})
    api_title = info.get("title", filename)

    count = 0
    for path, methods in (root.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, spec in methods.items():
            if method.lower() in ("parameters", "summary", "description") or method.startswith("x-"):
                continue
            if not isinstance(spec, dict):
                continue
            try:
                builder.upsert_api_endpoint({
                    "id":           f"{method.upper()}:{path}",
                    "method":       method.upper(),
                    "path":         path,
                    "operation_id": spec.get("operationId", ""),
                    "summary":      spec.get("summary", ""),
                    "tags":         ", ".join(spec.get("tags", [])),
                    "api_title":    api_title,
                    "filename":     filename,
                    "deprecated":   spec.get("deprecated", False),
                })
                count += 1
            except Exception as exc:
                logger.warning("Graph upsert failed for %s %s: %s", method, path, exc)

    return count


# ── Detection heuristic ───────────────────────────────────────────────────────

def is_openapi(content: bytes) -> bool:
    """Return True if the content looks like an OpenAPI/Swagger spec."""
    try:
        text = content.decode("utf-8", errors="replace")
        data: Any = None
        try:
            data = yaml.safe_load(text)
        except Exception:
            pass
        if not isinstance(data, dict):
            try:
                data = json.loads(text)
            except Exception:
                return False
        return isinstance(data, dict) and ("openapi" in data or "swagger" in data)
    except Exception:
        return False
