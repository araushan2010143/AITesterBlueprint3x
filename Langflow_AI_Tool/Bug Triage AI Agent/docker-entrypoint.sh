#!/bin/bash
set -e

export PATH="/app/.venv/bin:$PATH"
export LANGFLOW_PORT="${PORT:-7860}"
export LANGFLOW_HOST="0.0.0.0"
export LANGFLOW_AUTO_LOGIN="true"
export LANGFLOW_SKIP_AUTH_AUTO_LOGIN="true"
export LANGFLOW_SUPERUSER="langflow"
export LANGFLOW_SUPERUSER_PASSWORD="langflow"

echo "[startup] python  : $(which python3)"
echo "[startup] langflow: $(which langflow 2>/dev/null || echo NOT FOUND)"
echo "[startup] port    : $LANGFLOW_PORT"

python3 -m langflow run \
    --host "$LANGFLOW_HOST" \
    --port "$LANGFLOW_PORT" \
    --components-path /app/custom_components \
    --workers 1 &
LF_PID=$!

echo "[startup] Waiting for Langflow to be ready..."
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
    TOKEN=$(curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/login" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=langflow&password=langflow" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

    if [ -n "$TOKEN" ]; then
        EXISTING=$(curl -sf "http://localhost:$LANGFLOW_PORT/api/v1/flows" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null \
            | python3 -c "import sys,json; flows=json.load(sys.stdin); flows=flows if isinstance(flows,list) else flows.get('flows',[]); print(any(f.get('name')=='Universal Bug Triage AI Agent' for f in flows))" \
            2>/dev/null || echo "False")

        if [ "$EXISTING" != "True" ]; then
            curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/flows/upload/" \
                -H "Authorization: Bearer $TOKEN" \
                -F "file=@/app/flows/bug_triage_agent.langflow.json" >/dev/null 2>&1 \
                && echo "[startup] Bug Triage flow imported." \
                || echo "[startup] Flow import failed (non-fatal — import manually via UI)."
        else
            echo "[startup] Bug Triage flow already present."
        fi
    else
        echo "[startup] Could not obtain auth token — skipping flow auto-import."
    fi
else
    echo "[startup] Langflow did not become ready — check logs above."
fi

wait $LF_PID
