#!/bin/sh
# Railway injects $PORT at runtime.
PORT="${PORT:-8080}"
echo "=== STARTUP DEBUG ==="
echo "PORT=$PORT"
echo "GEMINI_API_KEY set: $([ -n "$GEMINI_API_KEY" ] && echo YES || echo NO)"
echo "SUPABASE_URL set: $([ -n "$SUPABASE_URL" ] && echo YES || echo NO)"
echo "Python version: $(python3 --version)"
echo "Working dir: $(pwd)"
echo "Files: $(ls)"
echo "=== STARTING GUNICORN ==="
exec gunicorn app:app \
    --bind "0.0.0.0:$PORT" \
    --workers 1 \
    --threads 4 \
    --timeout 300 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile - \
    --log-level debug
