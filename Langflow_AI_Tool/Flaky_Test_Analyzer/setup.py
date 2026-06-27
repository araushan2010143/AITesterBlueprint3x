import re, pathlib, importlib, site as _site

pkg = next((p for p in ["lfx", "langflow"] if importlib.util.find_spec(p)), None)
if not pkg:
    raise RuntimeError("Neither lfx nor langflow package found")

site_dir   = pathlib.Path(_site.getsitepackages()[0])
proto_dir  = site_dir / pkg / "components" / "prototypes"
asset_dir  = site_dir / pkg / "_assets"

# Rewrite langflow imports to match installed package, then copy
src = pathlib.Path("/tmp/flaky_diff_src.py").read_text()
src = src.replace("from langflow.", f"from {pkg}.")
(proto_dir / "flaky_diff.py").write_text(src)
print(f"[setup] FlakyDiff written to {proto_dir}/flaky_diff.py")

# Delete bundled index so Langflow does dynamic component discovery on boot
index = asset_dir / "component_index.json"
if index.exists():
    index.unlink()
    print("[setup] Removed component_index.json (dynamic discovery enabled)")

# Register FlakyDiff in prototypes __init__.py
init_path = proto_dir / "__init__.py"
init = init_path.read_text()
if "FlakyDiff" not in init:
    init = re.sub(r"(_dynamic_imports\s*=\s*\{)", r'\1\n    "FlakyDiff": "flaky_diff",', init)
    init = re.sub(r"(__all__\s*=\s*\[)",          r'\1\n    "FlakyDiff",', init)
    init_path.write_text(init)
    print("[setup] FlakyDiff registered in __init__.py")
else:
    print("[setup] FlakyDiff already registered")
