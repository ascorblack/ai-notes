"""Rate limiting middleware using slowapi."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

rate_limiter = limiter.limit("60/minute")
transcribe_limiter = limiter.limit("10/minute")
agent_limiter = limiter.limit("30/minute")
