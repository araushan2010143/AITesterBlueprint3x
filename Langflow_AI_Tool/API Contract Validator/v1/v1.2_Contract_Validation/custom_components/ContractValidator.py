import json
import operator
import re
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema import Data

try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


class ContractValidator(Component):
    display_name = "Contract Validator"
    description = "Validates API responses against JSON Schema contracts and custom assertion rules."
    icon = "check-circle"

    inputs = [
        MessageTextInput(
            name="execution_results",
            display_name="Execution Results",
            info="JSON results from API Executor.",
        ),
        MessageTextInput(
            name="schemas_json",
            display_name="Schemas (JSON)",
            info='Map of URL pattern → JSON Schema. e.g. {"/auth": {"type":"object","required":["token"]}}',
            value="{}",
        ),
        MessageTextInput(
            name="assertions_json",
            display_name="Assertions (JSON)",
            info='List of {url, field, operator, value} rules.',
            value="[]",
        ),
        MessageTextInput(
            name="expected_status",
            display_name="Expected Status Codes (JSON)",
            info='Map of URL pattern → expected status code. e.g. {"/auth": 200}',
            value="{}",
        ),
    ]

    outputs = [
        Output(display_name="Validation Report", name="report", method="validate"),
    ]

    OPS = {"==": operator.eq, "!=": operator.ne, ">": operator.gt,
           ">=": operator.ge, "<": operator.lt, "<=": operator.le}

    def validate(self) -> Data:
        try:
            results = json.loads(self.execution_results).get("results", [])
        except Exception:
            return Data(data={"error": "Invalid execution results", "summary": {}, "results": []})

        try:
            schemas = json.loads(self.schemas_json or "{}")
        except Exception:
            schemas = {}

        try:
            assertions = json.loads(self.assertions_json or "[]")
        except Exception:
            assertions = []

        try:
            expected_status = json.loads(self.expected_status or "{}")
        except Exception:
            expected_status = {}

        report = []
        for result in results:
            entry = self._validate_one(result, schemas, assertions, expected_status)
            report.append(entry)

        total  = len(report)
        passed = sum(1 for r in report if r["overall"] == "PASS")

        return Data(data={
            "summary": {"total": total, "passed": passed, "failed": total - passed},
            "results": report,
        })

    def _validate_one(self, result, schemas, assertions, expected_status):
        url    = result.get("url", "")
        method = result.get("method", "")
        status = result.get("status_code")
        body   = result.get("response")
        checks = []

        # Connectivity
        if result.get("error"):
            checks.append({"check": "connectivity", "status": "FAIL", "detail": result["error"]})
        else:
            checks.append({"check": "connectivity", "status": "PASS", "detail": f"HTTP {status}"})

        # Status code
        for pattern, exp in expected_status.items():
            if self._matches(url, pattern):
                s = "PASS" if status == exp else "FAIL"
                checks.append({"check": "status_code", "status": s,
                                "detail": f"expected {exp}, got {status}"})

        # Schema
        schema = self._find_schema(url, schemas)
        if schema and HAS_JSONSCHEMA:
            try:
                jsonschema.validate(instance=body, schema=schema)
                checks.append({"check": "schema", "status": "PASS", "detail": "Schema valid"})
            except jsonschema.ValidationError as e:
                checks.append({"check": "schema", "status": "FAIL", "detail": e.message})

        # Assertions
        for a in assertions:
            if self._matches(url, a.get("url", "")):
                checks.append(self._check_assertion(body, a))

        overall = "PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL"
        return {"method": method, "url": url, "status_code": status,
                "duration_ms": result.get("duration_ms"), "overall": overall, "checks": checks}

    def _find_schema(self, url, schemas):
        for pattern, schema in schemas.items():
            if self._matches(url, pattern):
                return schema
        return None

    def _matches(self, url, pattern):
        return pattern in url or bool(re.search(pattern, url))

    def _check_assertion(self, body, assertion):
        field    = assertion.get("field", "")
        op_str   = assertion.get("operator", "==")
        expected = assertion.get("value")
        label    = assertion.get("label", f"{field} {op_str} {expected}")
        actual   = self._get_field(body, field)
        op_fn    = self.OPS.get(op_str)

        if not op_fn:
            return {"check": f"assertion:{label}", "status": "FAIL", "detail": f"Unknown operator: {op_str}"}

        try:
            passed = op_fn(actual, expected)
        except TypeError:
            passed = False

        status = "PASS" if passed else "FAIL"
        return {"check": f"assertion:{label}", "status": status,
                "detail": f"{field}={actual!r} {op_str} {expected!r}"}

    def _get_field(self, body, field):
        if not isinstance(body, dict):
            return None
        current = body
        for part in field.split("."):
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
