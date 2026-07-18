#!/bin/bash
# Starts the FastAPI backend locally and opens an ngrok tunnel.
# The public URL printed at the end can be pasted into Vercel env vars
# or used directly in the frontend .env.local file.

set -e

BACKEND_DIR="$(dirname "$0")/backend"
PORT=8000

echo ""
echo "  QA Intelligence Platform — Dev Tunnel"
echo "  ======================================"
echo ""

# 1. Start backend in background
echo "  [1/3] Starting FastAPI backend on port $PORT..."
cd "$BACKEND_DIR"
uvicorn main:app --host 0.0.0.0 --port $PORT --reload &
BACKEND_PID=$!
echo "        backend PID: $BACKEND_PID"

# 2. Wait for backend to be ready
echo "  [2/3] Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
    echo "        Backend ready ✓"
    break
  fi
  sleep 1
done

# 3. Start ngrok tunnel
echo "  [3/3] Opening ngrok tunnel..."
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  Copy the https:// URL below into Vercel:       │"
echo "  │  Project → Settings → Environment Variables     │"
echo "  │  NEXT_PUBLIC_API_URL = https://xxxx.ngrok-free.app │"
echo "  └─────────────────────────────────────────────────┘"
echo ""

# Trap Ctrl+C to kill backend too
trap "kill $BACKEND_PID 2>/dev/null; echo ''; echo '  Stopped.'; exit 0" INT TERM

ngrok http $PORT --log=stdout | grep --line-buffered "url="
