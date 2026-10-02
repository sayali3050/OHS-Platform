"""Small in-process sliding-window limiter. Adequate for a single API instance; swap for Redis when scaling out."""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.models import User


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True


def per_user_limit(limiter: SlidingWindowLimiter):
    def dep(user: User = Depends(get_current_user)) -> User:
        if not limiter.hit(f"user:{user.id}"):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Wait a minute and try again.")
        return user
    return dep


login_limiter = SlidingWindowLimiter(limit=10, window_seconds=60)
