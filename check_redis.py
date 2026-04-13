import os
import json
from rq import Queue
from redis import Redis
from app import redis_conn, AnalysisJob

q = Queue(connection=redis_conn)

print(f"Jobs in queue: {len(q)}")
print(f"Jobs in failed registry: {q.failed_job_registry.count}")

for job_id in q.failed_job_registry.get_job_ids()[-5:]:
    job = q.fetch_job(job_id)
    print(f"\n--- FAILED JOB {job_id} ---")
    print(job.exc_info)

# Let's also check the state of the active job
keys = redis_conn.keys("job_state:*")
for key in keys:
    data = redis_conn.get(key)
    state = json.loads(data)
    print(f"\n--- STATE {key} ---")
    print(f"Status: {state.get('status')}")
    print(f"Progress entries: {len(state.get('progress', []))}")
    print(f"Last progress: {state.get('progress', [{}])[-1].get('message')}")
    print(f"Error: {state.get('error')}")
