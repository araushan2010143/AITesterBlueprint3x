import pathlib, importlib

pkg = next((p for p in ["lfx", "langflow"] if importlib.util.find_spec(p)), None)
if not pkg:
    raise RuntimeError("Neither lfx nor langflow package found")

custom_dir = pathlib.Path("/app/custom_components")
custom_dir.mkdir(parents=True, exist_ok=True)

components = [
    ("BugConnectorNormalizer", "/tmp/bug_connector_normalizer_src.py", "bug_connector_normalizer.py"),
    ("RiskScoringEngine",      "/tmp/risk_scoring_engine_src.py",      "risk_scoring_engine.py"),
    ("DuplicateDetector",      "/tmp/duplicate_detector_src.py",       "duplicate_detector.py"),
    ("ConfidenceRouter",       "/tmp/confidence_router_src.py",        "confidence_router.py"),
    ("BugTriagePipeline",      "/tmp/bug_triage_pipeline_src.py",      "bug_triage_pipeline.py"),
]

for name, src_path, dest_name in components:
    src = pathlib.Path(src_path).read_text()
    src = src.replace("from langflow.", f"from {pkg}.")
    dest = custom_dir / dest_name
    dest.write_text(src)
    print(f"[setup] {name} → {dest}")

print(f"[setup] All 4 components written. Pass --components-path /app/custom_components to langflow run.")
