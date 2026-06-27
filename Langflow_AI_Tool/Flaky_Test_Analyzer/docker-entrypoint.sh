#!/bin/bash
set -e

# The base image installs everything into /app/.venv — add it to PATH explicitly
export PATH="/app/.venv/bin:$PATH"

# Render injects PORT (usually 10000). Langflow reads LANGFLOW_PORT env var.
export LANGFLOW_PORT="${PORT:-7860}"
export LANGFLOW_HOST="0.0.0.0"
export LANGFLOW_AUTO_LOGIN="false"
export LANGFLOW_SUPERUSER="admin"
# Password comes from HF Space secret — never hardcode credentials here

echo "[startup] python  : $(which python3)"
echo "[startup] langflow: $(which langflow 2>/dev/null || echo NOT FOUND)"
echo "[startup] port    : $LANGFLOW_PORT"

# Start Langflow in background (stdout/stderr visible in Render logs)
python3 -m langflow run \
    --host "$LANGFLOW_HOST" \
    --port "$LANGFLOW_PORT" \
    --components-path /app/custom_components \
    --workers 1 &
LF_PID=$!

# Wait up to 3 minutes for the health endpoint to respond
echo "[startup] Waiting for Langflow..."
READY=0
for i in $(seq 1 90); do
    sleep 2
    if curl -sf "http://localhost:$LANGFLOW_PORT/health" >/dev/null 2>&1; then
        echo "[startup] Langflow ready after $((i * 2))s"
        READY=1
        break
    fi
done

if [ "$READY" -eq 1 ]; then
    # Auto-import the Flaky Test Analyzer flow on first boot
    LF_PASS="${LANGFLOW_SUPERUSER_PASSWORD:-langflow}"
    TOKEN=$(curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/login" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin&password=${LF_PASS}" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

    if [ -n "$TOKEN" ]; then
        EXISTING=$(curl -sf "http://localhost:$LANGFLOW_PORT/api/v1/flows" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null \
            | python3 -c "import sys,json; flows=json.load(sys.stdin); print(any(f.get('name')=='Flaky Test Analyzer' for f in flows))" \
            2>/dev/null || echo "False")

        if [ "$EXISTING" != "True" ]; then
            curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/flows/upload/" \
                -H "Authorization: Bearer $TOKEN" \
                -F "file=@/app/flows/flaky_analyzer.langflow.json" >/dev/null 2>&1 \
                && echo "[startup] Flow imported." \
                || echo "[startup] Flow import failed (non-fatal)."
        else
            echo "[startup] Flow already present."
        fi
    fi
else
    echo "[startup] Langflow did not become ready — check logs above for errors."
fi

# Keep container alive by waiting on the Langflow process
wait $LF_PID
