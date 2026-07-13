"""Parse Playwright JSON reporter output (--reporter=json)."""
import json
from typing import Any, Dict, List


def _collect_specs(node: Dict[str, Any], suite_path: str = "") -> List[Dict[str, Any]]:
    """Recursively collect spec objects from nested suites."""
    specs: List[Dict[str, Any]] = []
    title = node.get("title", "")
    path = f"{suite_path} › {title}".lstrip(" › ") if title else suite_path

    for spec in node.get("specs", []):
        specs.append({"path": path, "spec": spec})

    for child_suite in node.get("suites", []):
        specs.extend(_collect_specs(child_suite, path))

    return specs


def parse(content: str, build_label: str = "Build-1") -> str:
    """
    Convert a Playwright JSON report to the multi-run text format flaky_agent understands.
    Playwright retries within a single run are captured as run_history per test.
    """
    data: Dict[str, Any] = json.loads(content)
    lines: List[str] = [f"=== Playwright Test Report ({build_label}) ==="]

    top_suites = data.get("suites", [])
    all_specs: List[Dict[str, Any]] = []
    for suite in top_suites:
        all_specs.extend(_collect_specs(suite))

    for item in all_specs:
        path: str = item["path"]
        spec: Dict[str, Any] = item["spec"]
        title: str = spec.get("title", "unknown_test")
        display = f"{path} › {title}" if path else title

        # Each spec can have multiple test instances (browser projects)
        tests: List[Dict] = spec.get("tests", [])
        results_summary: List[str] = []
        errors: List[str] = []

        for test in tests:
            project = test.get("projectName", "")
            for result in test.get("results", []):
                status = result.get("status", "unknown")  # passed/failed/timedOut/interrupted
                retry  = result.get("retry", 0)
                label  = f"Build-{i}" if (i := retry + 1) else build_label

                run_status = "PASS" if status == "passed" else "FAIL"
                results_summary.append(f"{build_label}(retry{retry})={run_status}")

                if status != "passed":
                    err = result.get("error", {})
                    msg = err.get("message", "") or err.get("value", "")
                    if msg:
                        errors.append(msg.strip()[:250])

        # Build run history string
        run_str = " | ".join(results_summary) if results_summary else f"{build_label}=UNKNOWN"
        line = f"{display}: {run_str}"
        if errors:
            line += f". Error: {errors[0]}"
        lines.append(line)

    # Append stats if available
    stats = data.get("stats", {})
    if stats:
        lines.append(
            f"\nSuite stats: {stats.get('expected', 0)} passed, "
            f"{stats.get('unexpected', 0)} failed, "
            f"{stats.get('skipped', 0)} skipped"
        )

    return "\n".join(lines)
