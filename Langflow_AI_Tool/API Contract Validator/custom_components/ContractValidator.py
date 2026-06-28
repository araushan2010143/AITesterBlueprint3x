import json
import re
import operator
from typing import Any
import jsonschema
from langflow.custom import Component
from langflow.io import MessageTextInput, DataInput, Output
from langflow.schema import Data


class ContractValidator(Component):
    display_name = "Contract Validator"
    description = "Validates API responses against JSON Schema contracts and custom assertion rules."
    icon = "check-circle"

    inputs = [
        DataInput(name="results", display_name="Execution Results"),
        MessageTextInput(
            name="schemas_json",
            display_name="Schemas (JSON)",
            info='Map of URL pattern → JSON Schema, e.g. {"/booking": {...schema...}}',
            value="{}",
        ),
        MessageTextInput(
            name="assertions_json",
            display_name="Assertions (JSON)",
            info='List of {url, field, operator, value} rules.',
            value="[]",
        ),
    ]

    outputs = [
        Output(display_name="Validation Report", name="report", method="validate"),
    ]

    _OPS = {
        "==": operator.eq,
        "!=": operator.ne,
        ">": operator.gt,
        ">=": operator.ge,
        "<": operator.lt,
        "<=": operator.le,
    }

    def validate(self) -> Data:
        try:
            schemas = json.loads(self.schemas_json or "{}")
        except json.JSONDecodeError:
            schemas = {}

        try:
            assertions = json.loads(self.assertions_json or "[]")
        except json.JSONDecodeError:
            assertions = []

        results = self.results.data.get("results", [])
        report = []

        for result in results:
            entry = self._validate_single(result, schemas, assertions)
            report.append(entry)

        total = len(report)
        passed = sum(1 for r in report if r["overall"] == "PASS")
        failed = total - passed

        return Data(data={
            "summary": {"total": total, "passed": passed, "failed": failed},
            "results": report,
        })

    def _validate_single(self, result: dict, schemas: dict, assertions: list) -> dict:
        url = result.get("url", "")
        method = result.get("method", "")
        status = result.get("status_code")
        body = result.get("response_body")

        checks = []

        # Status code presence check
        if result.get("error"):
            checks.append({"check": "connectivity", "status": "FAIL", "detail": result["error"]})
        else:
            checks.append({"check": "connectivity", "status": "PASS", "detail": f"HTTP {status}"})

        # Schema validation
        matched_schema = self._match_schema(url, schemas)
        if matched_schema:
            schema_check = self._run_schema_validation(body, matched_schema)
            checks.append(schema_check)

        # Assertion validation
        for assertion in assertions:
            if self._url_matches(url, assertion.get("url", "")):
                assertion_check = self._run_assertion(body, assertion)
                checks.append(assertion_check)

        overall = "PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL"

        return {
            "method": method,
            "url": url,
            "status_code": status,
            "duration_ms": result.get("duration_ms"),
            "overall": overall,
            "checks": checks,
        }

    def _match_schema(self, url: str, schemas: dict) -> dict | None:
        for pattern, schema in schemas.items():
            if pattern in url or re.search(pattern, url):
                return schema
        return None

    def _url_matches(self, url: str, pattern: str) -> bool:
        return pattern in url or bool(re.search(pattern, url))

    def _run_schema_validation(self, body: Any, schema: dict) -> dict:
        try:
            jsonschema.validate(instance=body, schema=schema)
            return {"check": "schema", "status": "PASS", "detail": "Schema valid"}
        except jsonschema.ValidationError as exc:
            return {"check": "schema", "status": "FAIL", "detail": exc.message}
        except jsonschema.SchemaError as exc:
            return {"check": "schema", "status": "FAIL", "detail": f"Invalid schema: {exc.message}"}

    def _run_assertion(self, body: Any, assertion: dict) -> dict:
        field = assertion.get("field", "")
        op_str = assertion.get("operator", "==")
        expected = assertion.get("value")
        label = assertion.get("label", f"{field} {op_str} {expected}")

        actual = self._extract_field(body, field)
        op_fn = self._OPS.get(op_str)

        if op_fn is None:
            return {"check": f"assertion:{label}", "status": "FAIL", "detail": f"Unknown operator: {op_str}"}

        try:
            passed = op_fn(actual, expected)
        except TypeError:
            passed = False

        status = "PASS" if passed else "FAIL"
        detail = f"{field}={actual!r} {op_str} {expected!r} → {status}"
        return {"check": f"assertion:{label}", "status": status, "detail": detail}

    def _extract_field(self, body: Any, field: str) -> Any:
        if not isinstance(body, dict):
            return None
        parts = field.split(".")
        current = body
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
