"""
Event System for Wealth Vault.

This module provides a simple event-driven architecture for cross-module communication.
Events are dispatched when significant actions occur, and handlers respond to them.

Usage:
    from app.core.events import event_dispatcher, Event

    # Dispatch an event
    await event_dispatcher.dispatch(
        "income.deposited",
        user_id=user_id,
        amount=100.00,
        account_id=account_id
    )

    # Register a handler (typically done in event_handlers.py)
    @event_dispatcher.on("income.deposited")
    async def handle_income_deposited(event: Event):
        ...
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set
from uuid import UUID, uuid4
from enum import Enum

logger = logging.getLogger(__name__)


class EventPriority(Enum):
    """Event handler priority levels."""
    HIGH = 1
    NORMAL = 2
    LOW = 3


@dataclass
class Event:
    """
    Base event class containing event metadata and payload.

    Attributes:
        name: Event name in format "module.action" (e.g., "income.deposited")
        payload: Dict containing event-specific data
        event_id: Unique identifier for this event instance
        timestamp: When the event was created
        user_id: Optional user ID associated with this event
        correlation_id: Optional ID to track related events
    """
    name: str
    payload: Dict[str, Any] = field(default_factory=dict)
    event_id: UUID = field(default_factory=uuid4)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    user_id: Optional[UUID] = None
    correlation_id: Optional[UUID] = None

    def __str__(self) -> str:
        return f"Event({self.name}, id={self.event_id}, user={self.user_id})"


# =============================================================================
# EVENT NAME CONSTANTS
# =============================================================================
# Organized by module for easy reference and to prevent typos

class IncomeEvents:
    """Income module events."""
    CREATED = "income.created"
    UPDATED = "income.updated"
    DELETED = "income.deleted"
    DEPOSITED = "income.deposited"  # Income deposited to account
    RECURRING_PROCESSED = "income.recurring_processed"


class ExpenseEvents:
    """Expense module events."""
    CREATED = "expense.created"
    UPDATED = "expense.updated"
    DELETED = "expense.deleted"
    PAID = "expense.paid"  # Expense paid from account
    OVERDUE = "expense.overdue"
    RECURRING_PROCESSED = "expense.recurring_processed"


class SavingsEvents:
    """Savings account module events."""
    ACCOUNT_CREATED = "savings.account_created"
    ACCOUNT_UPDATED = "savings.account_updated"
    ACCOUNT_CLOSED = "savings.account_closed"
    DEPOSIT = "savings.deposit"
    WITHDRAWAL = "savings.withdrawal"
    TRANSFER = "savings.transfer"
    INTEREST_ACCRUED = "savings.interest_accrued"
    GOAL_LINKED = "savings.goal_linked"


class PortfolioEvents:
    """Portfolio/investment module events."""
    HOLDING_CREATED = "portfolio.holding_created"
    HOLDING_UPDATED = "portfolio.holding_updated"
    HOLDING_SOLD = "portfolio.holding_sold"
    DIVIDEND_RECEIVED = "portfolio.dividend_received"
    PRICE_UPDATED = "portfolio.price_updated"
    PERFORMANCE_CALCULATED = "portfolio.performance_calculated"


class GoalEvents:
    """Goal module events."""
    CREATED = "goal.created"
    UPDATED = "goal.updated"
    DELETED = "goal.deleted"
    PROGRESS_UPDATED = "goal.progress_updated"
    MILESTONE_REACHED = "goal.milestone_reached"  # 25%, 50%, 75%, 100%
    COMPLETED = "goal.completed"
    DEADLINE_APPROACHING = "goal.deadline_approaching"
    DEADLINE_MISSED = "goal.deadline_missed"


class BudgetEvents:
    """Budget module events."""
    CREATED = "budget.created"
    UPDATED = "budget.updated"
    DELETED = "budget.deleted"
    THRESHOLD_WARNING = "budget.threshold_warning"  # 80% spent
    THRESHOLD_EXCEEDED = "budget.threshold_exceeded"  # 100%+ spent
    PERIOD_RESET = "budget.period_reset"
    ROLLOVER_APPLIED = "budget.rollover_applied"


class SubscriptionEvents:
    """Subscription (user's external subscriptions) module events."""
    CREATED = "subscription.created"
    UPDATED = "subscription.updated"
    DELETED = "subscription.deleted"
    RENEWED = "subscription.renewed"
    RENEWAL_PROCESSED = "subscription.renewal_processed"
    RENEWAL_REMINDER = "subscription.renewal_reminder"
    SUBSCRIPTION_EXPIRED = "subscription.expired"
    CANCELLED = "subscription.cancelled"
    PAUSED = "subscription.paused"
    SUBSCRIPTION_RESUMED = "subscription.resumed"


class InstallmentEvents:
    """Installment module events."""
    CREATED = "installment.created"
    UPDATED = "installment.updated"
    DELETED = "installment.deleted"
    PAYMENT_DUE = "installment.payment_due"
    PAYMENT_MADE = "installment.payment_made"
    PAYMENT_LATE = "installment.payment_late"
    COMPLETED = "installment.completed"


class DebtEvents:
    """Debt module events."""
    CREATED = "debt.created"
    UPDATED = "debt.updated"
    DELETED = "debt.deleted"
    PAYMENT_MADE = "debt.payment_made"
    PAYMENT_DUE = "debt.payment_due"
    PAYMENT_OVERDUE = "debt.payment_overdue"
    INTEREST_ACCRUED = "debt.interest_accrued"
    PAID_OFF = "debt.paid_off"


class BillingEvents:
    """Billing/tier subscription module events."""
    TIER_UPGRADED = "billing.tier_upgraded"
    TIER_DOWNGRADED = "billing.tier_downgraded"
    SUBSCRIPTION_CREATED = "billing.subscription_created"
    SUBSCRIPTION_CANCELLED = "billing.subscription_cancelled"
    SUBSCRIPTION_EXPIRED = "billing.subscription_expired"
    PAYMENT_SUCCEEDED = "billing.payment_succeeded"
    PAYMENT_FAILED = "billing.payment_failed"
    EXPIRATION_WARNING = "billing.expiration_warning"


class DashboardEvents:
    """Dashboard module events."""
    NET_WORTH_SNAPSHOT = "dashboard.net_worth_snapshot"
    FINANCIAL_HEALTH_CALCULATED = "dashboard.financial_health_calculated"
    WEEKLY_REPORT_GENERATED = "dashboard.weekly_report_generated"


class TransactionEvents:
    """Transaction module events."""
    CREATED = "transaction.created"
    UPDATED = "transaction.updated"
    DELETED = "transaction.deleted"
    CATEGORIZED = "transaction.categorized"


# =============================================================================
# EVENT DISPATCHER
# =============================================================================

class EventDispatcher:
    """
    Central event dispatcher for the application.

    Handles registration of event handlers and dispatching of events.
    Supports:
    - Multiple handlers per event
    - Handler priorities
    - Async handlers
    - Wildcard event patterns (e.g., "income.*")
    - Error isolation (one handler failure doesn't stop others)
    """

    def __init__(self):
        self._handlers: Dict[str, List[tuple]] = {}  # event_name -> [(priority, handler)]
        self._wildcard_handlers: Dict[str, List[tuple]] = {}  # pattern -> [(priority, handler)]
        self._enabled: bool = True

    def on(
        self,
        event_name: str,
        priority: EventPriority = EventPriority.NORMAL
    ) -> Callable:
        """
        Decorator to register an event handler.

        Args:
            event_name: Event name or pattern (e.g., "income.deposited" or "income.*")
            priority: Handler priority (HIGH runs first)

        Example:
            @event_dispatcher.on("income.deposited")
            async def handle_income(event: Event):
                ...
        """
        def decorator(func: Callable) -> Callable:
            self.register(event_name, func, priority)
            return func
        return decorator

    def register(
        self,
        event_name: str,
        handler: Callable,
        priority: EventPriority = EventPriority.NORMAL
    ) -> None:
        """
        Register an event handler.

        Args:
            event_name: Event name or pattern
            handler: Async function to handle the event
            priority: Handler priority
        """
        if "*" in event_name:
            if event_name not in self._wildcard_handlers:
                self._wildcard_handlers[event_name] = []
            self._wildcard_handlers[event_name].append((priority.value, handler))
            self._wildcard_handlers[event_name].sort(key=lambda x: x[0])
        else:
            if event_name not in self._handlers:
                self._handlers[event_name] = []
            self._handlers[event_name].append((priority.value, handler))
            self._handlers[event_name].sort(key=lambda x: x[0])

        logger.debug(f"Registered handler {handler.__name__} for event {event_name}")

    def unregister(self, event_name: str, handler: Callable) -> bool:
        """
        Unregister an event handler.

        Args:
            event_name: Event name or pattern
            handler: Handler function to remove

        Returns:
            True if handler was found and removed
        """
        handlers_dict = self._wildcard_handlers if "*" in event_name else self._handlers

        if event_name in handlers_dict:
            original_len = len(handlers_dict[event_name])
            handlers_dict[event_name] = [
                (p, h) for p, h in handlers_dict[event_name] if h != handler
            ]
            return len(handlers_dict[event_name]) < original_len
        return False

    def _get_handlers_for_event(self, event_name: str) -> List[Callable]:
        """Get all handlers for an event, including wildcard matches."""
        handlers = []

        # Exact match handlers
        if event_name in self._handlers:
            handlers.extend(self._handlers[event_name])

        # Wildcard handlers
        for pattern, pattern_handlers in self._wildcard_handlers.items():
            if self._matches_pattern(event_name, pattern):
                handlers.extend(pattern_handlers)

        # Sort by priority
        handlers.sort(key=lambda x: x[0])

        return [h for _, h in handlers]

    def _matches_pattern(self, event_name: str, pattern: str) -> bool:
        """Check if event name matches a wildcard pattern."""
        if pattern == "*":
            return True
        if pattern.endswith(".*"):
            prefix = pattern[:-2]
            return event_name.startswith(prefix + ".")
        return event_name == pattern

    async def dispatch(
        self,
        event_name: str,
        user_id: Optional[UUID] = None,
        correlation_id: Optional[UUID] = None,
        **payload
    ) -> Event:
        """
        Dispatch an event to all registered handlers.

        Args:
            event_name: Name of the event
            user_id: Optional user ID associated with this event
            correlation_id: Optional ID to track related events
            **payload: Event-specific data

        Returns:
            The dispatched Event object
        """
        if not self._enabled:
            logger.debug(f"Event dispatcher disabled, skipping {event_name}")
            return None

        event = Event(
            name=event_name,
            payload=payload,
            user_id=user_id,
            correlation_id=correlation_id
        )

        logger.info(f"Dispatching event: {event}")

        handlers = self._get_handlers_for_event(event_name)

        if not handlers:
            logger.debug(f"No handlers registered for event {event_name}")
            return event

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(
                    f"Error in handler {handler.__name__} for event {event_name}: {e}",
                    exc_info=True
                )
                # Continue with other handlers even if one fails

        return event

    def dispatch_sync(
        self,
        event_name: str,
        user_id: Optional[UUID] = None,
        correlation_id: Optional[UUID] = None,
        **payload
    ) -> Event:
        """
        Dispatch an event synchronously (for use in Celery tasks).

        Creates a new event loop if necessary.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're in an async context, create a new task
                return asyncio.create_task(
                    self.dispatch(event_name, user_id, correlation_id, **payload)
                )
            else:
                return loop.run_until_complete(
                    self.dispatch(event_name, user_id, correlation_id, **payload)
                )
        except RuntimeError:
            # No event loop, create one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(
                    self.dispatch(event_name, user_id, correlation_id, **payload)
                )
            finally:
                loop.close()

    def enable(self) -> None:
        """Enable event dispatching."""
        self._enabled = True
        logger.info("Event dispatcher enabled")

    def disable(self) -> None:
        """Disable event dispatching (useful for tests)."""
        self._enabled = False
        logger.info("Event dispatcher disabled")

    def clear_handlers(self) -> None:
        """Clear all registered handlers (useful for tests)."""
        self._handlers.clear()
        self._wildcard_handlers.clear()
        logger.info("All event handlers cleared")


# Global event dispatcher instance
event_dispatcher = EventDispatcher()
