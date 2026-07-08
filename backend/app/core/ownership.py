"""
Shared helper for the "fetch a user-owned row or 404" guard.
"""
from typing import Awaitable, Callable, Optional, TypeVar

from fastapi import HTTPException

T = TypeVar("T")


async def get_owned_or_404(
    fetcher: Callable[..., Awaitable[Optional[T]]],
    *args,
    detail: str = "Not found",
    status_code: int = 404,
    **kwargs,
) -> T:
    """
    Fetch a row via ``fetcher`` (typically ``service.get_x(db, obj_id, user_id)``)
    and raise ``HTTPException`` if it does not exist or is not owned by the user.

    Behaviour matches the inline guard it replaces: the fetcher performs the
    ownership-scoped lookup and returns the row or ``None``; when ``None`` is
    returned, an HTTP error with the given ``detail`` and ``status_code`` is raised.
    """
    obj = await fetcher(*args, **kwargs)
    if obj is None:
        raise HTTPException(status_code=status_code, detail=detail)
    return obj
