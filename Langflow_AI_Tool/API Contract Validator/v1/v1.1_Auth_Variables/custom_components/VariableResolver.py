import re
import json
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema import Data


class VariableResolver(Component):
    display_name = "Variable Resolver"
    description = "Extracts variables from API responses (token, bookingid, etc.) and replaces {{placeholders}} in subsequent requests."
    icon = "variable"

    inputs = [
        MessageTextInput(
            name="execution_results",
            display_name="Execution Results",
            info="JSON results from API Executor.",
        ),
        MessageTextInput(
            name="requests_json",
            display_name="Requests JSON",
            info="Original parsed requests JSON to resolve variables in.",
        ),
        MessageTextInput(
            name="seed_variables",
            display_name="Seed Variables (JSON)",
            info='Optional initial variables e.g. {"env": "qa"}',
            value="{}",
        ),
    ]

    outputs = [
        Output(display_name="Resolved Requests", name="resolved", method="resolve"),
        Output(display_name="Variable Store", name="store", method="get_store"),
    ]

    _store: dict = {}

    def resolve(self) -> Data:
        try:
            seed = json.loads(self.seed_variables or "{}")
        except Exception:
            seed = {}

        self._store = {**seed}

        # Extract variables from previous responses
        try:
            results = json.loads(self.execution_results)
            for r in results.get("results", []):
                body = r.get("response", {})
                if isinstance(body, dict):
                    for key in ("token", "access_token", "bookingid", "id", "userId", "sessionId"):
                        if key in body:
                            self._store[key] = body[key]
        except Exception:
            pass

        # Resolve placeholders in next requests
        try:
            reqs = json.loads(self.requests_json)
            resolved = [self._resolve_obj(r) for r in reqs]
        except Exception:
            resolved = []

        return Data(data={"requests": resolved, "variables": self._store})

    def get_store(self) -> Data:
        return Data(data=self._store)

    def _resolve_obj(self, obj):
        text = json.dumps(obj)
        resolved = re.sub(r"\{\{(\w+)\}\}", lambda m: str(self._store.get(m.group(1), m.group(0))), text)
        try:
            return json.loads(resolved)
        except Exception:
            return obj
