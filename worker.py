import os
import sys
import logging
from redis import Redis
from rq import Worker, Queue
import sentry_sdk
from config import REDIS_URL, SENTRY_DSN

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if SENTRY_DSN:
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=1.0)
    logging.info("Sentry initialized in Worker.")

redis_conn = Redis.from_url(REDIS_URL)

# Job queue data is ephemeral — disable RDB disk snapshots so Railway's
# volume pressure (stop-writes-on-bgsave-error) cannot block write commands.
try:
    redis_conn.config_set('save', '')                      # disable all RDB save triggers
    redis_conn.config_set('stop-writes-on-bgsave-error', 'no')  # safety net
    logging.info("Redis: RDB persistence disabled (ephemeral job data).")
except Exception as _redis_cfg_err:
    logging.warning(f"Could not configure Redis persistence settings: {_redis_cfg_err}")

if __name__ == '__main__':
    qs = sys.argv[1:] or ['default', 'financial_analyzer']
    w = Worker(qs, connection=redis_conn)
    logging.info(f"Starting RQ Worker reading queues: {', '.join(qs)}")
    w.work()
