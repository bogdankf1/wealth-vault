"""
Main FastAPI application.
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from dotenv import load_dotenv

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
from app.modules.budgets.router import router as budgets_router
from app.api.v1.billing import router as billing_router
from app.api.v1.preferences import router as preferences_router
from app.api.v1.admin.users import router as admin_users_router
from app.api.v1.admin.tiers import router as admin_tiers_router
from app.api.v1.admin.config import router as admin_config_router
from app.api.v1.admin.analytics import router as admin_analytics_router

# Setup logging
setup_logging(debug=settings.DEBUG)
logger = get_logger(__name__)


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
        from app.modules.ai.models import AIInsight  # noqa: F401
        from app.models.user_preferences import UserPreferences  # noqa: F401
        logger.info("All module models loaded successfully")
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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION
    }


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
app.include_router(budgets_router)
app.include_router(billing_router, prefix="/api/v1")
app.include_router(preferences_router, prefix="/api/v1/preferences", tags=["preferences"])

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
