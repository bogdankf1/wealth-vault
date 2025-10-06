"""
Pydantic schemas for User model.
"""
from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    name: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a user."""
    google_id: Optional[str] = None
    apple_id: Optional[str] = None
    avatar_url: Optional[str] = None


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class TierInfo(BaseModel):
    """Tier information for user response."""
    id: UUID
    name: str
    display_name: str

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    """Schema for user response."""
    id: UUID
    role: str
    avatar_url: Optional[str] = None
    tier: Optional[TierInfo] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class GoogleAuthRequest(BaseModel):
    """Schema for Google OAuth request."""
    token: str = Field(..., description="Google OAuth ID token")


class OAuthUserInfo(BaseModel):
    """Schema for OAuth user information."""
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    sub: str = Field(..., description="OAuth provider user ID")
