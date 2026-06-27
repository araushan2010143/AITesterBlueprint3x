#!/bin/bash
set -e

# Start Langflow in the background so we can import the flow after boot
langflow run --host 0.0.0.0 --port 7860 &
LF_PID=$!

# Wait until the API is ready (up to 60 seconds)
echo "[entrypoint] Waiting for Langflow to start..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:7860/health > /dev/null 2>&1; then
        echo "[entrypoint] Langflow ready after ${i}s"
        break
    fi
    sleep 1
done

# Auto-import the Flaky Test Analyzer flow if it does not already exist
TOKEN=$(curl -sf -X POST http://localhost:7860/api/v1/login \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=langflow&password=langflow" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || true)

if [ -n "$TOKEN" ]; then
    EXISTING=$(curl -sf http://localhost:7860/api/v1/flows \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null \
        | python3 -c "import sys,json; flows=json.load(sys.stdin); print(any(f.get('name')=='Flaky Test Analyzer' for f in flows))" 2>/dev/null || echo "False")

    if [ "$EXISTING" != "True" ]; then
        echo "[entrypoint] Importing Flaky Test Analyzer flow..."
        curl -sf -X POST http://localhost:7860/api/v1/flows/upload/ \
            -H "Authorization: Bearer $TOKEN" \
            -F "file=@/app/flows/flaky_analyzer.langflow.json" > /dev/null 2>&1 && \
            echo "[entrypoint] Flow imported." || \
            echo "[entrypoint] Flow import failed (non-fatal)."
    else
        echo "[entrypoint] Flow already present, skipping import."
    fi
else
    echo "[entrypoint] Could not authenticate — skipping flow import."
fi

# Hand off to the Langflow process
wait $LF_PID
