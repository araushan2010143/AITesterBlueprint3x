"""Parse JUnit XML test reports (Jenkins, Maven, Pytest, Gradle, Playwright junit reporter)."""
import xml.etree.ElementTree as ET
from typing import List, Tuple


def _collect_testcases(node: ET.Element) -> List[Tuple[str, ET.Element]]:
    """Recursively collect (suite_name, testcase) from any JUnit XML structure."""
    results = []
    suite_name = node.get("name", "")
    for child in node:
        if child.tag == "testcase":
            results.append((suite_name, child))
        elif child.tag in ("testsuite", "testsuites"):
            results.extend(_collect_testcases(child))
    return results


def parse(content: str, build_label: str = "Build-1") -> str:
    """
    Convert JUnit XML to the multi-run text format flaky_agent understands.
    Single XML = single build snapshot; call repeatedly for multi-run history.
    """
    root = ET.fromstring(content.strip())

    if root.tag == "testsuites":
        pairs = _collect_testcases(root)
    elif root.tag == "testsuite":
        pairs = _collect_testcases(root)
    else:
        raise ValueError(f"Unknown JUnit root element: <{root.tag}>")

    lines: List[str] = [f"=== JUnit Test Report ({build_label}) ==="]

    for suite_name, tc in pairs:
        raw_name = tc.get("name", "unknown_test")
        classname = tc.get("classname", "")
        display_name = f"{suite_name} › {raw_name}" if suite_name else raw_name

        failure_el = tc.find("failure")
        error_el   = tc.find("error")
        skipped_el = tc.find("skipped")

        if skipped_el is not None:
            status = "SKIP"
            error_msg = ""
        elif failure_el is not None or error_el is not None:
            status = "FAIL"
            el = failure_el if failure_el is not None else error_el
            error_msg = (el.get("message") or (el.text or "")).strip()[:300]
        else:
            status = "PASS"
            error_msg = ""

        line = f"{display_name}: {build_label}={status}"
        if error_msg:
            line += f". Error: {error_msg}"
        lines.append(line)

    return "\n".join(lines)


def parse_multi(xml_contents: List[str]) -> str:
    """Merge multiple JUnit XML files as separate builds (Build-1 … Build-N)."""
    parts: List[str] = []
    for i, xml in enumerate(xml_contents, 1):
        try:
            parts.append(parse(xml, build_label=f"Build-{i}"))
        except Exception as e:
            parts.append(f"=== Build-{i}: parse error — {e} ===")
    return "\n\n".join(parts)
