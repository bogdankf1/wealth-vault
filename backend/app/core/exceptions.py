"""
Custom exceptions for the application.
"""
from typing import Any, Optional, Dict


class WealthVaultException(Exception):
    """Base exception for all Wealth Vault exceptions."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundException(WealthVaultException):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=404, details=details)


class UnauthorizedException(WealthVaultException):
    """Raised when user is not authenticated."""

    def __init__(self, message: str = "Unauthorized", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=401, details=details)


class ForbiddenException(WealthVaultException):
    """Raised when user doesn't have permission."""

    def __init__(self, message: str = "Forbidden", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=403, details=details)


class BadRequestException(WealthVaultException):
    """Raised when request is invalid."""

    def __init__(self, message: str = "Bad request", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=400, details=details)


class ConflictException(WealthVaultException):
    """Raised when there's a conflict (e.g., duplicate resource)."""

    def __init__(self, message: str = "Conflict", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=409, details=details)


class TierLimitException(WealthVaultException):
    """Raised when user hits tier limit."""

    def __init__(
        self,
        message: str = "Tier limit exceeded",
        current_tier: str = "",
        required_tier: str = "",
        details: Optional[Dict[str, Any]] = None
    ):
        details = details or {}
        details.update({
            "current_tier": current_tier,
            "required_tier": required_tier
        })
        super().__init__(message, status_code=403, details=details)
