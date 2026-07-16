"""
Celery tasks package for background job processing.

This package contains all scheduled and async tasks for the Wealth Vault application.
Tasks are organized by module/functionality.
"""

# Import all task modules to ensure they're registered with Celery
from app.tasks.base import BaseTask
from app.tasks import (
    income_tasks,
    expense_tasks,
    subscription_tasks,
    installment_tasks,
    budget_tasks,
    savings_tasks,
    portfolio_tasks,
    goal_tasks,
    debt_tasks,
    billing_tasks,
    dashboard_tasks,
    notification_tasks,
    tax_tasks,
    demo_tasks,
)

__all__ = [
    "BaseTask",
    "income_tasks",
    "expense_tasks",
    "subscription_tasks",
    "installment_tasks",
    "budget_tasks",
    "savings_tasks",
    "portfolio_tasks",
    "goal_tasks",
    "debt_tasks",
    "billing_tasks",
    "dashboard_tasks",
    "notification_tasks",
    "tax_tasks",
    "demo_tasks",
]
