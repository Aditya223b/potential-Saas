import time
import pytest
from rate_limiter import RateLimiter

def test_rate_limiter_basic():
    """Case 91: Allows below limits."""
    rl = RateLimiter()
    # Mock limits for easier testing
    import rate_limiter
    rate_limiter._LIMIT_PER_HOUR = 2
    
    # First and second should pass
    allowed, _ = rl.check("u1")
    assert allowed is True
    rl.record("u1")
    
    allowed, _ = rl.check("u1")
    assert allowed is True
    rl.record("u1")
    
    # Third should fail
    allowed, reason = rl.check("u1")
    assert allowed is False
    assert "Hourly limit reached" in reason

def test_rate_limiter_pruning():
    """Case 94: Pruning of timestamps older than 24 hours."""
    rl = RateLimiter()
    old_time = time.time() - 90000 # 25 hours ago
    rl._timestamps["u2"].append(old_time)
    
    rl._prune("u2")
    assert len(rl._timestamps["u2"]) == 0

def test_rate_limiter_anonymous():
    """Case 95: Unauthenticated users are not rate-limited (handled by auth check anyway)."""
    rl = RateLimiter()
    allowed, _ = rl.check(None)
    assert allowed is True

def test_rate_limiter_status():
    """Case 63: Status return for UI."""
    rl = RateLimiter()
    rl.record("u3")
    stats = rl.status("u3")
    assert stats["hourly_used"] == 1
    assert stats["daily_used"] == 1
