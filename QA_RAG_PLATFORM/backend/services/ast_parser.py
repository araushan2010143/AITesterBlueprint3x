"""
V3 AST-based code parser using tree-sitter.

Replaces the LLM Stage 2 (Code Parsing → IR) with deterministic AST extraction,
giving exact selector values, method names, and annotations instead of LLM guesses.

Supported: Java, Python, C#, TypeScript, JavaScript, Robot Framework (regex), Gherkin (regex)
Falls back to a lightweight regex extractor when tree-sitter is unavailable.
"""
import re
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Availability guard ─────────────────────────────────────────────────────────

try:
    from tree_sitter_languages import get_language, get_parser as _get_parser
    _TS_AVAILABLE = True
except Exception:
    _TS_AVAILABLE = False
    logger.warning("tree-sitter-languages not installed — AST parser will use regex fallback")


# ── Language detection ─────────────────────────────────────────────────────────

def detect_language(source: str) -> str:
    """Best-effort language detection from source content."""
    if re.search(r"^\*{3}\s*Test Cases", source, re.MULTILINE):
        return "robot"
    if re.search(r"^\s*(Feature|Scenario):.*$", source, re.MULTILINE):
        return "gherkin"
    if re.search(r"import\s+org\.openqa\.selenium|@Test|@BeforeEach|@BeforeAll|import\s+org\.junit", source):
        return "java"
    if re.search(r"using\s+NUnit|using\s+Microsoft\.VisualStudio\.TestTools|\[Test\]|\[TestMethod\]|\[TestClass\]", source):
        return "csharp"
    if re.search(r"def\s+test_|import\s+pytest|from\s+selenium\s+import", source):
        return "python"
    if re.search(r"import.*from\s+'@playwright/test'|const\s+\{.*page.*\}\s*=|describe\(|it\(|test\(", source):
        return "typescript"
    if re.search(r"require\(.*selenium|describe\(|it\(|beforeEach\(", source):
        return "javascript"
    return "unknown"


# ── Tree-sitter helpers ────────────────────────────────────────────────────────

def _text(node, src: bytes) -> str:
    return src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _walk(node):
    yield node
    for child in node.children:
        yield from _walk(child)


def _find_all(node, type_name: str):
    return [n for n in _walk(node) if n.type == type_name]


def _find_first(node, type_name: str):
    for n in _walk(node):
        if n.type == type_name:
            return n
    return None


def _child_text(node, child_type: str, src: bytes) -> str:
    for c in node.children:
        if c.type == child_type:
            return _text(c, src)
    return ""


# ── Java extractor ─────────────────────────────────────────────────────────────

def _extract_java(source: str) -> Dict[str, Any]:
    src = source.encode("utf-8")
    parser = _get_parser("java")
    tree = parser.parse(src)
    root = tree.root_node

    # Page name from class declaration
    class_node = _find_first(root, "class_declaration")
    page_name = "UnknownPage"
    if class_node:
        for c in class_node.children:
            if c.type == "identifier":
                page_name = _text(c, src)
                break

    # Locators — By.id("x"), By.cssSelector("x"), @FindBy(...)
    locators: List[Dict] = []
    seen_locs: set = set()

    BY_PATTERN = re.compile(
        r'By\.(id|name|className|cssSelector|xpath|tagName|linkText|partialLinkText)'
        r'\s*\(\s*["\']([^"\']+)["\']',
        re.IGNORECASE,
    )
    FINDBY_PATTERN = re.compile(
        r'@FindBy\s*\(\s*(\w+)\s*=\s*["\']([^"\']+)["\']',
        re.IGNORECASE,
    )
    for m in BY_PATTERN.finditer(source):
        sel_type = m.group(1).lower()
        sel_val = m.group(2)
        key = f"{sel_type}:{sel_val}"
        if key not in seen_locs:
            seen_locs.add(key)
            name = re.sub(r"[^a-zA-Z0-9]", "_", sel_val)[:30]
            locators.append({"name": f"{name}Locator", "type": sel_type, "value": sel_val, "original": m.group(0)})
    for m in FINDBY_PATTERN.finditer(source):
        sel_type = m.group(1).lower()
        sel_val = m.group(2)
        key = f"{sel_type}:{sel_val}"
        if key not in seen_locs:
            seen_locs.add(key)
            locators.append({"name": f"{sel_val.replace('-','_')}Element", "type": sel_type, "value": sel_val, "original": m.group(0)})

    # Test methods — method_declarations with @Test annotation
    tests: List[Dict] = []
    for method in _find_all(root, "method_declaration"):
        # Check annotations on parent or sibling modifiers block
        has_test_annotation = False
        annotations = []
        for child in _walk(method):
            if child.type == "marker_annotation" or child.type == "annotation":
                ann_text = _text(child, src)
                annotations.append(ann_text)
                if "@Test" in ann_text or "@test" in ann_text:
                    has_test_annotation = True

        if not has_test_annotation:
            # Also look in sibling modifiers
            parent = method.parent
            if parent:
                for sib in parent.children:
                    if sib.type == "modifiers":
                        mod_text = _text(sib, src)
                        if "@Test" in mod_text:
                            has_test_annotation = True
                            break

        if not has_test_annotation:
            continue

        method_name = ""
        for c in method.children:
            if c.type == "identifier":
                method_name = _text(c, src)
                break

        method_src = _text(method, src)
        steps = _extract_steps_from_java(method_src)

        tests.append({
            "name": _camel_to_readable(method_name),
            "original_name": method_name,
            "page": page_name,
            "steps": steps,
            "test_data": {},
        })

    return {
        "pages": [{"name": page_name, "locators": locators}],
        "tests": tests,
        "_ast_method": "tree-sitter/java",
    }


def _extract_steps_from_java(method_src: str) -> List[Dict]:
    steps = []
    for m in re.finditer(r'driver\.(get|findElement|sendKeys|click|navigate)\s*\(([^)]*)\)', method_src):
        action = m.group(1)
        args = m.group(2)
        if action == "get":
            url = re.search(r'["\']([^"\']+)["\']', args)
            steps.append({"action": "navigate", "target": url.group(1) if url else args, "value": ""})
        elif action == "sendKeys":
            val = re.search(r'["\']([^"\']+)["\']', args)
            steps.append({"action": "fill", "target": "?", "value": val.group(1) if val else ""})
    for m in re.finditer(r'\.click\(\)', method_src):
        steps.append({"action": "click", "target": "?", "value": ""})
    for m in re.finditer(r'assert.*getCurrentUrl\(\).*contains\(["\']([^"\']+)["\']', method_src):
        steps.append({"action": "assert_url", "target": "", "value": m.group(1)})
    return steps


# ── Python extractor ───────────────────────────────────────────────────────────

def _extract_python(source: str) -> Dict[str, Any]:
    src = source.encode("utf-8")
    parser = _get_parser("python")
    tree = parser.parse(src)
    root = tree.root_node

    locators: List[Dict] = []
    seen: set = set()
    FIND_PATTERN = re.compile(
        r'find_element\s*\(\s*By\.(\w+)\s*,\s*["\']([^"\']+)["\']',
        re.IGNORECASE,
    )
    for m in FIND_PATTERN.finditer(source):
        key = f"{m.group(1)}:{m.group(2)}"
        if key not in seen:
            seen.add(key)
            locators.append({"name": f"{m.group(2)[:20].replace('-','_')}Locator", "type": m.group(1).lower(), "value": m.group(2), "original": m.group(0)})

    tests: List[Dict] = []
    for fn in _find_all(root, "function_definition"):
        name_node = _find_first(fn, "identifier")
        fn_name = _text(name_node, src) if name_node else ""
        if not fn_name.startswith("test_") and not fn_name.startswith("Test"):
            continue
        tests.append({
            "name": fn_name.replace("test_", "").replace("_", " "),
            "original_name": fn_name,
            "page": "Page",
            "steps": [],
            "test_data": {},
        })

    return {
        "pages": [{"name": "Page", "locators": locators}],
        "tests": tests,
        "_ast_method": "tree-sitter/python",
    }


# ── C# extractor ───────────────────────────────────────────────────────────────

def _extract_csharp(source: str) -> Dict[str, Any]:
    src = source.encode("utf-8")
    parser = _get_parser("c_sharp")
    tree = parser.parse(src)
    root = tree.root_node

    class_node = _find_first(root, "class_declaration")
    class_name = "UnknownPage"
    if class_node:
        id_node = _find_first(class_node, "identifier")
        if id_node:
            class_name = _text(id_node, src)

    locators: List[Dict] = []
    seen: set = set()
    for m in re.finditer(r'By\.(\w+)\s*\(\s*["\']([^"\']+)["\']', source):
        key = f"{m.group(1)}:{m.group(2)}"
        if key not in seen:
            seen.add(key)
            locators.append({"name": f"{m.group(2)[:20]}Locator", "type": m.group(1).lower(), "value": m.group(2), "original": m.group(0)})

    tests: List[Dict] = []
    for method in _find_all(root, "method_declaration"):
        method_text = _text(method, src)
        if not re.search(r'\[Test\]|\[TestMethod\]|\[Fact\]|\[Theory\]', method_text):
            continue
        id_node = _find_first(method, "identifier")
        method_name = _text(id_node, src) if id_node else "unknownTest"
        tests.append({
            "name": _camel_to_readable(method_name),
            "original_name": method_name,
            "page": class_name,
            "steps": [],
            "test_data": {},
        })

    return {
        "pages": [{"name": class_name, "locators": locators}],
        "tests": tests,
        "_ast_method": "tree-sitter/c_sharp",
    }


# ── TypeScript/JavaScript extractor ───────────────────────────────────────────

def _extract_typescript(source: str, lang: str = "typescript") -> Dict[str, Any]:
    src = source.encode("utf-8")
    try:
        parser = _get_parser(lang)
    except Exception:
        parser = _get_parser("javascript")
    tree = parser.parse(src)
    root = tree.root_node

    tests: List[Dict] = []
    # Look for test() / it() calls
    for call in _find_all(root, "call_expression"):
        fn = _find_first(call, "identifier")
        if fn and _text(fn, src) in ("test", "it"):
            args = _find_first(call, "arguments")
            if args and len(args.children) >= 2:
                name_node = args.children[1] if args.children[0].type == "(" else args.children[0]
                raw = _text(name_node, src).strip("'\"` ")
                tests.append({"name": raw, "original_name": raw, "page": "Page", "steps": [], "test_data": {}})

    locators: List[Dict] = []
    for m in re.finditer(r'page\.locator\(["\']([^"\']+)["\']\)', source):
        locators.append({"name": "locator", "type": "css", "value": m.group(1), "original": m.group(0)})

    return {
        "pages": [{"name": "Page", "locators": locators}],
        "tests": tests,
        "_ast_method": f"tree-sitter/{lang}",
    }


# ── Regex fallbacks for Robot / Gherkin / Unknown ─────────────────────────────

def _extract_robot(source: str) -> Dict[str, Any]:
    tests = []
    in_section = False
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("*** Test Cases"):
            in_section = True
            continue
        if stripped.startswith("***"):
            in_section = False
            continue
        if in_section and stripped and not stripped.startswith("#") and not line.startswith(" ") and not line.startswith("\t"):
            tests.append({"name": stripped, "original_name": stripped, "page": "Page", "steps": [], "test_data": {}})
    return {"pages": [{"name": "Page", "locators": []}], "tests": tests, "_ast_method": "regex/robot"}


def _extract_gherkin(source: str) -> Dict[str, Any]:
    tests = []
    for m in re.finditer(r"^\s*Scenario(?:\s+Outline)?:\s*(.+)$", source, re.MULTILINE):
        name = m.group(1).strip()
        tests.append({"name": name, "original_name": name, "page": "Page", "steps": [], "test_data": {}})
    return {"pages": [{"name": "Page", "locators": []}], "tests": tests, "_ast_method": "regex/gherkin"}


def _extract_regex_fallback(source: str) -> Dict[str, Any]:
    """Generic regex fallback when tree-sitter is unavailable."""
    tests = []
    # Java-style @Test
    for m in re.finditer(r'@Test.*?\n\s*(?:public\s+)?void\s+(\w+)\s*\(', source, re.DOTALL):
        tests.append({"name": _camel_to_readable(m.group(1)), "original_name": m.group(1), "page": "Page", "steps": [], "test_data": {}})
    # Python-style def test_
    for m in re.finditer(r'def\s+(test_\w+)\s*\(', source):
        tests.append({"name": m.group(1).replace("test_", "").replace("_", " "), "original_name": m.group(1), "page": "Page", "steps": [], "test_data": {}})
    # C# [Test]
    for m in re.finditer(r'\[(?:Test|TestMethod|Fact)\].*?\n\s*(?:public\s+)?(?:async\s+)?(?:\w+\s+)?(\w+)\s*\(', source, re.DOTALL):
        tests.append({"name": _camel_to_readable(m.group(1)), "original_name": m.group(1), "page": "Page", "steps": [], "test_data": {}})

    locators: List[Dict] = []
    for m in re.finditer(r'By\.(\w+)\s*\(\s*["\']([^"\']+)["\']', source):
        locators.append({"name": f"{m.group(2)[:20]}Locator", "type": m.group(1).lower(), "value": m.group(2), "original": m.group(0)})

    return {"pages": [{"name": "Page", "locators": locators}], "tests": tests, "_ast_method": "regex/fallback"}


# ── Utility ────────────────────────────────────────────────────────────────────

def _camel_to_readable(name: str) -> str:
    s = re.sub(r"([A-Z])", r" \1", name).strip()
    s = re.sub(r"[_-]", " ", s)
    return s.capitalize()


# ── Public API ─────────────────────────────────────────────────────────────────

def parse(source: str, language: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse legacy test source code into IR.

    Uses tree-sitter for accurate AST extraction.
    Falls back to regex when tree-sitter is unavailable or the language
    doesn't have a grammar.

    Returns the same IR schema as V1 migration_agent Stage 2,
    extended with `_ast_method` to indicate which parser was used.
    """
    lang = language or detect_language(source)

    if lang == "robot":
        return _extract_robot(source)
    if lang == "gherkin":
        return _extract_gherkin(source)

    if not _TS_AVAILABLE:
        return _extract_regex_fallback(source)

    try:
        if lang == "java":
            return _extract_java(source)
        if lang == "python":
            return _extract_python(source)
        if lang == "csharp":
            return _extract_csharp(source)
        if lang in ("typescript", "javascript"):
            return _extract_typescript(source, lang)
        # Unknown — try regex
        return _extract_regex_fallback(source)
    except Exception as exc:
        logger.warning("Tree-sitter extraction failed (%s): %s — falling back to regex", lang, exc)
        return _extract_regex_fallback(source)
