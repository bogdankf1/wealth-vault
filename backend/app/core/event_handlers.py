"""
Event Handlers for Wealth Vault.

This module registers all cross-module event handlers.
Handlers are organized by the action they perform (notifications, account updates, etc.)

These handlers are registered when the application starts.
"""
import logging
from uuid import UUID

from app.core.events import (
    event_dispatcher,
    Event,
    EventPriority,
    # Event name constants
    IncomeEvents,
    ExpenseEvents,
    SavingsEvents,
    PortfolioEvents,
    GoalEvents,
    BudgetEvents,
    SubscriptionEvents,
    InstallmentEvents,
    DebtEvents,
    BillingEvents,
)

logger = logging.getLogger(__name__)


# =============================================================================
# NOTIFICATION HANDLERS
# =============================================================================
# These handlers create notifications when significant events occur

@event_dispatcher.on(GoalEvents.MILESTONE_REACHED, EventPriority.NORMAL)
async def notify_goal_milestone(event: Event) -> None:
    """Send notification when user reaches a goal milestone."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    goal_name = event.payload.get("goal_name", "Your goal")
    milestone = event.payload.get("milestone", 0)
    current_amount = event.payload.get("current_amount", 0)
    target_amount = event.payload.get("target_amount", 0)

    create_notification.delay(
        user_id=user_id,
        notification_type="achievement",
        category="goal",
        title=f"Milestone Reached: {milestone}%!",
        message=f"Congratulations! You've reached {milestone}% of your goal '{goal_name}'. "
                f"Current: {current_amount:.2f} / Target: {target_amount:.2f}",
        priority=2,
        action_url=f"/goals/{event.payload.get('goal_id')}",
        extra_data={"goal_id": str(event.payload.get("goal_id")), "milestone": milestone}
    )
    logger.info(f"Goal milestone notification queued for user {user_id}")


@event_dispatcher.on(GoalEvents.COMPLETED, EventPriority.NORMAL)
async def notify_goal_completed(event: Event) -> None:
    """Send notification when user completes a goal."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    goal_name = event.payload.get("goal_name", "Your goal")

    create_notification.delay(
        user_id=user_id,
        notification_type="achievement",
        category="goal",
        title="Goal Completed!",
        message=f"Amazing! You've completed your goal '{goal_name}'!",
        priority=1,
        action_url=f"/goals/{event.payload.get('goal_id')}",
        extra_data={"goal_id": str(event.payload.get("goal_id"))}
    )
    logger.info(f"Goal completion notification queued for user {user_id}")


@event_dispatcher.on(GoalEvents.DEADLINE_APPROACHING, EventPriority.NORMAL)
async def notify_goal_deadline_approaching(event: Event) -> None:
    """Send notification when goal deadline is approaching."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    goal_name = event.payload.get("goal_name", "Your goal")
    days_remaining = event.payload.get("days_remaining", 0)
    progress_percent = event.payload.get("progress_percent", 0)

    create_notification.delay(
        user_id=user_id,
        notification_type="reminder",
        category="goal",
        title=f"Goal Deadline in {days_remaining} Days",
        message=f"Your goal '{goal_name}' deadline is approaching. "
                f"You're at {progress_percent:.1f}% progress.",
        priority=2 if days_remaining > 7 else 1,
        action_url=f"/goals/{event.payload.get('goal_id')}",
        extra_data={"goal_id": str(event.payload.get("goal_id")), "days_remaining": days_remaining}
    )
    logger.info(f"Goal deadline notification queued for user {user_id}")


@event_dispatcher.on(BudgetEvents.THRESHOLD_WARNING, EventPriority.NORMAL)
async def notify_budget_warning(event: Event) -> None:
    """Send notification when budget reaches warning threshold (80%)."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    budget_name = event.payload.get("budget_name", "Your budget")
    spent_percent = event.payload.get("spent_percent", 80)
    remaining = event.payload.get("remaining", 0)
    currency = event.payload.get("currency", "USD")

    create_notification.delay(
        user_id=user_id,
        notification_type="warning",
        category="budget",
        title=f"Budget Alert: {spent_percent:.0f}% Spent",
        message=f"You've spent {spent_percent:.0f}% of '{budget_name}'. "
                f"Remaining: {remaining:.2f} {currency}",
        priority=2,
        action_url=f"/budgets/{event.payload.get('budget_id')}",
        extra_data={"budget_id": str(event.payload.get("budget_id")), "spent_percent": spent_percent}
    )
    logger.info(f"Budget warning notification queued for user {user_id}")


@event_dispatcher.on(BudgetEvents.THRESHOLD_EXCEEDED, EventPriority.HIGH)
async def notify_budget_exceeded(event: Event) -> None:
    """Send notification when budget is exceeded."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    budget_name = event.payload.get("budget_name", "Your budget")
    spent_percent = event.payload.get("spent_percent", 100)
    overspent = event.payload.get("overspent", 0)
    currency = event.payload.get("currency", "USD")

    create_notification.delay(
        user_id=user_id,
        notification_type="alert",
        category="budget",
        title="Budget Exceeded!",
        message=f"You've exceeded '{budget_name}' by {overspent:.2f} {currency} "
                f"({spent_percent:.0f}% of budget)",
        priority=1,
        action_url=f"/budgets/{event.payload.get('budget_id')}",
        extra_data={"budget_id": str(event.payload.get("budget_id")), "spent_percent": spent_percent}
    )
    logger.info(f"Budget exceeded notification queued for user {user_id}")


@event_dispatcher.on(BudgetEvents.PERIOD_RESET, EventPriority.NORMAL)
async def notify_budget_period_reset(event: Event) -> None:
    """Send notification when budget period resets with rollover info."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    budget_name = event.payload.get("budget_name", "Your budget")
    spent_amount = event.payload.get("spent_amount", 0)
    budget_amount = event.payload.get("budget_amount", 0)
    rollover_amount = event.payload.get("rollover_amount", 0)
    currency = event.payload.get("currency", "USD")

    # Build message based on whether there's rollover
    if rollover_amount > 0:
        message = (
            f"'{budget_name}' has reset for a new period. "
            f"You spent {spent_amount:.2f} of {budget_amount:.2f} {currency}. "
            f"Rollover: {rollover_amount:.2f} {currency} added to your new budget!"
        )
        title = "Budget Reset + Rollover"
    else:
        message = (
            f"'{budget_name}' has reset for a new period. "
            f"Last period: spent {spent_amount:.2f} of {budget_amount:.2f} {currency}."
        )
        title = "Budget Period Reset"

    create_notification.delay(
        user_id=user_id,
        notification_type="info",
        category="budget",
        title=title,
        message=message,
        priority=3,
        action_url=f"/budgets/{event.payload.get('budget_id')}",
        extra_data={
            "budget_id": str(event.payload.get("budget_id")),
            "rollover_amount": rollover_amount
        }
    )
    logger.info(f"Budget period reset notification queued for user {user_id}")


@event_dispatcher.on(SubscriptionEvents.RENEWAL_REMINDER, EventPriority.NORMAL)
async def notify_subscription_renewal(event: Event) -> None:
    """Send notification for upcoming subscription renewal."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    subscription_name = event.payload.get("subscription_name", "Your subscription")
    days_until = event.payload.get("days_until_renewal", 0)
    amount = event.payload.get("amount", 0)
    currency = event.payload.get("currency", "USD")
    auto_pay_enabled = event.payload.get("auto_pay_enabled", False)

    if auto_pay_enabled:
        message = f"'{subscription_name}' will auto-renew in {days_until} days for {amount:.2f} {currency}"
    else:
        message = f"'{subscription_name}' will renew in {days_until} days for {amount:.2f} {currency}"

    create_notification.delay(
        user_id=user_id,
        notification_type="reminder",
        category="subscription",
        title=f"Subscription Renewal in {days_until} Days",
        message=message,
        priority=3 if days_until > 3 else 2,
        action_url=f"/subscriptions/{event.payload.get('subscription_id')}",
        extra_data={"subscription_id": str(event.payload.get("subscription_id")), "days_until": days_until}
    )
    logger.info(f"Subscription renewal notification queued for user {user_id}")


@event_dispatcher.on(SubscriptionEvents.RENEWAL_PROCESSED, EventPriority.NORMAL)
async def notify_subscription_renewed(event: Event) -> None:
    """Send notification when subscription renewal is processed."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    subscription_name = event.payload.get("subscription_name", "Your subscription")
    amount = event.payload.get("amount", 0)
    currency = event.payload.get("currency", "USD")
    auto_paid = event.payload.get("auto_paid", False)

    if auto_paid:
        message = f"'{subscription_name}' renewed and paid {amount:.2f} {currency} automatically"
        title = "Subscription Auto-Renewed"
    else:
        message = f"'{subscription_name}' renewed for {amount:.2f} {currency}"
        title = "Subscription Renewed"

    create_notification.delay(
        user_id=user_id,
        notification_type="info",
        category="subscription",
        title=title,
        message=message,
        priority=3,
        action_url=f"/subscriptions/{event.payload.get('subscription_id')}",
        extra_data={"subscription_id": str(event.payload.get("subscription_id")), "auto_paid": auto_paid}
    )
    logger.info(f"Subscription renewed notification queued for user {user_id}")


@event_dispatcher.on(SubscriptionEvents.SUBSCRIPTION_EXPIRED, EventPriority.NORMAL)
async def notify_subscription_expired(event: Event) -> None:
    """Send notification when subscription expires."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    subscription_name = event.payload.get("subscription_name", "Your subscription")

    create_notification.delay(
        user_id=user_id,
        notification_type="info",
        category="subscription",
        title="Subscription Expired",
        message=f"'{subscription_name}' has expired and been marked as inactive",
        priority=3,
        action_url=f"/subscriptions/{event.payload.get('subscription_id')}",
        extra_data={"subscription_id": str(event.payload.get("subscription_id"))}
    )
    logger.info(f"Subscription expired notification queued for user {user_id}")


@event_dispatcher.on(SubscriptionEvents.SUBSCRIPTION_RESUMED, EventPriority.NORMAL)
async def notify_subscription_resumed(event: Event) -> None:
    """Send notification when subscription is auto-resumed."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    subscription_name = event.payload.get("subscription_name", "Your subscription")

    create_notification.delay(
        user_id=user_id,
        notification_type="info",
        category="subscription",
        title="Subscription Resumed",
        message=f"'{subscription_name}' has been automatically resumed",
        priority=3,
        action_url=f"/subscriptions/{event.payload.get('subscription_id')}",
        extra_data={"subscription_id": str(event.payload.get("subscription_id"))}
    )
    logger.info(f"Subscription resumed notification queued for user {user_id}")


@event_dispatcher.on(InstallmentEvents.PAYMENT_DUE, EventPriority.NORMAL)
async def notify_installment_due(event: Event) -> None:
    """Send notification for upcoming installment payment."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    installment_name = event.payload.get("installment_name", "Your installment")
    payment_number = event.payload.get("payment_number", 0)
    total_payments = event.payload.get("total_payments", 0)
    amount = event.payload.get("amount", 0)
    currency = event.payload.get("currency", "USD")
    days_until = event.payload.get("days_until", 0)

    create_notification.delay(
        user_id=user_id,
        notification_type="reminder",
        category="installment",
        title="Installment Payment Due",
        message=f"Payment {payment_number}/{total_payments} for '{installment_name}' "
                f"({amount:.2f} {currency}) is due in {days_until} days",
        priority=2 if days_until > 3 else 1,
        action_url=f"/installments/{event.payload.get('installment_id')}",
        extra_data={"installment_id": str(event.payload.get("installment_id"))}
    )
    logger.info(f"Installment payment notification queued for user {user_id}")


@event_dispatcher.on(InstallmentEvents.PAYMENT_LATE, EventPriority.HIGH)
async def notify_installment_late(event: Event) -> None:
    """Send notification for late installment payment."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    installment_name = event.payload.get("installment_name", "Your installment")
    days_overdue = event.payload.get("days_overdue", 0)
    amount = event.payload.get("amount", 0)
    currency = event.payload.get("currency", "USD")

    create_notification.delay(
        user_id=user_id,
        notification_type="alert",
        category="installment",
        title="Installment Payment Overdue",
        message=f"Payment for '{installment_name}' is {days_overdue} days overdue. "
                f"Amount due: {amount:.2f} {currency}",
        priority=1,
        action_url=f"/installments/{event.payload.get('installment_id')}",
        extra_data={"installment_id": str(event.payload.get("installment_id")), "days_overdue": days_overdue}
    )
    logger.info(f"Installment late payment notification queued for user {user_id}")


@event_dispatcher.on(DebtEvents.PAYMENT_DUE, EventPriority.NORMAL)
async def notify_debt_payment_due(event: Event) -> None:
    """Send notification for upcoming debt payment."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    debt_name = event.payload.get("debt_name", "Your debt")
    amount = event.payload.get("minimum_payment", 0)
    currency = event.payload.get("currency", "USD")
    days_until = event.payload.get("days_until", 0)

    create_notification.delay(
        user_id=user_id,
        notification_type="reminder",
        category="debt",
        title="Debt Payment Due Soon",
        message=f"Minimum payment of {amount:.2f} {currency} for '{debt_name}' is due in {days_until} days",
        priority=2 if days_until > 3 else 1,
        action_url=f"/debts/{event.payload.get('debt_id')}",
        extra_data={"debt_id": str(event.payload.get("debt_id"))}
    )
    logger.info(f"Debt payment notification queued for user {user_id}")


@event_dispatcher.on(DebtEvents.PAID_OFF, EventPriority.NORMAL)
async def notify_debt_paid_off(event: Event) -> None:
    """Send notification when debt is fully paid off."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    debt_name = event.payload.get("debt_name", "Your debt")
    total_paid = event.payload.get("total_paid", 0)
    currency = event.payload.get("currency", "USD")

    create_notification.delay(
        user_id=user_id,
        notification_type="achievement",
        category="debt",
        title="Debt Paid Off!",
        message=f"Congratulations! You've paid off '{debt_name}' "
                f"(Total paid: {total_paid:.2f} {currency})",
        priority=1,
        action_url="/debts",
        extra_data={"debt_id": str(event.payload.get("debt_id"))}
    )
    logger.info(f"Debt paid off notification queued for user {user_id}")


@event_dispatcher.on(BillingEvents.TIER_DOWNGRADED, EventPriority.HIGH)
async def notify_tier_downgrade(event: Event) -> None:
    """Send notification when user tier is downgraded."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    from_tier = event.payload.get("from_tier", "")
    to_tier = event.payload.get("to_tier", "")

    create_notification.delay(
        user_id=user_id,
        notification_type="alert",
        category="billing",
        title="Subscription Tier Changed",
        message=f"Your subscription has been changed from {from_tier.title()} to {to_tier.title()}. "
                f"Some features may no longer be available.",
        priority=1,
        action_url="/settings/billing",
        extra_data={"from_tier": from_tier, "to_tier": to_tier}
    )
    logger.info(f"Tier downgrade notification queued for user {user_id}")


@event_dispatcher.on(BillingEvents.EXPIRATION_WARNING, EventPriority.NORMAL)
async def notify_tier_expiration_warning(event: Event) -> None:
    """Send notification when subscription is about to expire."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    tier = event.payload.get("tier", "")
    days_until = event.payload.get("days_until", 0)

    create_notification.delay(
        user_id=user_id,
        notification_type="warning",
        category="billing",
        title=f"Subscription Expiring in {days_until} Days",
        message=f"Your {tier.title()} subscription will expire in {days_until} days. "
                f"Renew to keep your premium features.",
        priority=2 if days_until > 3 else 1,
        action_url="/settings/billing",
        extra_data={"tier": tier, "days_until": days_until}
    )
    logger.info(f"Tier expiration warning notification queued for user {user_id}")


@event_dispatcher.on(SavingsEvents.INTEREST_ACCRUED, EventPriority.LOW)
async def notify_interest_accrued(event: Event) -> None:
    """Send notification when significant interest is accrued (monthly)."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    account_name = event.payload.get("account_name", "Your account")
    interest_amount = event.payload.get("interest_amount", 0)
    currency = event.payload.get("currency", "USD")

    # Only notify for significant interest (> 1.00)
    if interest_amount < 1.0:
        return

    create_notification.delay(
        user_id=user_id,
        notification_type="alert",
        category="savings",
        title="Interest Earned",
        message=f"You earned {interest_amount:.2f} {currency} in interest on '{account_name}'",
        priority=3,
        action_url=f"/savings/{event.payload.get('account_id')}",
        extra_data={"account_id": str(event.payload.get("account_id"))}
    )
    logger.info(f"Interest accrued notification queued for user {user_id}")


@event_dispatcher.on(PortfolioEvents.DIVIDEND_RECEIVED, EventPriority.LOW)
async def notify_dividend_received(event: Event) -> None:
    """Send notification when dividend is received."""
    from app.tasks.notification_tasks import create_notification

    user_id = str(event.user_id)
    symbol = event.payload.get("symbol", "")
    amount = event.payload.get("amount", 0)
    currency = event.payload.get("currency", "USD")

    create_notification.delay(
        user_id=user_id,
        notification_type="alert",
        category="portfolio",
        title=f"Dividend Received: {symbol}",
        message=f"You received a dividend of {amount:.2f} {currency} from {symbol}",
        priority=3,
        action_url="/portfolio",
        extra_data={"symbol": symbol, "amount": amount}
    )
    logger.info(f"Dividend notification queued for user {user_id}")


# =============================================================================
# GOAL PROGRESS HANDLERS
# =============================================================================
# These handlers update goal progress when linked accounts change

@event_dispatcher.on(SavingsEvents.DEPOSIT, EventPriority.NORMAL)
async def update_goal_on_deposit(event: Event) -> None:
    """Update goal progress when deposit is made to a linked savings account."""
    from app.core.database import AsyncSessionLocal
    from app.modules.goals.service import (
        get_goals_by_linked_account,
        update_goal_progress_from_accounts
    )

    account_id = event.payload.get("account_id")
    amount = event.payload.get("amount", 0)
    user_id = event.user_id

    if not account_id or not user_id:
        logger.warning("Missing account_id or user_id in deposit event")
        return

    logger.debug(f"Savings deposit event received for account {account_id}, amount {amount}")

    try:
        async with AsyncSessionLocal() as db:
            # Find all goals linked to this account with auto_track_progress enabled
            goals = await get_goals_by_linked_account(db, user_id, UUID(account_id))

            for goal in goals:
                try:
                    await update_goal_progress_from_accounts(
                        db, user_id, goal.id,
                        trigger_type="transaction",
                        notes=f"Deposit of {amount} to linked account"
                    )
                    logger.info(f"Updated goal {goal.id} progress after deposit to account {account_id}")
                except Exception as e:
                    logger.error(f"Failed to update goal {goal.id} progress: {e}")

    except Exception as e:
        logger.error(f"Error updating goals on deposit: {e}")


@event_dispatcher.on(SavingsEvents.WITHDRAWAL, EventPriority.NORMAL)
async def update_goal_on_withdrawal(event: Event) -> None:
    """Update goal progress when withdrawal is made from a linked savings account."""
    from app.core.database import AsyncSessionLocal
    from app.modules.goals.service import (
        get_goals_by_linked_account,
        update_goal_progress_from_accounts
    )

    account_id = event.payload.get("account_id")
    amount = event.payload.get("amount", 0)
    user_id = event.user_id

    if not account_id or not user_id:
        logger.warning("Missing account_id or user_id in withdrawal event")
        return

    logger.debug(f"Savings withdrawal event received for account {account_id}, amount {amount}")

    try:
        async with AsyncSessionLocal() as db:
            # Find all goals linked to this account with auto_track_progress enabled
            goals = await get_goals_by_linked_account(db, user_id, UUID(account_id))

            for goal in goals:
                try:
                    await update_goal_progress_from_accounts(
                        db, user_id, goal.id,
                        trigger_type="transaction",
                        notes=f"Withdrawal of {amount} from linked account"
                    )
                    logger.info(f"Updated goal {goal.id} progress after withdrawal from account {account_id}")
                except Exception as e:
                    logger.error(f"Failed to update goal {goal.id} progress: {e}")

    except Exception as e:
        logger.error(f"Error updating goals on withdrawal: {e}")


# =============================================================================
# TRANSACTION HANDLERS
# =============================================================================
# Note: Transaction creation is handled directly in the module services:
# - Income: auto_deposit via IncomeService.create_income_with_auto_deposit()
# - Expenses: auto_pay via ExpenseService.pay_expense()
# These event handlers are kept for logging/audit purposes only.

@event_dispatcher.on(IncomeEvents.DEPOSITED, EventPriority.HIGH)
async def log_income_deposited(event: Event) -> None:
    """Log when income is deposited to an account."""
    user_id = event.user_id
    amount = event.payload.get("amount", 0)
    account_id = event.payload.get("account_id")
    logger.info(f"Income deposited: user={user_id}, amount={amount}, account={account_id}")


@event_dispatcher.on(ExpenseEvents.PAID, EventPriority.HIGH)
async def log_expense_paid(event: Event) -> None:
    """Log when an expense is paid from an account."""
    user_id = event.user_id
    amount = event.payload.get("amount", 0)
    account_id = event.payload.get("account_id")
    logger.info(f"Expense paid: user={user_id}, amount={amount}, account={account_id}")


# =============================================================================
# BUDGET UPDATE HANDLERS
# =============================================================================
# These handlers update budgets when related events occur

@event_dispatcher.on(ExpenseEvents.CREATED, EventPriority.NORMAL)
async def check_budget_on_expense_created(event: Event) -> None:
    """Check budgets when an expense is created for real-time alerts."""
    from app.tasks.budget_tasks import check_budget_for_category

    user_id = event.user_id
    category = event.payload.get("category")

    if not user_id or not category:
        logger.debug("Skipping budget check: missing user_id or category")
        return

    # Trigger async budget check for this category
    check_budget_for_category.delay(str(user_id), category)
    logger.debug(f"Budget check queued for user={user_id}, category={category}")


@event_dispatcher.on(ExpenseEvents.UPDATED, EventPriority.NORMAL)
async def check_budget_on_expense_updated(event: Event) -> None:
    """Check budgets when an expense is updated (amount/category changed)."""
    from app.tasks.budget_tasks import check_budget_for_category

    user_id = event.user_id
    category = event.payload.get("category")

    if not user_id or not category:
        logger.debug("Skipping budget check: missing user_id or category")
        return

    # Trigger async budget check for this category
    check_budget_for_category.delay(str(user_id), category)
    logger.debug(f"Budget check queued (expense updated) for user={user_id}, category={category}")


# =============================================================================
# HANDLER INITIALIZATION
# =============================================================================

def register_all_handlers() -> None:
    """
    Register all event handlers.

    This function is called during application startup.
    All handlers decorated with @event_dispatcher.on() are automatically
    registered when this module is imported.
    """
    logger.info("Event handlers registered successfully")


# Auto-register handlers when module is imported
# The @event_dispatcher.on() decorators register handlers automatically
