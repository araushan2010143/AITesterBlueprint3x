import json
import re
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class OpenAPIPostmanParser(Component):
    display_name = "OpenAPI / Postman Parser v2.0"
    description = "Parses OpenAPI 3.0 / Swagger 2.0 JSON or Postman Collection v2.1 into executable requests."
    icon = "file-json"

    inputs = [
        MessageTextInput(
            name="spec_input",
            display_name="OpenAPI Spec or Postman Collection (JSON)",
            info="Paste OpenAPI JSON or Postman Collection JSON",
        ),
        MessageTextInput(
            name="base_url_override",
            display_name="Base URL Override (optional)",
            value="",
            info="Override the server URL from the spec e.g. https://staging.api.com",
        ),
    ]

    outputs = [
        Output(display_name="Requests JSON", name="requests", method="parse"),
    ]

    def parse(self) -> Message:
        raw = self.spec_input
        if hasattr(raw, "text"):
            raw = raw.text
        raw = str(raw).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            spec = json.loads(raw)
        except Exception as e:
            return Message(text=json.dumps({"error": f"Invalid JSON: {e}", "results": [], "total": 0, "variables_extracted": {}}))

        base_url = (self.base_url_override or "").strip().rstrip("/")

        if "item" in spec:
            requests = self._parse_postman(spec, base_url)
        elif str(spec.get("openapi", "")).startswith("3"):
            requests = self._parse_openapi3(spec, base_url)
        elif str(spec.get("swagger", "")) == "2.0":
            requests = self._parse_swagger2(spec, base_url)
        else:
            return Message(text=json.dumps({"error": "Unknown format. Expected OpenAPI 3.x, Swagger 2.0, or Postman v2.1", "results": [], "total": 0, "variables_extracted": {}}))

        return Message(text=json.dumps(requests, indent=2))

    # ── OpenAPI 3.0 ──────────────────────────────────────────────────
    def _parse_openapi3(self, spec, base_url_override):
        if not base_url_override:
            servers = spec.get("servers", [])
            base_url = servers[0].get("url", "").rstrip("/") if servers else ""
        else:
            base_url = base_url_override

        requests = []
        for path, path_item in spec.get("paths", {}).items():
            for method in ["get", "post", "put", "patch", "delete"]:
                op = path_item.get(method)
                if not op:
                    continue
                url = base_url + self._convert_path_params(path)
                headers = {"Content-Type": "application/json"}
                body = self._extract_openapi3_body(op)
                requests.append({"method": method.upper(), "url": url,
                                  "headers": headers, "body": body, "cookies": {}})
        return requests

    def _extract_openapi3_body(self, op):
        content = op.get("requestBody", {}).get("content", {})
        json_c = content.get("application/json", {})
        example = json_c.get("example") or json_c.get("schema", {}).get("example")
        if example:
            return example
        schema = json_c.get("schema", {})
        if schema.get("properties"):
            return self._example_from_schema(schema)
        return None

    # ── Swagger 2.0 ──────────────────────────────────────────────────
    def _parse_swagger2(self, spec, base_url_override):
        if not base_url_override:
            host      = spec.get("host", "")
            scheme    = (spec.get("schemes", ["https"]) or ["https"])[0]
            base_path = spec.get("basePath", "").rstrip("/")
            base_url  = f"{scheme}://{host}{base_path}"
        else:
            base_url = base_url_override

        requests = []
        for path, path_item in spec.get("paths", {}).items():
            for method in ["get", "post", "put", "patch", "delete"]:
                op = path_item.get(method)
                if not op:
                    continue
                url  = base_url + self._convert_path_params(path)
                body = None
                for param in op.get("parameters", []):
                    if param.get("in") == "body":
                        s = param.get("schema", {})
                        body = s.get("example") or (self._example_from_schema(s) if s.get("properties") else None)
                requests.append({"method": method.upper(), "url": url,
                                  "headers": {"Content-Type": "application/json"}, "body": body, "cookies": {}})
        return requests

    # ── Postman v2.1 ─────────────────────────────────────────────────
    def _parse_postman(self, collection, base_url_override):
        requests = []
        self._walk_postman(collection.get("item", []), requests, base_url_override)
        return requests

    def _walk_postman(self, items, requests, base_url_override):
        for item in items:
            if "item" in item:
                self._walk_postman(item["item"], requests, base_url_override)
                continue
            req    = item.get("request", {})
            method = req.get("method", "GET").upper()
            url    = self._postman_url(req.get("url", ""), base_url_override)
            headers = {h["key"]: h["value"] for h in req.get("header", []) if not h.get("disabled")}
            body    = self._postman_body(req.get("body", {}))
            requests.append({"method": method, "url": url, "headers": headers,
                              "body": body, "cookies": {}})

    def _postman_url(self, url_data, base_url_override):
        raw = url_data.get("raw", "") if isinstance(url_data, dict) else str(url_data)
        if base_url_override:
            raw = re.sub(r'https?://[^/]+', base_url_override, raw)
        return raw

    def _postman_body(self, body_data):
        if not body_data:
            return None
        mode = body_data.get("mode", "")
        if mode == "raw":
            try:
                return json.loads(body_data.get("raw", ""))
            except Exception:
                return body_data.get("raw")
        if mode == "urlencoded":
            return {i["key"]: i["value"] for i in body_data.get("urlencoded", []) if not i.get("disabled")}
        return None

    # ── helpers ───────────────────────────────────────────────────────
    def _convert_path_params(self, path):
        return re.sub(r"\{(\w+)\}", r"{{\1}}", path)

    def _example_from_schema(self, schema):
        example = {}
        type_map = {"string": "example", "integer": 0, "number": 0.0,
                    "boolean": True, "array": [], "object": {}}
        for field, fs in schema.get("properties", {}).items():
            t = fs.get("type", "string")
            example[field] = fs.get("example", type_map.get(t, "example"))
        return example
