"""Dashboard financial and goal projections."""
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.dashboard.schemas import (
        FinancialProjectionsResponse,
        GoalProjectionsResponse,
    )
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.goals.models import Goal
from app.modules.dashboard.service.summary import get_cash_flow, get_net_worth


async def get_financial_projections(
    db: AsyncSession,
    user_id: UUID,
    annual_return_rate: Decimal = Decimal('0.07')  # 7% default
) -> "FinancialProjectionsResponse":
    """
    Calculate financial projections based on current trends.

    Projections use:
    - Current net worth as baseline
    - Current monthly savings rate
    - Assumed investment return rate

    Formula: FV = PV * (1 + r)^n + PMT * (((1 + r)^n - 1) / r)
    Where:
    - FV = Future Value
    - PV = Present Value (current net worth)
    - r = monthly interest rate
    - n = number of months
    - PMT = monthly contribution (savings)
    """
    from app.modules.dashboard.schemas import FinancialProjectionsResponse

    # Get current financial state
    net_worth_data = await get_net_worth(db, user_id)
    cash_flow_data = await get_cash_flow(db, user_id)

    current_net_worth = net_worth_data.net_worth
    monthly_savings = cash_flow_data.net_cash_flow
    savings_rate = cash_flow_data.savings_rate

    # Monthly interest rate
    monthly_rate = annual_return_rate / Decimal('12')

    def calculate_future_value(months: int) -> Decimal:
        """Calculate future value with compound interest and regular contributions."""
        if monthly_rate == 0:
            return current_net_worth + (monthly_savings * months)

        # FV of lump sum: PV * (1 + r)^n
        fv_lump = current_net_worth * ((1 + monthly_rate) ** months)

        # FV of annuity: PMT * (((1 + r)^n - 1) / r)
        if monthly_savings > 0:
            fv_annuity = monthly_savings * ((((1 + monthly_rate) ** months) - 1) / monthly_rate)
        else:
            fv_annuity = Decimal('0')

        return fv_lump + fv_annuity

    return FinancialProjectionsResponse(
        current_net_worth=current_net_worth,
        current_monthly_savings=monthly_savings,
        current_savings_rate=savings_rate,
        projected_net_worth_1_year=calculate_future_value(12),
        projected_net_worth_3_years=calculate_future_value(36),
        projected_net_worth_5_years=calculate_future_value(60),
        projected_net_worth_10_years=calculate_future_value(120),
        assumed_annual_return=annual_return_rate * 100,  # Convert to percentage
        assumed_monthly_savings=monthly_savings,
        currency=net_worth_data.currency
    )


async def get_goal_projections(
    db: AsyncSession,
    user_id: UUID
) -> "GoalProjectionsResponse":
    """
    Calculate projections for all active goals.

    For each goal, calculates:
    - Progress percentage
    - Estimated completion date based on current contribution rate
    - Whether the goal is on track
    """
    from app.modules.dashboard.schemas import GoalProjectionsResponse, GoalProjectionItem
    from dateutil.relativedelta import relativedelta

    # Get all active goals
    goals_query = select(Goal).where(
        and_(
            Goal.user_id == user_id,
            Goal.is_active == True,
            Goal.is_completed == False
        )
    )
    goals_result = await db.execute(goals_query)
    goals = goals_result.scalars().all()

    goal_projections = []
    total_targets = Decimal('0')
    total_progress = Decimal('0')

    for goal in goals:
        target_amount = goal.target_amount or Decimal('0')
        current_amount = goal.current_amount or Decimal('0')
        monthly_contribution = goal.monthly_contribution or Decimal('0')

        total_targets += target_amount
        total_progress += current_amount

        progress_pct = (current_amount / target_amount * 100) if target_amount > 0 else Decimal('0')
        remaining = target_amount - current_amount

        # Calculate months to completion
        if monthly_contribution > 0 and remaining > 0:
            months_to_complete = int(remaining / monthly_contribution) + 1
            completion_date = datetime.utcnow().date() + relativedelta(months=months_to_complete)
        else:
            months_to_complete = None
            completion_date = None

        # Check if on track (has target date and will meet it)
        on_track = True
        if goal.target_date and completion_date:
            on_track = completion_date <= goal.target_date

        goal_projections.append(GoalProjectionItem(
            goal_id=goal.id,
            goal_name=goal.name,
            target_amount=target_amount,
            current_amount=current_amount,
            progress_percentage=progress_pct,
            monthly_contribution=monthly_contribution,
            projected_completion_date=completion_date,
            months_to_completion=months_to_complete,
            on_track=on_track
        ))

    overall_progress = (total_progress / total_targets * 100) if total_targets > 0 else Decimal('0')

    return GoalProjectionsResponse(
        goals=goal_projections,
        total_goal_targets=total_targets,
        total_current_progress=total_progress,
        overall_progress_percentage=overall_progress
    )
