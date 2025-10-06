"""
Permission system with decorators for role and tier-based access control.
"""
from functools import wraps
from typing import Callable, Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.tier import Feature, TierFeature
from app.core.exceptions import ForbiddenException, TierLimitException


async def get_current_user(
    token: str,
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user from token.

    Args:
        token: JWT token
        db: Database session

    Returns:
        Current user

    Raises:
        HTTPException: If user not found or token invalid
    """
    from app.core.security import verify_token

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


def require_role(required_role: UserRole) -> Callable:
    """
    Decorator to require specific role.

    Args:
        required_role: Required user role

    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, current_user: User = Depends(get_current_user), **kwargs):
            if current_user.role != required_role:
                raise ForbiddenException(
                    message=f"This action requires {required_role.value} role"
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator


def admin_only(func: Callable) -> Callable:
    """
    Decorator to restrict endpoint to admins only.

    Args:
        func: Function to decorate

    Returns:
        Decorated function
    """
    @wraps(func)
    async def wrapper(*args, current_user: User = Depends(get_current_user), **kwargs):
        if not current_user.is_admin():
            raise ForbiddenException(message="Admin access required")
        return await func(*args, current_user=current_user, **kwargs)
    return wrapper


async def check_feature_access(
    user: User,
    feature_key: str,
    db: AsyncSession
) -> bool:
    """
    Check if user has access to a feature.

    Args:
        user: User to check
        feature_key: Feature identifier
        db: Database session

    Returns:
        True if user has access
    """
    if user.is_admin():
        return True

    if not user.tier:
        return False

    # Query to check if feature is enabled for user's tier
    result = await db.execute(
        select(TierFeature)
        .join(Feature)
        .where(
            TierFeature.tier_id == user.tier_id,
            Feature.key == feature_key,
            TierFeature.enabled == True
        )
    )
    tier_feature = result.scalar_one_or_none()

    return tier_feature is not None


def require_feature(feature_key: str) -> Callable:
    """
    Decorator to require specific feature access.

    Args:
        feature_key: Feature identifier

    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(
            *args,
            current_user: User = Depends(get_current_user),
            db: AsyncSession = Depends(get_db),
            **kwargs
        ):
            has_access = await check_feature_access(current_user, feature_key, db)
            if not has_access:
                tier_name = current_user.tier.name if current_user.tier else "none"
                raise TierLimitException(
                    message=f"This feature requires a higher tier subscription",
                    current_tier=tier_name,
                    required_tier="growth"  # This should be dynamic based on feature
                )
            return await func(*args, current_user=current_user, db=db, **kwargs)
        return wrapper
    return decorator


async def check_usage_limit(
    user: User,
    feature_key: str,
    current_count: int,
    db: AsyncSession
) -> tuple[bool, Optional[int]]:
    """
    Check if user has exceeded usage limit for a feature.

    Args:
        user: User to check
        feature_key: Feature identifier
        current_count: Current usage count
        db: Database session

    Returns:
        Tuple of (has_capacity, limit_value)
    """
    if user.is_admin():
        return True, None

    if not user.tier:
        return False, 0

    result = await db.execute(
        select(TierFeature)
        .join(Feature)
        .where(
            TierFeature.tier_id == user.tier_id,
            Feature.key == feature_key,
            TierFeature.enabled == True
        )
    )
    tier_feature = result.scalar_one_or_none()

    if not tier_feature:
        return False, 0

    # If no limit is set (None), unlimited usage
    if tier_feature.limit_value is None:
        return True, None

    # Check if current count is below limit
    has_capacity = current_count < tier_feature.limit_value
    return has_capacity, tier_feature.limit_value
