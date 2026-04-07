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

# Hugging Face Spaces REQUIRES port 7860
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# Start with gunicorn on port 7860
CMD ["gunicorn", "app:app", \
     "--bind", "0.0.0.0:7860", \
     "--workers", "2", \
     "--threads", "4", \
     "--timeout", "300", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
