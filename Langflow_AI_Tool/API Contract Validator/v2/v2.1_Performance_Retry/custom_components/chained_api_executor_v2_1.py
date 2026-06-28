import re, json, time, requests
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class ChainedAPIExecutor(Component):
    display_name = "Chained API Executor v2.1"
    description = "Executes chained API requests with retry logic and exponential backoff."
    icon = "play"

    EXTRACT_KEYS = ["token","access_token","bookingid","id","userId","user_id","sessionId","orderId"]

    inputs = [
        MessageTextInput(name="parsed_json",     display_name="Parsed JSON"),
        MessageTextInput(name="seed_variables",  display_name="Seed Variables (optional)", value="{}"),
        MessageTextInput(name="max_retries",     display_name="Max Retries", value="2",
                         info="Retry attempts on failure (0 = no retry)"),
        MessageTextInput(name="retry_on",        display_name="Retry on Status Codes", value="500,502,503,504",
                         info="Comma-separated HTTP status codes that trigger a retry"),
        MessageTextInput(name="backoff_ms",      display_name="Initial Backoff (ms)", value="500",
                         info="Wait before first retry. Doubles each attempt: 500→1000→2000ms"),
    ]
    outputs = [Output(display_name="Results", name="results", method="execute")]

    def execute(self) -> Message:
        raw = self.parsed_json
        if hasattr(raw, "text"):
            raw = raw.text
        raw = str(raw).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            requests_list = json.loads(raw)
        except Exception as e:
            return Message(text=json.dumps({"error": str(e), "results": [], "variables_extracted": {}}))

        if not isinstance(requests_list, list):
            requests_list = [requests_list]

        try:    store = json.loads(self.seed_variables or "{}")
        except: store = {}
        try:    max_retries = int(self.max_retries or 2)
        except: max_retries = 2
        try:    retry_statuses = {int(s.strip()) for s in (self.retry_on or "500,502,503,504").split(",") if s.strip()}
        except: retry_statuses = {500, 502, 503, 504}
        try:    backoff_ms = int(self.backoff_ms or 500)
        except: backoff_ms = 500

        session = requests.Session()
        results = []

        for req in requests_list:
            req    = self._resolve(req, store)
            method = req.get("method", "GET").upper()
            url    = req.get("url", "")
            headers = req.get("headers") or {}
            body    = req.get("body")
            cookies = req.get("cookies") or {}

            result = self._with_retry(
                session, method, url, headers, body, cookies,
                max_retries, retry_statuses, backoff_ms
            )

            if isinstance(result.get("response"), dict):
                for key in self.EXTRACT_KEYS:
                    if key in result["response"]:
                        store[key] = result["response"][key]

            result["resolved_with"] = dict(store)
            results.append(result)

        session.close()
        return Message(text=json.dumps({
            "results": results,
            "total": len(results),
            "variables_extracted": store
        }))

    def _with_retry(self, session, method, url, headers, body, cookies, max_retries, retry_statuses, backoff_ms):
        last = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep((backoff_ms * (2 ** (attempt - 1))) / 1000)
            start = time.time()
            try:
                resp = session.request(
                    method, url, headers=headers,
                    json=body if isinstance(body, dict) else None,
                    data=body if isinstance(body, str) else None,
                    cookies=cookies, timeout=30
                )
                duration = round((time.time() - start) * 1000, 2)
                try:    resp_body = resp.json()
                except: resp_body = resp.text

                last = {"method": method, "url": url, "status_code": resp.status_code,
                        "duration_ms": duration, "response": resp_body,
                        "retries": attempt, "error": None}

                if resp.status_code in retry_statuses and attempt < max_retries:
                    continue
                return last

            except requests.exceptions.Timeout:
                last = {"method": method, "url": url, "status_code": None,
                        "duration_ms": 30000, "response": None,
                        "retries": attempt, "error": "TIMEOUT"}
            except Exception as e:
                last = {"method": method, "url": url, "status_code": None,
                        "duration_ms": 0, "response": None,
                        "retries": attempt, "error": str(e)}
        return last

    def _resolve(self, obj, store):
        text     = json.dumps(obj)
        resolved = re.sub(r"\{\{(\w+)\}\}", lambda m: str(store.get(m.group(1), m.group(0))), text)
        try:    return json.loads(resolved)
        except: return obj
