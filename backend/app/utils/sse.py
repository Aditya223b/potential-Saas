import json
import time
from typing import Generator
from app import get_job_object

def generate_progress_stream(job_id: str) -> Generator[str, None, None]:
    """Generator that yields SSE-formatted events for a running background job."""
    seen = 0
    heartbeat_interval = 15
    last_heartbeat = time.time()
    max_wait = 600
    start_time = time.time()

    while True:
        if time.time() - start_time > max_wait:
            yield f"data: {json.dumps({'step': 'timeout', 'message': 'SSE session timed out', 'done': True})}\n\n"
            return

        job = get_job_object(job_id)
        if not job:
            yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
            return

        current_progress = job.progress
        current_status = job.status

        if len(current_progress) > seen:
            for event in current_progress[seen:]:
                yield f"data: {json.dumps(event)}\n\n"
            seen = len(current_progress)
            last_heartbeat = time.time()

        if current_status == "awaiting_projection":
            yield f"data: {json.dumps({'step': 'awaiting_projection', 'status': current_status, 'done': True})}\n\n"
            return

        if current_status == "waiting_for_user":
            yield f"data: {json.dumps({'step': 'waiting_for_user', 'status': current_status, 'done': True})}\n\n"
            return

        if current_status in ("completed", "failed"):
            yield f"data: {json.dumps({'step': 'done', 'status': current_status, 'done': True})}\n\n"
            return

        if time.time() - last_heartbeat > heartbeat_interval:
            yield f": heartbeat\n\n"
            last_heartbeat = time.time()

        time.sleep(0.5)
