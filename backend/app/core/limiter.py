"""Shared slowapi limiter.

Lives in its own module (not app.main) so route modules can import it for
per-route @limiter.limit(...) decorators without a circular import.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
