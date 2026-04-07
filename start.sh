#!/bin/sh
# Railway injects $PORT at runtime. Fall back to 8080 if not set.
PORT="${PORT:-8080}"
echo "Starting gunicorn on port $PORT..."
exec gunicorn app:app \
    --bind "0.0.0.0:$PORT" \
    --workers 2 \
    --threads 4 \
    --timeout 300 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile - \
    --log-level info
