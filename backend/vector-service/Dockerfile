FROM python:3.11-slim@sha256:e031123e3d85762b141ad1cbc56452ba69c6e722ebf2f042cc0dc86c47c0d8b3 AS builder

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv

RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install system dependencies for building native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.lock ./
# Pin a CPU-only PyTorch wheel before installing sentence-transformers.  PyPI's
# default torch distribution may pull multi-gigabyte CUDA dependencies even on
# CPU-only Docker hosts, which makes local and production builds unreliable.
RUN pip install --no-cache-dir --retries 5 --timeout 120 \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.13.0+cpu \
    && pip install --no-cache-dir --retries 5 --timeout 120 -r requirements.lock \
    && pip check

# Pre-download the embedding model into the image
ENV HF_HOME=/app/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/huggingface/sentence-transformers \
    XDG_CACHE_HOME=/app/.cache
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-zh-v1.5')"

FROM python:3.11-slim@sha256:e031123e3d85762b141ad1cbc56452ba69c6e722ebf2f042cc0dc86c47c0d8b3 AS runtime

WORKDIR /app

ENV HF_HOME=/app/.cache/huggingface \
    HOME=/home/app \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/huggingface/sentence-transformers \
    XDG_CACHE_HOME=/app/.cache \
    PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app/.cache /app/.cache
COPY --chown=1000:1000 server.py .

# Keep the downloaded model cache and the persistent index writable by the
# unprivileged process. Docker named volumes inherit /app/data ownership on
# first use; Kubernetes supplies the same guarantee with fsGroup 1000.
RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid app --create-home --home-dir /home/app app \
    && mkdir -p /app/data \
    && chown -R app:app /app /home/app

EXPOSE 5050

USER app

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5050"]
