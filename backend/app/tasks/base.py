"""
Base task class with common functionality for all Celery tasks.
"""
import logging
from celery import Task
from typing import Any, Optional
from datetime import datetime

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


class BaseTask(Task):
    """
    Base task class that provides:
    - Automatic retry on failure
    - Logging
    - Error handling
    - Database session management
    """

    # Default retry settings
    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600  # Max 10 minutes between retries
    retry_jitter = True
    max_retries = 3

    # Track task execution
    track_started = True

    def before_start(self, task_id: str, args: tuple, kwargs: dict) -> None:
        """Called before task starts executing."""
        logger.info(
            f"Task {self.name} [{task_id}] starting",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "args": str(args)[:200],
                "kwargs": str(kwargs)[:200],
            }
        )

    def on_success(self, retval: Any, task_id: str, args: tuple, kwargs: dict) -> None:
        """Called on successful task completion."""
        logger.info(
            f"Task {self.name} [{task_id}] completed successfully",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "result": str(retval)[:200] if retval else None,
            }
        )

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any
    ) -> None:
        """Called on task failure."""
        logger.error(
            f"Task {self.name} [{task_id}] failed: {exc}",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "exception": str(exc),
                "traceback": str(einfo),
            },
            exc_info=True
        )

    def on_retry(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any
    ) -> None:
        """Called when task is retried."""
        logger.warning(
            f"Task {self.name} [{task_id}] retrying due to: {exc}",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "exception": str(exc),
                "retry_count": self.request.retries,
            }
        )


def get_async_db_session():
    """
    Get an async database session for use in Celery tasks.

    Note: This creates a new session that must be properly closed.
    Use with async context manager in tasks.
    """
    from app.core.database import async_session_maker
    return async_session_maker()


async def run_in_session(coro_func, *args, **kwargs):
    """
    Helper to run an async function within a database session.

    Usage:
        result = await run_in_session(my_async_func, arg1, arg2)
    """
    async with get_async_db_session() as session:
        try:
            result = await coro_func(session, *args, **kwargs)
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise
