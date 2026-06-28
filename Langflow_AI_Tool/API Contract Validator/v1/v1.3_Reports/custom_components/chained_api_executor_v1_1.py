import re
import json
import time
import requests
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class ChainedAPIExecutor(Component):
    display_name = "Chained API Executor v1.1"
    description = "Executes APIs sequentially, auto-extracts variables (token, bookingid) and resolves {{placeholders}} in subsequent requests."
    icon = "play"

    inputs = [
        MessageTextInput(
            name="parsed_json",
            display_name="Parsed JSON",
            info="JSON array of API requests from LLM Parser.",
        ),
        MessageTextInput(
            name="seed_variables",
            display_name="Seed Variables (optional)",
            info='e.g. {"env": "qa"}',
            value="{}",
        ),
    ]

    outputs = [
        Output(display_name="Results", name="results", method="execute")
    ]

    EXTRACT_KEYS = ["token", "access_token", "bookingid", "id",
                    "userId", "user_id", "sessionId", "orderId"]

    def execute(self) -> Message:
        raw = self.parsed_json.strip()

        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            requests_list = json.loads(raw)
        except Exception as e:
            return Message(text=json.dumps({"error": f"JSON parse error: {e}", "results": [], "variables_extracted": {}}))

        if not isinstance(requests_list, list):
            requests_list = [requests_list]

        try:
            store = json.loads(self.seed_variables or "{}")
        except Exception:
            store = {}

        session = requests.Session()
        results = []

        for req in requests_list:
            req = self._resolve(req, store)

            method  = req.get("method", "GET").upper()
            url     = req.get("url", "")
            headers = req.get("headers") or {}
            body    = req.get("body")
            cookies = req.get("cookies") or {}

            start = time.time()
            try:
                resp = session.request(
                    method, url,
                    headers=headers,
                    json=body if isinstance(body, dict) else None,
                    data=body if isinstance(body, str) else None,
                    cookies=cookies,
                    timeout=30,
                )
                duration = round((time.time() - start) * 1000, 2)

                try:
                    resp_body = resp.json()
                except Exception:
                    resp_body = resp.text

                result = {
                    "method": method,
                    "url": url,
                    "status_code": resp.status_code,
                    "duration_ms": duration,
                    "response": resp_body,
                    "resolved_with": dict(store),
                    "error": None,
                }

                if isinstance(resp_body, dict):
                    for key in self.EXTRACT_KEYS:
                        if key in resp_body:
                            store[key] = resp_body[key]

            except requests.exceptions.Timeout:
                result = {"method": method, "url": url, "status_code": None,
                          "duration_ms": 30000, "response": None,
                          "resolved_with": dict(store), "error": "TIMEOUT"}
            except Exception as e:
                result = {"method": method, "url": url, "status_code": None,
                          "duration_ms": 0, "response": None,
                          "resolved_with": dict(store), "error": str(e)}

            results.append(result)

        session.close()

        return Message(text=json.dumps({
            "results": results,
            "total": len(results),
            "variables_extracted": store,
        }))

    def _resolve(self, obj: dict, store: dict) -> dict:
        text = json.dumps(obj)
        resolved = re.sub(
            r"\{\{(\w+)\}\}",
            lambda m: str(store.get(m.group(1), m.group(0))),
            text
        )
        try:
            return json.loads(resolved)
        except Exception:
            return obj
