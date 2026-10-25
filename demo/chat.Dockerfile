# The public chat service, demo/chat_server.py. The build context is the repository root:
#
#   docker build -f demo/chat.Dockerfile -t agentpulse-chat .
#
# On the Azure VM it is built and run as the `chat` service of deploy/azure/docker-compose.azure.yml
# (see deploy/azure/README.md, "The live chat").
#
# Nothing secret goes into the image: provider keys and AGENTPULSE_API_KEY arrive as runtime
# environment variables. No model weights either: the model cache is mounted at /models, the
# same cache the worker downloads into.

# ── Builder: the packages, into a venv ──
FROM python:3.11-slim AS builder

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

# CPU-only torch first, from PyTorch's CPU index and at backend/Dockerfile's pin. Left to the
# default resolver, sentence-transformers pulls in the CUDA build, about 1.5 GB more.
RUN pip install --no-cache-dir --timeout=180 --retries=5 \
    --index-url https://download.pytorch.org/whl/cpu torch==2.14.0

COPY backend/constraints.txt /build/constraints.txt
COPY demo/requirements-chat.txt /build/requirements-chat.txt
RUN pip install --no-cache-dir --timeout=180 --retries=5 \
    -c /build/constraints.txt -r /build/requirements-chat.txt

# ── Runtime: no build files, non-root ──
FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /venv /venv

# Only what the service imports. The SDK is used from source (chat_server.py puts sdk/src on
# the import path). From the backend, retrieval needs grounding.py alone, for get_embedding;
# the two package __init__ files it sits in hold no code.
COPY sdk/src/ sdk/src/
COPY backend/app/__init__.py backend/app/__init__.py
COPY backend/app/services/__init__.py backend/app/services/__init__.py
COPY backend/app/services/grounding.py backend/app/services/grounding.py
COPY demo/chat_server.py demo/chat_providers.py demo/chat_guard.py demo/
COPY demo/workflows/__init__.py demo/workflows/retrieval.py demo/workflows/

# The same user id as the backend image, so the model cache the worker wrote is readable.
RUN useradd --create-home --uid 1000 agentpulse && mkdir -p /models /control && \
    chown agentpulse:agentpulse /models /control
USER agentpulse

ENV PATH="/venv/bin:$PATH" \
    PYTHONPATH=/app/backend \
    PYTHONUNBUFFERED=1 \
    AGENTPULSE_MODEL_CACHE_DIR=/models \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    OMP_NUM_THREADS=1 \
    CHAT_PAUSE_FILE=/control/paused

EXPOSE 8100

# --no-proxy-headers: the service reads X-Forwarded-For itself, and only from the proxies in
# CHAT_TRUSTED_PROXIES (demo/chat_guard.py). One worker, because the limits are counted in
# this one process's memory.
CMD ["python", "-m", "uvicorn", "demo.chat_server:app", "--host", "0.0.0.0", "--port", "8100", \
     "--no-proxy-headers", "--workers", "1"]
