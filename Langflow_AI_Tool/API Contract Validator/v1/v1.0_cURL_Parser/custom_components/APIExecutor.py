import json
import time
import requests
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema import Data


class APIExecutor(Component):
    display_name = "API Executor"
    description = "Executes parsed API requests from LLM JSON output and returns raw responses."
    icon = "play"

    inputs = [
        MessageTextInput(
            name="parsed_json",
            display_name="Parsed JSON",
            info="JSON array of API requests from the LLM Parser.",
        )
    ]

    outputs = [
        Output(display_name="Results", name="results", method="execute")
    ]

    def execute(self) -> Data:
        raw = self.parsed_json.strip()

        # Strip markdown code fences if LLM wrapped the JSON
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

        try:
            requests_list = json.loads(raw)
        except Exception as e:
            return Data(data={"error": f"JSON parse error: {e}", "results": []})

        if not isinstance(requests_list, list):
            requests_list = [requests_list]

        session = requests.Session()
        results = []

        for req in requests_list:
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

                results.append({
                    "method": method,
                    "url": url,
                    "status_code": resp.status_code,
                    "duration_ms": duration,
                    "response_headers": dict(resp.headers),
                    "response": resp_body,
                    "error": None,
                })

            except requests.exceptions.Timeout:
                results.append({"method": method, "url": url, "status_code": None,
                                 "duration_ms": 30000, "response": None, "error": "TIMEOUT"})
            except requests.exceptions.ConnectionError as e:
                results.append({"method": method, "url": url, "status_code": None,
                                 "duration_ms": 0, "response": None, "error": f"CONNECTION_ERROR: {e}"})
            except Exception as e:
                results.append({"method": method, "url": url, "status_code": None,
                                 "duration_ms": 0, "response": None, "error": str(e)})

        session.close()
        return Data(data={"results": results, "total": len(results)})
