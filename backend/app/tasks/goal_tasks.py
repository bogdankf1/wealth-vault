"""
Goal-related Celery tasks.

Tasks:
- Update goal progress from linked accounts
- Check for goal achievements
- Send goal reminders
- Create progress snapshots
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from decimal import Decimal

from sqlalchemy import select, and_

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.modules.goals.models import Goal, GoalAccountLink, GoalProgressHistory
from app.modules.goals.service import (
    calculate_progress_percentage,
    calculate_progress_from_accounts,
    record_progress_snapshot
)

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.goal.update_progress_from_accounts")
def update_goal_progress_from_accounts(self) -> Dict[str, Any]:
    """
    Daily task to update goal progress from linked accounts.

    For each active goal with auto_track_progress enabled:
    1. Calculate current_amount from linked account balances
    2. Apply allocation rules (percentage/fixed/full)
    3. Update progress_percentage
    4. Check for completion
    5. Record progress snapshot
    6. Send notifications for milestones

    Returns:
        Dict with results
    """
    import asyncio

    async def _update():
        async with get_async_db_session() as db:
            from app.modules.notifications.service import create_notification

            goals_updated = 0
            goals_completed = 0
            milestones_reached = 0
            notifications_sent = 0

            # Get all active goals with auto_track_progress enabled
            query = select(Goal).where(
                and_(
                    Goal.is_active == True,
                    Goal.auto_track_progress == True,
                    Goal.is_completed == False
                )
            )
            result = await db.execute(query)
            goals = result.scalars().all()

            logger.info(f"Processing {len(goals)} goals with auto-tracking enabled")

            for goal in goals:
                try:
                    old_progress = float(goal.progress_percentage or 0)

                    # Calculate progress from linked accounts
                    total_from_accounts, breakdown = await calculate_progress_from_accounts(
                        db, goal.user_id, goal.id
                    )

                    # Update goal
                    goal.current_amount = total_from_accounts
                    new_progress = calculate_progress_percentage(total_from_accounts, goal.target_amount)
                    goal.progress_percentage = new_progress
                    goal.updated_at = datetime.utcnow()

                    # Check for completion
                    if total_from_accounts >= goal.target_amount:
                        goal.is_completed = True
                        goal.completed_at = datetime.utcnow()
                        goals_completed += 1

                        # Send completion notification
                        try:
                            await create_notification(
                                db=db,
                                user_id=goal.user_id,
                                type="goal_completed",
                                title="Goal Achieved!",
                                message=f"Congratulations! You've reached your goal: {goal.name}",
                                data={"goal_id": str(goal.id), "goal_name": goal.name}
                            )
                            notifications_sent += 1
                        except Exception as e:
                            logger.error(f"Failed to send completion notification: {e}")

                    # Check for milestones (25%, 50%, 75%)
                    new_progress_float = float(new_progress)
                    for milestone in [25, 50, 75]:
                        if old_progress < milestone <= new_progress_float:
                            milestones_reached += 1
                            try:
                                await create_notification(
                                    db=db,
                                    user_id=goal.user_id,
                                    type="goal_milestone",
                                    title=f"Goal Milestone: {milestone}%",
                                    message=f"You've reached {milestone}% of your goal: {goal.name}",
                                    data={"goal_id": str(goal.id), "milestone": milestone}
                                )
                                notifications_sent += 1
                            except Exception as e:
                                logger.error(f"Failed to send milestone notification: {e}")

                    # Record progress snapshot
                    await record_progress_snapshot(
                        db=db,
                        user_id=goal.user_id,
                        goal_id=goal.id,
                        current_amount=total_from_accounts,
                        trigger_type="scheduled",
                        linked_accounts_snapshot=breakdown if breakdown else None,
                        notes="Automated daily update"
                    )

                    goals_updated += 1

                except Exception as e:
                    logger.error(f"Error updating goal {goal.id}: {e}")

            await db.commit()

            logger.info(f"Goal progress update complete: {goals_updated} updated, {goals_completed} completed, {milestones_reached} milestones")

            return {
                "goals_updated": goals_updated,
                "goals_completed": goals_completed,
                "milestones_reached": milestones_reached,
                "notifications_sent": notifications_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_update())


@celery_app.task(base=BaseTask, bind=True, name="tasks.goal.check_goal_deadlines")
def check_goal_deadlines(self) -> Dict[str, Any]:
    """
    Daily task to check goal target dates.

    For each active goal:
    1. Check if target_date is approaching (7 days, 30 days)
    2. Calculate if goal is on track to meet target
    3. Send warnings for goals behind schedule
    4. Send congratulations for goals ahead of schedule

    Returns:
        Dict with results
    """
    import asyncio

    async def _check():
        async with get_async_db_session() as db:
            from app.modules.notifications.service import create_notification
            from app.modules.goals.service import calculate_projected_completion_date

            goals_checked = 0
            approaching_deadline = 0
            behind_schedule = 0
            on_track = 0
            notifications_sent = 0

            today = datetime.utcnow()
            seven_days = today + timedelta(days=7)
            thirty_days = today + timedelta(days=30)

            # Get active goals with target dates
            query = select(Goal).where(
                and_(
                    Goal.is_active == True,
                    Goal.is_completed == False,
                    Goal.target_date.isnot(None)
                )
            )
            result = await db.execute(query)
            goals = result.scalars().all()

            logger.info(f"Checking deadlines for {len(goals)} goals")

            for goal in goals:
                try:
                    goals_checked += 1

                    # Check if deadline is approaching
                    if goal.target_date:
                        days_until = (goal.target_date - today).days

                        # Calculate if on track
                        projected = calculate_projected_completion_date(
                            goal.current_amount,
                            goal.target_amount,
                            goal.monthly_contribution,
                            goal.start_date
                        )

                        is_on_track = projected is None or projected <= goal.target_date

                        if is_on_track:
                            on_track += 1
                        else:
                            behind_schedule += 1

                        # Send notifications for approaching deadlines
                        if days_until <= 7 and days_until > 0:
                            approaching_deadline += 1
                            try:
                                await create_notification(
                                    db=db,
                                    user_id=goal.user_id,
                                    type="goal_deadline_approaching",
                                    title=f"Goal Deadline in {days_until} days",
                                    message=f"Your goal '{goal.name}' has a deadline in {days_until} days. Current progress: {goal.progress_percentage:.0f}%",
                                    data={
                                        "goal_id": str(goal.id),
                                        "days_until": days_until,
                                        "progress": float(goal.progress_percentage or 0)
                                    }
                                )
                                notifications_sent += 1
                            except Exception as e:
                                logger.error(f"Failed to send deadline notification: {e}")

                        # Warn if behind schedule and deadline in 30 days
                        elif days_until <= 30 and not is_on_track:
                            try:
                                await create_notification(
                                    db=db,
                                    user_id=goal.user_id,
                                    type="goal_behind_schedule",
                                    title="Goal Behind Schedule",
                                    message=f"Your goal '{goal.name}' may not meet its deadline. Consider increasing contributions.",
                                    data={
                                        "goal_id": str(goal.id),
                                        "target_date": goal.target_date.isoformat(),
                                        "progress": float(goal.progress_percentage or 0)
                                    }
                                )
                                notifications_sent += 1
                            except Exception as e:
                                logger.error(f"Failed to send behind schedule notification: {e}")

                except Exception as e:
                    logger.error(f"Error checking goal {goal.id}: {e}")

            await db.commit()

            logger.info(f"Goal deadline check complete: {goals_checked} checked, {approaching_deadline} approaching, {behind_schedule} behind")

            return {
                "goals_checked": goals_checked,
                "approaching_deadline": approaching_deadline,
                "behind_schedule": behind_schedule,
                "on_track": on_track,
                "notifications_sent": notifications_sent,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_check())


@celery_app.task(base=BaseTask, bind=True, name="tasks.goal.create_progress_snapshots")
def create_progress_snapshots(self) -> Dict[str, Any]:
    """
    Daily task to create goal progress snapshots.

    For each active goal:
    1. Record current progress in goal_progress_history
    2. Store linked account balances snapshot
    3. Calculate velocity (progress per day)

    Returns:
        Dict with results
    """
    import asyncio

    async def _snapshot():
        async with get_async_db_session() as db:
            goals_processed = 0
            snapshots_created = 0

            # Get all active goals (not just auto-tracking ones)
            query = select(Goal).where(
                and_(
                    Goal.is_active == True,
                    Goal.is_completed == False
                )
            )
            result = await db.execute(query)
            goals = result.scalars().all()

            logger.info(f"Creating progress snapshots for {len(goals)} active goals")

            for goal in goals:
                try:
                    goals_processed += 1

                    # Get linked accounts breakdown if any
                    breakdown = None
                    if goal.auto_track_progress:
                        _, breakdown = await calculate_progress_from_accounts(
                            db, goal.user_id, goal.id
                        )

                    # Create snapshot
                    await record_progress_snapshot(
                        db=db,
                        user_id=goal.user_id,
                        goal_id=goal.id,
                        current_amount=goal.current_amount,
                        trigger_type="scheduled",
                        linked_accounts_snapshot=breakdown,
                        notes="Daily progress snapshot"
                    )
                    snapshots_created += 1

                except Exception as e:
                    logger.error(f"Error creating snapshot for goal {goal.id}: {e}")

            await db.commit()

            logger.info(f"Progress snapshots complete: {goals_processed} processed, {snapshots_created} created")

            return {
                "goals_processed": goals_processed,
                "snapshots_created": snapshots_created,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_snapshot())
