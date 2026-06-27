import pathlib, importlib

pkg = next((p for p in ["lfx", "langflow"] if importlib.util.find_spec(p)), None)
if not pkg:
    raise RuntimeError("Neither lfx nor langflow package found")

# Write FlakyDiff into /app/custom_components — loaded via --components-path flag.
# This avoids touching any installed package files and works across all Langflow versions.
custom_dir = pathlib.Path("/app/custom_components")
custom_dir.mkdir(parents=True, exist_ok=True)

src = pathlib.Path("/tmp/flaky_diff_src.py").read_text()
src = src.replace("from langflow.", f"from {pkg}.")
(custom_dir / "flaky_diff.py").write_text(src)
print(f"[setup] FlakyDiff written to {custom_dir}/flaky_diff.py")
print("[setup] Done — pass --components-path /app/custom_components to langflow run")
