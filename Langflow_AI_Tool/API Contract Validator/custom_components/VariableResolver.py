import re
import json
from langflow.custom import Component
from langflow.io import MessageTextInput, DataInput, Output
from langflow.schema import Data


class VariableResolver(Component):
    display_name = "Variable Resolver"
    description = "Replaces {{variable}} placeholders in requests using a dynamic context store built from prior responses."
    icon = "variable"

    inputs = [
        DataInput(name="requests", display_name="Parsed Requests"),
        MessageTextInput(
            name="initial_variables",
            display_name="Initial Variables (JSON)",
            info='Optional seed variables, e.g. {"env": "qa", "apiKey": "abc123"}',
            value="{}",
        ),
    ]

    outputs = [
        Output(display_name="Resolved Requests", name="resolved_requests", method="resolve"),
        Output(display_name="Variable Store", name="variable_store", method="get_store"),
    ]

    _store: dict = {}

    def resolve(self) -> Data:
        try:
            seed = json.loads(self.initial_variables or "{}")
        except json.JSONDecodeError:
            seed = {}

        self._store = {**seed}
        raw_requests = self.requests.data.get("requests", [])
        resolved = [self._resolve_request(r) for r in raw_requests]
        return Data(data={"requests": resolved})

    def get_store(self) -> Data:
        return Data(data=self._store)

    def update_store(self, key: str, value) -> None:
        self._store[key] = value

    def _resolve_request(self, request: dict) -> dict:
        serialized = json.dumps(request)
        resolved_str = self._replace_placeholders(serialized)
        try:
            return json.loads(resolved_str)
        except json.JSONDecodeError:
            return request

    def _replace_placeholders(self, text: str) -> str:
        def replacer(match):
            key = match.group(1).strip()
            return str(self._store.get(key, match.group(0)))

        return re.sub(r"\{\{(\w+)\}\}", replacer, text)
