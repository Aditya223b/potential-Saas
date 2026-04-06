"""
Rate Limiter — per-user AI usage control.

Tracks analysis attempts per user using in-memory sliding windows.
Limits are configurable via .env:
  RATE_LIMIT_PER_HOUR  (default: 5)
  RATE_LIMIT_PER_DAY   (default: 20)

Usage:
    from rate_limiter import rate_limiter
    allowed, reason = rate_limiter.check(user_id)
    if not allowed:
        return jsonify({"error": reason}), 429
    rate_limiter.record(user_id)
"""

import time
from collections import defaultdict
from config import _get

# Configurable limits
_LIMIT_PER_HOUR: int = int(_get("RATE_LIMIT_PER_HOUR", "5"))
_LIMIT_PER_DAY:  int = int(_get("RATE_LIMIT_PER_DAY",  "20"))

_HOUR = 3600
_DAY  = 86400


class RateLimiter:
    def __init__(self):
        # user_id → list of unix timestamps (one per analysis started)
        self._timestamps: dict[str, list[float]] = defaultdict(list)

    def _prune(self, user_id: str) -> None:
        """Drop timestamps older than 24 hours."""
        cutoff = time.time() - _DAY
        self._timestamps[user_id] = [
            t for t in self._timestamps[user_id] if t > cutoff
        ]

    def check(self, user_id: str) -> tuple[bool, str]:
        """
        Returns (True, "") if the user is within limits,
        or (False, reason_message) if they have hit a limit.
        """
        if not user_id:
            return True, ""  # unauthenticated users are not rate-limited here

        self._prune(user_id)
        now = time.time()
        timestamps = self._timestamps[user_id]

        hourly = sum(1 for t in timestamps if t > now - _HOUR)
        daily  = len(timestamps)

        if hourly >= _LIMIT_PER_HOUR:
            reset_in = int((min(t for t in timestamps if t > now - _HOUR) + _HOUR) - now)
            mins = reset_in // 60 + 1
            return False, (
                f"Hourly limit reached ({_LIMIT_PER_HOUR} analyses/hour). "
                f"Try again in {mins} minute{'s' if mins != 1 else ''}."
            )

        if daily >= _LIMIT_PER_DAY:
            reset_in = int((min(timestamps) + _DAY) - now)
            hrs = reset_in // 3600 + 1
            return False, (
                f"Daily limit reached ({_LIMIT_PER_DAY} analyses/day). "
                f"Try again in {hrs} hour{'s' if hrs != 1 else ''}."
            )

        return True, ""

    def record(self, user_id: str) -> None:
        """Record a new analysis attempt for the user."""
        if user_id:
            self._timestamps[user_id].append(time.time())

    def status(self, user_id: str) -> dict:
        """Return current usage stats for a user."""
        if not user_id:
            return {"hourly_used": 0, "daily_used": 0,
                    "hourly_limit": _LIMIT_PER_HOUR, "daily_limit": _LIMIT_PER_DAY}

        self._prune(user_id)
        now = time.time()
        timestamps = self._timestamps[user_id]
        hourly = sum(1 for t in timestamps if t > now - _HOUR)
        return {
            "hourly_used":  hourly,
            "daily_used":   len(timestamps),
            "hourly_limit": _LIMIT_PER_HOUR,
            "daily_limit":  _LIMIT_PER_DAY,
        }


# Singleton instance used across the app
rate_limiter = RateLimiter()
