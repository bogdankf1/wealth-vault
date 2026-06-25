"""
Main FastAPI application.
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables from .env file
load_dotenv()

from app.core.config import settings
from app.core.logging_config import setup_logging, get_logger
from app.core.exceptions import WealthVaultException
from app.core.redis import close_redis
from app.api.v1.auth import router as auth_router
from app.modules.income.api import router as income_router
from app.modules.expenses.router import router as expenses_router
from app.modules.savings.router import router as savings_router
from app.modules.subscriptions.router import router as subscriptions_router
from app.modules.installments.router import router as installments_router
from app.modules.goals.router import router as goals_router
from app.modules.portfolio.router import router as portfolio_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.ai.router import router as ai_router
from app.modules.agent.router import router as agent_router
from app.modules.budgets.router import router as budgets_router
from app.modules.debts.router import router as debts_router
from app.modules.taxes.router import router as taxes_router
from app.modules.dashboard_layouts.api import router as dashboard_layouts_router
from app.modules.exports.router import router as exports_router
from app.modules.backups.router import router as backups_router
from app.modules.support.router import router as support_router
from app.api.v1.billing import router as billing_router
from app.api.v1.preferences import router as preferences_router
from app.api.v1.admin.users import router as admin_users_router
from app.api.v1.admin.tiers import router as admin_tiers_router
from app.api.v1.admin.config import router as admin_config_router
from app.api.v1.admin.analytics import router as admin_analytics_router
from app.modules.currency.router import router as currency_router
from app.modules.notifications.api import router as notifications_router
from app.modules.monobank.router import router as monobank_router

# Setup logging
setup_logging(debug=settings.DEBUG)
logger = get_logger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    logger.info("Starting Wealth Vault API...")
    logger.info(f"Version: {settings.APP_VERSION}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Import all module models to ensure SQLAlchemy can resolve relationships
    # Do this here to avoid circular imports
    try:
        from app.modules.income.models import IncomeSource  # noqa: F401
        from app.modules.expenses.models import Expense  # noqa: F401
        from app.modules.subscriptions.models import Subscription  # noqa: F401
        from app.modules.installments.models import Installment  # noqa: F401
        from app.modules.savings.models import SavingsAccount, BalanceHistory  # noqa: F401
        from app.modules.portfolio.models import PortfolioAsset  # noqa: F401
        from app.modules.goals.models import Goal  # noqa: F401
        from app.modules.budgets.models import Budget  # noqa: F401
        from app.modules.debts.models import Debt  # noqa: F401
        from app.modules.taxes.models import Tax  # noqa: F401
        from app.modules.dashboard_layouts.models import DashboardLayout  # noqa: F401
        from app.modules.backups.models import Backup  # noqa: F401
        from app.modules.support.models import SupportTopic, SupportMessage  # noqa: F401
        from app.modules.ai.models import AIInsight  # noqa: F401
        from app.modules.rag.models import ParsedDocument, DocumentEmbedding  # noqa: F401
        from app.models.user_preferences import UserPreferences  # noqa: F401
        from app.modules.currency.models import Currency, ExchangeRate  # noqa: F401
        from app.modules.notifications.models import Notification  # noqa: F401
        logger.info("All module models loaded successfully")

        # Register event handlers
        from app.core.event_handlers import register_all_handlers
        register_all_handlers()
        logger.info("Event handlers registered")
    except Exception as e:
        logger.error(f"Failed to load module models: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Wealth Vault API...")
    await close_redis()


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Ultimate personal finance management platform API",
    lifespan=lifespan
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
)


# Global exception handler
@app.exception_handler(WealthVaultException)
async def wealth_vault_exception_handler(
    request: Request,
    exc: WealthVaultException
) -> JSONResponse:
    """Handle custom Wealth Vault exceptions."""
    logger.error(f"WealthVaultException: {exc.message}", extra={"details": exc.details})
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.message,
            "details": exc.details,
            "status_code": exc.status_code
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    """Handle general exceptions."""
    logger.exception("Unhandled exception occurred", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "details": {} if not settings.DEBUG else {"message": str(exc)},
            "status_code": 500
        }
    )


# Health check endpoint
@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint with DB and Redis connectivity verification."""
    health: dict = {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "checks": {},
    }

    # Check database connectivity
    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        health["checks"]["database"] = "ok"
    except Exception as e:
        health["status"] = "degraded"
        health["checks"]["database"] = f"error: {str(e)}"
        logger.error(f"Health check: database unreachable: {e}")

    # Check Redis connectivity
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        await redis.ping()
        health["checks"]["redis"] = "ok"
    except Exception as e:
        health["status"] = "degraded"
        health["checks"]["redis"] = f"error: {str(e)}"
        logger.error(f"Health check: redis unreachable: {e}")

    return health


# Include routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(income_router, prefix="/api/v1")
app.include_router(expenses_router)
app.include_router(savings_router)
app.include_router(subscriptions_router)
app.include_router(installments_router)
app.include_router(goals_router)
app.include_router(portfolio_router)
app.include_router(dashboard_router)
app.include_router(ai_router, prefix="/api/v1")
app.include_router(agent_router, prefix="/api/v1")
app.include_router(budgets_router)
app.include_router(debts_router, prefix="/api/v1")
app.include_router(taxes_router, prefix="/api/v1")
app.include_router(dashboard_layouts_router, prefix="/api/v1")
app.include_router(exports_router, prefix="/api/v1")
app.include_router(backups_router, prefix="/api/v1")
app.include_router(support_router, prefix="/api/v1")
app.include_router(billing_router, prefix="/api/v1")
app.include_router(preferences_router, prefix="/api/v1/preferences", tags=["preferences"])
app.include_router(currency_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(monobank_router)  # router already declares /api/v1/integrations/monobank prefix

# Admin routers
app.include_router(admin_users_router, prefix="/api/v1/admin")
app.include_router(admin_tiers_router, prefix="/api/v1/admin")
app.include_router(admin_config_router, prefix="/api/v1/admin")
app.include_router(admin_analytics_router, prefix="/api/v1/admin")


# Root endpoint
@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "message": "Wealth Vault API",
        "version": settings.APP_VERSION,
        "docs": "/docs"
    }
