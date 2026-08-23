# ── Builder: compiles/installs production deps only (no [dev] extras) ──
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Install the CPU-only torch build first, from PyTorch's own CPU wheel index.
# Left to the default resolver, `sentence-transformers`/`transformers` pull in
# the full CUDA build (~1.5GB of torch + nvidia-cudnn/cublas/etc. wheels) even
# though this service only ever runs CPU inference (onnxruntime/torch on CPU,
# no GPU anywhere in this stack) — that download is what was timing out.
RUN pip install --no-cache-dir --timeout=180 --retries=5 \
    --index-url https://download.pytorch.org/whl/cpu torch

COPY pyproject.toml README.md .
COPY app/ app/
# torch is already satisfied by the CPU wheel above, so this resolves the
# rest of pyproject.toml's deps without pulling in a second (CUDA) torch.
RUN pip install --no-cache-dir --timeout=180 --retries=5 .

# ── Runtime: slim image, no compiler, non-root user ──
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /venv /venv
COPY app/ app/

RUN mkdir -p /data /models && \
    useradd --create-home --uid 1000 agentpulse && \
    chown -R agentpulse:agentpulse /data /models /app
USER agentpulse

ENV PATH="/venv/bin:$PATH"
ENV AGENTPULSE_DATABASE_URL=sqlite+aiosqlite:////data/agentpulse.db
ENV AGENTPULSE_MODEL_CACHE_DIR=/models
ENV AGENTPULSE_HOST=0.0.0.0
ENV AGENTPULSE_PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
