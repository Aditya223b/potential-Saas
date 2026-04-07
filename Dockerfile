# ─── Build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

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

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /install /usr/local
COPY . .

# Create runtime directories
RUN mkdir -p uploads reports && chmod -R 777 uploads reports

# Make startup script executable
RUN chmod +x start.sh

# Railway dynamically assigns $PORT — do NOT hardcode it
EXPOSE 8080

# Use the startup script so $PORT is reliably expanded at runtime
CMD ["/bin/sh", "start.sh"]
