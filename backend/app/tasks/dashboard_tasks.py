"""
Dashboard-related Celery tasks.

Tasks:
- Create net worth snapshots (monthly, daily)
- Calculate financial metrics
- Generate periodic reports
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.models.user import User

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.dashboard.create_monthly_snapshot")
def create_monthly_snapshot(self) -> Dict[str, Any]:
    """
    Monthly task to create net worth snapshots for all users.

    Runs on the 1st of each month to capture the previous month's ending net worth.

    For each active user:
    1. Calculate current net worth (assets - liabilities)
    2. Break down by component (portfolio, savings, debts receivable, installments)
    3. Calculate change from previous snapshot
    4. Store in net_worth_snapshots table

    Returns:
        Dict with results
    """
    import asyncio

    async def _create():
        from app.modules.dashboard import snapshot_service

        async with get_async_db_session() as db:
            # Get all users
            users_query = select(User)
            users_result = await db.execute(users_query)
            users = users_result.scalars().all()

            snapshots_created = 0
            errors = 0

            for user in users:
                try:
                    # Check and create monthly snapshot (won't duplicate if one exists)
                    snapshot = await snapshot_service.check_and_create_monthly_snapshot(db, user.id)
                    if snapshot:
                        snapshots_created += 1
                        logger.info(f"Created monthly snapshot for user {user.id}: net_worth={snapshot.net_worth}")
                except Exception as e:
                    errors += 1
                    logger.error(f"Failed to create monthly snapshot for user {user.id}: {e}")

            logger.info(f"Monthly snapshot task completed: {snapshots_created} created, {errors} errors")

            return {
                "users_processed": len(users),
                "snapshots_created": snapshots_created,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_create())


@celery_app.task(base=BaseTask, bind=True, name="tasks.dashboard.create_daily_snapshot")
def create_daily_snapshot(self, user_id: str = None) -> Dict[str, Any]:
    """
    Create a net worth snapshot.

    Can be triggered:
    - Daily for premium (Wealth) tier users
    - Manually by any user
    - After significant financial events

    Args:
        user_id: Optional specific user ID (if None, processes all eligible users)

    Returns:
        Dict with results
    """
    import asyncio
    from uuid import UUID

    async def _create():
        from app.modules.dashboard import snapshot_service

        async with get_async_db_session() as db:
            if user_id:
                # Create snapshot for specific user
                try:
                    snapshot = await snapshot_service.create_net_worth_snapshot(
                        db, UUID(user_id), snapshot_type="daily"
                    )
                    logger.info(f"Created daily snapshot for user {user_id}: net_worth={snapshot.net_worth}")
                    return {
                        "users_processed": 1,
                        "snapshots_created": 1,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                except Exception as e:
                    logger.error(f"Failed to create daily snapshot for user {user_id}: {e}")
                    return {
                        "users_processed": 1,
                        "snapshots_created": 0,
                        "error": str(e),
                        "timestamp": datetime.utcnow().isoformat()
                    }
            else:
                # Process all premium users (those with Wealth tier)
                # For now, process all users - tier check can be added later
                users_query = select(User)
                users_result = await db.execute(users_query)
                users = users_result.scalars().all()

                snapshots_created = 0
                errors = 0

                for user in users:
                    # TODO: Check if user has premium tier
                    # if user.tier and user.tier.name == "Wealth":
                    try:
                        snapshot = await snapshot_service.create_net_worth_snapshot(
                            db, user.id, snapshot_type="daily"
                        )
                        snapshots_created += 1
                    except Exception as e:
                        errors += 1
                        logger.error(f"Failed to create daily snapshot for user {user.id}: {e}")

                return {
                    "users_processed": len(users),
                    "snapshots_created": snapshots_created,
                    "errors": errors,
                    "timestamp": datetime.utcnow().isoformat()
                }

    return asyncio.get_event_loop().run_until_complete(_create())


@celery_app.task(base=BaseTask, bind=True, name="tasks.dashboard.calculate_financial_health")
def calculate_financial_health(self) -> Dict[str, Any]:
    """
    Weekly task to calculate and store financial health scores.

    For each active user:
    1. Calculate all 5 health score components
    2. Generate overall score
    3. Compare to previous week
    4. Store in history
    5. Send notifications for significant changes

    Returns:
        Dict with results
    """
    import asyncio

    async def _calculate():
        from app.modules.dashboard import service

        async with get_async_db_session() as db:
            users_query = select(User)
            users_result = await db.execute(users_query)
            users = users_result.scalars().all()

            scores_calculated = 0
            significant_changes = 0

            for user in users:
                try:
                    # Calculate financial health score
                    health = await service.get_financial_health_score(db, user.id)
                    scores_calculated += 1

                    # Log the score for tracking
                    logger.info(f"User {user.id} financial health: {health.score}/100 ({health.rating})")

                    # TODO: Store in history and check for significant changes
                    # TODO: Send notifications for significant changes

                except Exception as e:
                    logger.error(f"Failed to calculate health score for user {user.id}: {e}")

            return {
                "users_processed": len(users),
                "scores_calculated": scores_calculated,
                "significant_changes": significant_changes,
                "notifications_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_calculate())


@celery_app.task(base=BaseTask, bind=True, name="tasks.dashboard.generate_weekly_report")
def generate_weekly_report(self) -> Dict[str, Any]:
    """
    Weekly task to generate financial reports.

    For each user who has opted in:
    1. Calculate week's income, expenses, savings
    2. Compare to previous week and monthly average
    3. Highlight significant events
    4. Generate report
    5. Optionally send email digest

    Returns:
        Dict with results
    """
    import asyncio

    async def _generate():
        from app.modules.dashboard import service

        async with get_async_db_session() as db:
            users_query = select(User)
            users_result = await db.execute(users_query)
            users = users_result.scalars().all()

            reports_generated = 0

            for user in users:
                try:
                    # Get cash flow data for the week
                    now = datetime.utcnow()
                    week_start = now - timedelta(days=7)

                    cash_flow = await service.get_cash_flow(
                        db, user.id,
                        start_date=week_start,
                        end_date=now
                    )

                    # Log the summary
                    logger.info(
                        f"Weekly report for user {user.id}: "
                        f"income={cash_flow.monthly_income}, "
                        f"expenses={cash_flow.monthly_expenses}, "
                        f"net={cash_flow.net_cash_flow}"
                    )

                    reports_generated += 1

                    # TODO: Generate formatted report
                    # TODO: Send email if user has opted in

                except Exception as e:
                    logger.error(f"Failed to generate report for user {user.id}: {e}")

            return {
                "users_processed": len(users),
                "reports_generated": reports_generated,
                "emails_sent": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_generate())


@celery_app.task(base=BaseTask, bind=True, name="tasks.dashboard.create_cash_flow_snapshot")
def create_cash_flow_snapshot(self) -> Dict[str, Any]:
    """
    Monthly task to create cash flow snapshots for all users.

    Captures the actual money flow for the previous month.

    Returns:
        Dict with results
    """
    import asyncio

    async def _create():
        from app.modules.dashboard import snapshot_service

        async with get_async_db_session() as db:
            # Calculate previous month's date range
            now = datetime.utcnow()
            month_start = (now.replace(day=1) - timedelta(days=1)).replace(day=1)
            month_end = now.replace(day=1) - timedelta(seconds=1)

            users_query = select(User)
            users_result = await db.execute(users_query)
            users = users_result.scalars().all()

            snapshots_created = 0
            errors = 0

            for user in users:
                try:
                    snapshot = await snapshot_service.create_cash_flow_snapshot(
                        db, user.id,
                        period_start=month_start,
                        period_end=month_end,
                        period_type="monthly"
                    )
                    snapshots_created += 1
                    logger.info(
                        f"Created cash flow snapshot for user {user.id}: "
                        f"income={snapshot.total_income}, net={snapshot.net_cash_flow}"
                    )
                except Exception as e:
                    errors += 1
                    logger.error(f"Failed to create cash flow snapshot for user {user.id}: {e}")

            return {
                "users_processed": len(users),
                "snapshots_created": snapshots_created,
                "errors": errors,
                "period": f"{month_start.strftime('%Y-%m')}",
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_create())
