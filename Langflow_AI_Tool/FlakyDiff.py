from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json


class FlakyTestDiffComponent(Component):
    display_name = "Flaky Test Diff"
    description = (
        "Compares two Playwright JSON test reports to classify tests as "
        "flaky, retry-only flaky, consistent failures, or stable."
    )
    icon = "flask-conical"
    name = "FlakyDiff"

    inputs = [
        MessageTextInput(
            name="build1_json",
            display_name="Build 1 JSON",
            info="Full text content of the Playwright JSON report for Build 1.",
        ),
        MessageTextInput(
            name="build2_json",
            display_name="Build 2 JSON",
            info="Full text content of the Playwright JSON report for Build 2.",
        ),
    ]

    outputs = [
        Output(display_name="Analysis", name="analysis", method="analyze"),
    ]

    def analyze(self) -> Message:
        try:
            build1 = json.loads(self.build1_json)
            build2 = json.loads(self.build2_json)
        except json.JSONDecodeError as e:
            return Message(text=f"ERROR: Invalid JSON input — {e}")

        tests1 = {t["title"]: t for t in build1.get("tests", [])}
        tests2 = {t["title"]: t for t in build2.get("tests", [])}
        all_titles = sorted(set(tests1) | set(tests2))

        flaky_tests = []
        retry_only_flaky = []
        consistent_failures = []
        stable_tests = []
        inconclusive = []

        for title in all_titles:
            t1 = tests1.get(title)
            t2 = tests2.get(title)

            if t1 is None or t2 is None:
                # Present in only one build — cannot classify reliably
                inconclusive.append({
                    "title": title,
                    "present_in": "build1" if t1 else "build2",
                })
                continue

            s1, s2 = t1["status"], t2["status"]
            r1 = t1.get("retries", 0)
            r2 = t2.get("retries", 0)

            if s1 != s2:
                # Status flipped between builds → classic flaky
                flaky_tests.append({
                    "title": title,
                    "build1_status": s1,
                    "build2_status": s2,
                    "build1_retries": r1,
                    "build2_retries": r2,
                    "build1_error": t1.get("error", ""),
                    "build2_error": t2.get("error", ""),
                    "build1_duration_ms": t1.get("duration", 0),
                    "build2_duration_ms": t2.get("duration", 0),
                })
            elif s1 == "passed" and (r1 > 0 or r2 > 0):
                # Passed in both but required retries → retry-only flaky
                retry_only_flaky.append({
                    "title": title,
                    "build1_retries": r1,
                    "build2_retries": r2,
                    "build1_duration_ms": t1.get("duration", 0),
                    "build2_duration_ms": t2.get("duration", 0),
                })
            elif s1 == "failed" and s2 == "failed":
                # Failed in both → consistent (real bug, not flakiness)
                consistent_failures.append({
                    "title": title,
                    "build1_error": t1.get("error", ""),
                    "build2_error": t2.get("error", ""),
                    "build1_duration_ms": t1.get("duration", 0),
                    "build2_duration_ms": t2.get("duration", 0),
                })
            else:
                # Passed in both with no retries → stable
                stable_tests.append({
                    "title": title,
                    "build1_duration_ms": t1.get("duration", 0),
                    "build2_duration_ms": t2.get("duration", 0),
                })

        analysis = {
            "summary_counts": {
                "flaky_count": len(flaky_tests),
                "retry_only_flaky_count": len(retry_only_flaky),
                "consistent_failure_count": len(consistent_failures),
                "stable_count": len(stable_tests),
                "inconclusive_count": len(inconclusive),
                "total_unique_tests": len(all_titles),
            },
            "flaky_tests": flaky_tests,
            "retry_only_flaky": retry_only_flaky,
            "consistent_failures": consistent_failures,
            "stable_tests": stable_tests,
            "inconclusive": inconclusive,
        }

        output_text = json.dumps(analysis, indent=2)
        self.status = output_text
        return Message(text=output_text)
