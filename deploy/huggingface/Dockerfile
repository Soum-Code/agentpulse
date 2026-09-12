# AgentPulse on Hugging Face Spaces.
#
# Spaces run one container on one port, so this image carries the dashboard
# build, the API and the evaluation worker together. The API serves the SPA
# from AGENTPULSE_STATIC_DIR and the worker runs beside it.

# ---- Stage 1: build the dashboard -------------------------------------------
FROM node:20-slim AS dashboard

WORKDIR /ui
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY dashboard/ .
# Same-origin: the SPA is served by the API, so it calls /v1/* on its own host.
ENV VITE_API_URL=""
# local_dev_mode only exempts GET; POST always needs a key, so the Lab cannot
# work without one in the bundle. A static SPA cannot hold a secret anyway, so
# this uses the repository's documented default rather than pretending
# otherwise. The Space README says so plainly.
ENV VITE_API_KEY="change-me-to-a-secure-key"
RUN npm run build

# ---- Stage 2: python dependencies -------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

# CPU-only torch, from PyTorch's own index. The default resolver pulls the
# CUDA build (~1.5GB of nvidia wheels) for a stack that never touches a GPU.
RUN pip install --no-cache-dir --timeout=180 --retries=5 \
    --index-url https://download.pytorch.org/whl/cpu torch

COPY backend/pyproject.toml backend/README.md ./
COPY backend/app/ app/
RUN pip install --no-cache-dir --timeout=180 --retries=5 .

# ---- Stage 3: runtime --------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /venv /venv
COPY backend/app/ app/
COPY --from=dashboard /ui/dist /app/static

COPY start.sh /app/start.sh
COPY seed_demo.py /app/seed_demo.py

# Spaces run as uid 1000 and the process must own everything it writes:
# the SQLite directory, and the model cache the worker downloads into.
RUN chmod +x /app/start.sh && \
    mkdir -p /data /models && \
    useradd --create-home --uid 1000 agentpulse && \
    chown -R agentpulse:agentpulse /data /models /app
USER agentpulse

ENV PATH="/venv/bin:$PATH" \
    HOME=/home/agentpulse \
    HF_HOME=/models \
    AGENTPULSE_DATABASE_URL=sqlite+aiosqlite:////data/agentpulse.db \
    AGENTPULSE_MODEL_CACHE_DIR=/models \
    AGENTPULSE_STATIC_DIR=/app/static \
    AGENTPULSE_HOST=0.0.0.0 \
    AGENTPULSE_PORT=7860 \
    AGENTPULSE_LOCAL_DEV_MODE=true

EXPOSE 7860

CMD ["/app/start.sh"]
