FROM langflowai/langflow:latest

USER root

# Register FlakyDiff into the prototypes component category
COPY FlakyDiff.py /tmp/flaky_diff_src.py

RUN SITE=$(python3 -c "import site; print(site.getsitepackages()[0])") && \
    # Determine actual package name (lfx in prod, langflow in dev)
    PKG=$(python3 -c "import importlib, sys; \
        m=next((p for p in ['lfx','langflow'] if importlib.util.find_spec(p)), None); \
        print(m)") && \
    PROTO_DIR="$SITE/$PKG/components/prototypes" && \
    ASSET_DIR="$SITE/$PKG/_assets" && \
    # Copy FlakyDiff component — rewrite imports to match installed package
    sed "s/from langflow\./from $PKG./g" /tmp/flaky_diff_src.py > "$PROTO_DIR/flaky_diff.py" && \
    # Remove bundled component_index so Langflow does dynamic discovery on boot
    rm -f "$ASSET_DIR/component_index.json" && \
    # Add FlakyDiff to prototypes __init__
    python3 -c "
import re, pathlib
init = pathlib.Path('$PROTO_DIR/__init__.py').read_text()
if 'FlakyDiff' not in init:
    init = re.sub(
        r'(_dynamic_imports\s*=\s*\{)',
        r'\1\n    \"FlakyDiff\": \"flaky_diff\",',
        init
    )
    init = re.sub(
        r'(__all__\s*=\s*\[)',
        r'\1\n    \"FlakyDiff\",',
        init
    )
    pathlib.Path('$PROTO_DIR/__init__.py').write_text(init)
"

# Copy flow and auto-import script
COPY flaky_analyzer.langflow.json /app/flows/flaky_analyzer.langflow.json
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER langflow

EXPOSE 7860

ENTRYPOINT ["/app/docker-entrypoint.sh"]
