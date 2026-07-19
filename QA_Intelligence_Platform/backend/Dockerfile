FROM python:3.11-slim

# System deps for torch + document parsers
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build context = QA_Intelligence_Platform/ (Render root dir)
# so all COPY paths must be prefixed with backend/

# Install Python deps first (layer cached separately from code)
COPY backend/pyproject.toml .
RUN pip install --no-cache-dir -e "." 2>&1

# Pre-download BAAI/bge-m3 and bge-reranker-large into the image
# so cold starts are instant — no HuggingFace download at runtime
RUN python - <<'EOF'
from huggingface_hub import snapshot_download
print("Downloading BAAI/bge-m3 ...")
snapshot_download("BAAI/bge-m3")
print("Downloading BAAI/bge-reranker-large ...")
snapshot_download("BAAI/bge-reranker-large")
print("Models cached.")
EOF

# Copy application code
COPY backend/ .

# Render injects $PORT at runtime
EXPOSE 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
