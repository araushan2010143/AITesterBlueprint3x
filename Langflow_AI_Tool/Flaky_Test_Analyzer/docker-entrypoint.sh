#!/bin/bash
set -e

# Render injects $PORT; fall back to 7860 for local Docker
PORT="${PORT:-7860}"

# Find the langflow binary (path varies between langflow versions)
LANGFLOW_BIN=$(which langflow 2>/dev/null \
    || find /app -name "langflow" -type f 2>/dev/null | head -1 \
    || echo "python3 -m langflow")

echo "[entrypoint] Starting Langflow on port $PORT ..."
$LANGFLOW_BIN run --host 0.0.0.0 --port "$PORT" &
LF_PID=$!

# Wait up to 120 s for the API to be ready
echo "[entrypoint] Waiting for Langflow to become ready..."
for i in $(seq 1 120); do
    if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
        echo "[entrypoint] Ready after ${i}s"
        break
    fi
    sleep 1
done

# Auto-import flow on first boot
TOKEN=$(curl -sf -X POST "http://localhost:$PORT/api/v1/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=langflow&password=langflow" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

if [ -n "$TOKEN" ]; then
    EXISTING=$(curl -sf "http://localhost:$PORT/api/v1/flows" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null \
        | python3 -c "import sys,json; flows=json.load(sys.stdin); print(any(f.get('name')=='Flaky Test Analyzer' for f in flows))" 2>/dev/null || echo "False")

    if [ "$EXISTING" != "True" ]; then
        curl -sf -X POST "http://localhost:$PORT/api/v1/flows/upload/" \
            -H "Authorization: Bearer $TOKEN" \
            -F "file=@/app/flows/flaky_analyzer.langflow.json" >/dev/null 2>&1 \
            && echo "[entrypoint] Flow imported." \
            || echo "[entrypoint] Flow import failed (non-fatal)."
    else
        echo "[entrypoint] Flow already present."
    fi
else
    echo "[entrypoint] Auth failed — skipping flow import."
fi

wait $LF_PID
