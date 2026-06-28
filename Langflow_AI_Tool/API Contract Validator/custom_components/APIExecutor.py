import time
import json
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from langflow.custom import Component
from langflow.io import MessageTextInput, DataInput, Output
from langflow.schema import Data

logger = logging.getLogger("APIExecutor")


class APIExecutor(Component):
    display_name = "API Executor"
    description = "Executes a sequence of HTTP requests using a persistent session with retry and cookie support."
    icon = "play"

    inputs = [
        DataInput(name="requests", display_name="Resolved Requests"),
        MessageTextInput(
            name="base_url",
            display_name="Base URL",
            info="e.g. https://restful-booker.herokuapp.com",
            value="",
        ),
        MessageTextInput(
            name="timeout",
            display_name="Timeout (seconds)",
            value="30",
        ),
        MessageTextInput(
            name="retry_count",
            display_name="Retry Count",
            value="3",
        ),
    ]

    outputs = [
        Output(display_name="Execution Results", name="results", method="execute"),
    ]

    def execute(self) -> Data:
        session = self._build_session(int(self.retry_count or 3))
        base_url = (self.base_url or "").rstrip("/")
        timeout = int(self.timeout or 30)

        raw_requests = self.requests.data.get("requests", [])
        results = []

        for req in raw_requests:
            result = self._run_request(session, req, base_url, timeout)
            results.append(result)

            # propagate cookies and extract common tokens for chaining
            self._extract_tokens(result)

        session.close()
        return Data(data={"results": results})

    def _build_session(self, retries: int) -> requests.Session:
        session = requests.Session()
        retry_strategy = Retry(
            total=retries,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _run_request(self, session: requests.Session, req: dict, base_url: str, timeout: int) -> dict:
        method = req.get("method", "GET").upper()
        url = req.get("url", "")
        if url.startswith("/"):
            url = base_url + url
        elif not url.startswith("http"):
            url = base_url + "/" + url

        headers = req.get("headers", {})
        cookies = req.get("cookies", {})
        body = req.get("body")
        auth = req.get("auth")

        kwargs = {
            "headers": headers,
            "cookies": cookies,
            "timeout": timeout,
        }

        if isinstance(body, dict):
            kwargs["json"] = body
        elif isinstance(body, str):
            kwargs["data"] = body

        if auth and auth.get("type") == "basic":
            user, _, pwd = auth.get("value", ":").partition(":")
            kwargs["auth"] = (user, pwd)

        start = time.time()
        error = None
        response = None

        try:
            response = session.request(method, url, **kwargs)
            duration_ms = round((time.time() - start) * 1000, 2)

            try:
                body_json = response.json()
            except Exception:
                body_json = response.text

            return {
                "method": method,
                "url": url,
                "request_headers": dict(headers),
                "request_body": body,
                "status_code": response.status_code,
                "response_headers": dict(response.headers),
                "response_body": body_json,
                "duration_ms": duration_ms,
                "error": None,
            }

        except requests.exceptions.Timeout:
            error = "TIMEOUT"
        except requests.exceptions.ConnectionError:
            error = "CONNECTION_ERROR"
        except Exception as exc:
            error = str(exc)

        duration_ms = round((time.time() - start) * 1000, 2)
        return {
            "method": method,
            "url": url,
            "request_headers": dict(headers),
            "request_body": body,
            "status_code": None,
            "response_headers": {},
            "response_body": None,
            "duration_ms": duration_ms,
            "error": error,
        }

    def _extract_tokens(self, result: dict) -> None:
        body = result.get("response_body")
        if isinstance(body, dict):
            for key in ("token", "access_token", "jwt", "bookingid", "id", "userId"):
                if key in body:
                    logger.info("Extracted variable: %s = %s", key, body[key])
