#!/bin/bash
# No set -e — we handle errors manually so partial failures don't kill startup
export PATH="/app/.venv/bin:$PATH"
export LANGFLOW_PORT="${PORT:-7860}"
export LANGFLOW_HOST="0.0.0.0"
export LANGFLOW_AUTO_LOGIN="true"
export LANGFLOW_SKIP_AUTH_AUTO_LOGIN="true"
export LANGFLOW_SUPERUSER="langflow"
export LANGFLOW_SUPERUSER_PASSWORD="langflow"

echo "[startup] port: $LANGFLOW_PORT"

python3 -m langflow run \
    --host "$LANGFLOW_HOST" \
    --port "$LANGFLOW_PORT" \
    --components-path /app/custom_components \
    --workers 1 &
LF_PID=$!

echo "[startup] Waiting for Langflow..."
READY=0
for i in $(seq 1 90); do
    sleep 2
    if curl -sf "http://localhost:$LANGFLOW_PORT/health" >/dev/null 2>&1; then
        echo "[startup] Ready after $((i*2))s"
        READY=1
        break
    fi
done

if [ "$READY" -eq 1 ]; then
    sleep 5

    TOKEN=$(curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/login" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=langflow&password=langflow" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
    TOKEN="${TOKEN:-}"

    if [ -n "$TOKEN" ]; then
        echo "[startup] Authenticated. Clearing old flows..."

        # Get all flow IDs and delete them one by one
        curl -sf "http://localhost:$LANGFLOW_PORT/api/v1/flows" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null \
            | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    flows = data if isinstance(data, list) else data.get('flows', [])
    for f in flows:
        fid = f.get('id','')
        if fid:
            print(fid)
except Exception as e:
    pass
" 2>/dev/null > /tmp/flow_ids.txt || true

        if [ -s /tmp/flow_ids.txt ]; then
            while IFS= read -r FID; do
                if [ -n "$FID" ]; then
                    curl -sf -X DELETE \
                        "http://localhost:$LANGFLOW_PORT/api/v1/flows/$FID" \
                        -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
                    echo "[startup] Deleted flow: $FID"
                fi
            done < /tmp/flow_ids.txt
        else
            echo "[startup] No existing flows to delete."
        fi

        # Write flow JSON to temp file (avoids shell variable limits with large JSON)
        python3 << 'PYEOF'
import json, sys
try:
    with open('/app/flows/bug_triage_agent.langflow.json') as f:
        d = json.load(f)
    d.pop('id', None)
    with open('/tmp/import_flow.json', 'w') as out:
        json.dump(d, out)
    print('[startup] Flow JSON written to /tmp/import_flow.json (' + str(len(json.dumps(d))) + ' bytes)')
except Exception as e:
    print('[startup] ERROR writing flow JSON:', e)
    sys.exit(0)
PYEOF

        if [ -s /tmp/import_flow.json ]; then
            RESULT=$(curl -sf -X POST "http://localhost:$LANGFLOW_PORT/api/v1/flows/" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                --data-binary @/tmp/import_flow.json 2>/dev/null \
                | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('OK:', d.get('name','?'), '| id:', d.get('id','?')[:8])
except:
    print('PARSE_ERROR')
" 2>/dev/null)
            echo "[startup] Import result: ${RESULT:-CURL_FAILED}"
        else
            echo "[startup] Flow JSON file empty — skipping import."
        fi
    else
        echo "[startup] Auth failed — skipping flow import."
    fi
else
    echo "[startup] Langflow did not become ready."
fi

echo "[startup] Handing off to Langflow process (PID $LF_PID)..."
wait $LF_PID
