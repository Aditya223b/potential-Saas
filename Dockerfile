# ─── Build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# System deps for pdfplumber (needs Pillow which needs libjpeg/zlib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

# Minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create runtime directories with proper permissions
RUN mkdir -p uploads reports && chmod -R 777 uploads reports

# Hugging Face uses 7860, Railway injects $PORT dynamically
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-7860}/health || exit 1

# Shell form (not JSON array) so $PORT is expanded at runtime
CMD gunicorn app:app \
    --bind 0.0.0.0:${PORT:-7860} \
    --workers 2 \
    --threads 4 \
    --timeout 300 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile - \
    --log-level info
