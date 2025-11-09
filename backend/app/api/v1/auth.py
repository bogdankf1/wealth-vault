"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
import httpx

from app.core.database import get_db
from app.core.security import create_access_token
from app.core.config import settings
from app.core.permissions import get_current_user
from app.models.user import User
from app.models.tier import Tier
from app.schemas.user import GoogleAuthRequest, TokenResponse, UserResponse, OAuthUserInfo

router = APIRouter(prefix="/auth", tags=["Authentication"])


async def get_starter_tier(db: AsyncSession) -> Tier:
    """Get the starter tier for new users."""
    result = await db.execute(select(Tier).where(Tier.name == "starter"))
    tier = result.scalar_one_or_none()
    if not tier:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Starter tier not found. Please run database migrations."
        )
    return tier


async def verify_google_token(token: str) -> OAuthUserInfo:
    """
    Verify Google OAuth token and extract user info.

    Args:
        token: Google OAuth ID token

    Returns:
        User information from Google

    Raises:
        HTTPException: If token verification fails
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid Google token"
                )

            data = response.json()

            # Verify the token is for our app
            if data.get("aud") != settings.GOOGLE_CLIENT_ID:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token not issued for this application"
                )

            return OAuthUserInfo(
                email=data["email"],
                name=data.get("name"),
                picture=data.get("picture"),
                sub=data["sub"]
            )
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to verify token: {str(e)}"
        )


@router.post("/google", response_model=TokenResponse)
async def google_oauth(
    auth_request: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    """
    Authenticate user with Google OAuth.

    Args:
        auth_request: Google OAuth request with token
        db: Database session

    Returns:
        JWT access token and user information
    """
    # Verify Google token
    user_info = await verify_google_token(auth_request.token)

    # Check if user exists
    result = await db.execute(
        select(User).where(User.google_id == user_info.sub)
    )
    user = result.scalar_one_or_none()

    # Create new user if doesn't exist
    if not user:
        # Get starter tier
        starter_tier = await get_starter_tier(db)

        # Create new user
        user = User(
            email=user_info.email,
            name=user_info.name,
            avatar_url=user_info.picture,
            google_id=user_info.sub,
            tier_id=starter_tier.id
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Load tier relationship
    await db.refresh(user, ["tier"])

    # Create JWT token
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "tier": user.tier.name if user.tier else None
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Prepare response
    user_response = UserResponse.model_validate(user)

    return TokenResponse(
        access_token=access_token,
        user=user_response
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get current user information.

    Args:
        current_user: Current authenticated user

    Returns:
        User information
    """
    return UserResponse.model_validate(current_user)


@router.get("/me/features")
async def get_current_user_features(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Get current user's enabled features based on their tier.

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        Dictionary of feature keys and their enabled status
    """
    if not current_user.tier:
        return {"features": {}}

    # Re-query user with proper eager loading for nested relationships
    from sqlalchemy.orm import selectinload
    from app.models.tier import Tier, TierFeature, Feature

    result = await db.execute(
        select(User)
        .options(
            selectinload(User.tier).selectinload(Tier.tier_features).selectinload(TierFeature.feature)
        )
        .where(User.id == current_user.id)
    )
    user = result.scalar_one()

    # Build a dictionary of enabled features
    enabled_features = {}
    for tier_feature in user.tier.tier_features:
        if tier_feature.feature and tier_feature.enabled:
            enabled_features[tier_feature.feature.key] = {
                "enabled": True,
                "limit": tier_feature.limit_value,
                "name": tier_feature.feature.name,
                "module": tier_feature.feature.module
            }

    return {"features": enabled_features}
