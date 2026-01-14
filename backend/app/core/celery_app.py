"""
Celery application configuration for background tasks.
"""
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "wealth_vault",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.income_tasks",
        "app.tasks.expense_tasks",
        "app.tasks.subscription_tasks",
        "app.tasks.installment_tasks",
        "app.tasks.budget_tasks",
        "app.tasks.savings_tasks",
        "app.tasks.portfolio_tasks",
        "app.tasks.goal_tasks",
        "app.tasks.debt_tasks",
        "app.tasks.billing_tasks",
        "app.tasks.dashboard_tasks",
        "app.tasks.notification_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    # Result expiration
    result_expires=3600,  # 1 hour
    # Task routing
    task_default_queue="default",
    task_queues={
        "default": {},
        "high_priority": {},
        "low_priority": {},
    },
)

# =============================================================================
# CELERY BEAT SCHEDULE
# =============================================================================
# All scheduled tasks for the Wealth Vault application
# Times are in UTC
# =============================================================================

celery_app.conf.beat_schedule = {
    # =========================================================================
    # DAILY TASKS - Run at midnight UTC
    # =========================================================================

    # Income tasks
    "process-recurring-income": {
        "task": "tasks.income.process_recurring_income",
        "schedule": crontab(hour=0, minute=0),
        "options": {"queue": "default"},
    },

    # Expense tasks
    "process-recurring-expenses": {
        "task": "tasks.expense.process_recurring_expenses",
        "schedule": crontab(hour=0, minute=5),
        "options": {"queue": "default"},
    },
    "check-overdue-expenses": {
        "task": "tasks.expense.check_overdue_expenses",
        "schedule": crontab(hour=0, minute=10),
        "options": {"queue": "default"},
    },

    # Subscription tasks
    "process-subscription-renewals": {
        "task": "tasks.subscription.process_renewals",
        "schedule": crontab(hour=0, minute=15),
        "options": {"queue": "default"},
    },
    "send-subscription-renewal-reminders": {
        "task": "tasks.subscription.send_renewal_reminders",
        "schedule": crontab(hour=8, minute=0),  # Morning reminders
        "options": {"queue": "default"},
    },
    "check-expired-subscriptions": {
        "task": "tasks.subscription.check_expired_subscriptions",
        "schedule": crontab(hour=0, minute=20),
        "options": {"queue": "default"},
    },

    # Installment tasks
    "process-installment-payments": {
        "task": "tasks.installment.process_payments",
        "schedule": crontab(hour=0, minute=25),
        "options": {"queue": "default"},
    },
    "check-late-installment-payments": {
        "task": "tasks.installment.check_late_payments",
        "schedule": crontab(hour=0, minute=30),
        "options": {"queue": "default"},
    },
    "mark-completed-installments": {
        "task": "tasks.installment.mark_completed",
        "schedule": crontab(hour=0, minute=35),
        "options": {"queue": "low_priority"},
    },

    # Savings tasks
    "calculate-daily-interest": {
        "task": "tasks.savings.calculate_daily_interest",
        "schedule": crontab(hour=0, minute=40),
        "options": {"queue": "default"},
    },
    "create-balance-snapshots": {
        "task": "tasks.savings.create_balance_snapshot",
        "schedule": crontab(hour=1, minute=0),
        "options": {"queue": "low_priority"},
    },

    # Goal tasks
    "update-goal-progress": {
        "task": "tasks.goal.update_progress_from_accounts",
        "schedule": crontab(hour=1, minute=15),
        "options": {"queue": "default"},
    },
    "check-goal-deadlines": {
        "task": "tasks.goal.check_goal_deadlines",
        "schedule": crontab(hour=8, minute=30),  # Morning check
        "options": {"queue": "default"},
    },
    "create-goal-progress-snapshots": {
        "task": "tasks.goal.create_progress_snapshots",
        "schedule": crontab(hour=1, minute=30),
        "options": {"queue": "low_priority"},
    },

    # Debt tasks
    "send-debt-payment-reminders": {
        "task": "tasks.debt.send_payment_reminders",
        "schedule": crontab(hour=9, minute=0),  # Morning reminders
        "options": {"queue": "default"},
    },
    "check-overdue-debts": {
        "task": "tasks.debt.check_overdue_debts",
        "schedule": crontab(hour=0, minute=45),
        "options": {"queue": "default"},
    },

    # Tax tasks
    "process-tax-auto-payments": {
        "task": "tasks.tax.process_auto_pay",
        "schedule": crontab(hour=0, minute=50),  # Daily at midnight
        "options": {"queue": "default"},
    },
    "send-tax-payment-reminders": {
        "task": "tasks.tax.send_payment_reminders",
        "schedule": crontab(hour=9, minute=30),  # Morning reminders
        "options": {"queue": "default"},
    },

    # Budget tasks - check twice daily for timely alerts
    "check-budget-alerts-morning": {
        "task": "tasks.budget.check_alerts",
        "schedule": crontab(hour=8, minute=0),  # Morning alerts
        "options": {"queue": "default"},
    },
    "check-budget-alerts-evening": {
        "task": "tasks.budget.check_alerts",
        "schedule": crontab(hour=20, minute=0),  # Evening alerts
        "options": {"queue": "default"},
    },

    # Billing tasks
    "check-tier-expirations": {
        "task": "tasks.billing.check_tier_expirations",
        "schedule": crontab(hour=0, minute=50),
        "options": {"queue": "high_priority"},
    },
    "send-tier-expiration-warnings": {
        "task": "tasks.billing.send_expiration_warnings",
        "schedule": crontab(hour=9, minute=30),  # Morning warnings
        "options": {"queue": "default"},
    },

    # Portfolio tasks (daily price updates - if API is configured)
    "update-portfolio-prices": {
        "task": "tasks.portfolio.update_prices",
        "schedule": crontab(hour=18, minute=0),  # After market close
        "options": {"queue": "low_priority"},
    },
    "process-portfolio-dividends": {
        "task": "tasks.portfolio.process_dividends",
        "schedule": crontab(hour=0, minute=55),
        "options": {"queue": "default"},
    },

    # Notification cleanup
    "cleanup-old-notifications": {
        "task": "tasks.notification.cleanup_old_notifications",
        "schedule": crontab(hour=3, minute=0),  # 3 AM cleanup
        "options": {"queue": "low_priority"},
        "kwargs": {"days_old": 90},
    },

    # =========================================================================
    # WEEKLY TASKS
    # =========================================================================

    "calculate-budget-weekly-summary": {
        "task": "tasks.budget.calculate_weekly_summary",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday morning
        "options": {"queue": "low_priority"},
    },
    "calculate-portfolio-performance": {
        "task": "tasks.portfolio.calculate_performance",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),  # Sunday 2 AM
        "options": {"queue": "low_priority"},
    },
    "calculate-financial-health": {
        "task": "tasks.dashboard.calculate_financial_health",
        "schedule": crontab(hour=2, minute=30, day_of_week=0),  # Sunday 2:30 AM
        "options": {"queue": "low_priority"},
    },
    "generate-weekly-report": {
        "task": "tasks.dashboard.generate_weekly_report",
        "schedule": crontab(hour=7, minute=0, day_of_week=1),  # Monday 7 AM
        "options": {"queue": "low_priority"},
    },
    "sync-stripe-status": {
        "task": "tasks.billing.sync_stripe_status",
        "schedule": crontab(hour=4, minute=0, day_of_week=0),  # Sunday 4 AM
        "options": {"queue": "default"},
    },

    # =========================================================================
    # MONTHLY TASKS - Run on 1st of each month
    # =========================================================================

    "create-net-worth-snapshot": {
        "task": "tasks.dashboard.create_monthly_snapshot",
        "schedule": crontab(hour=2, minute=0, day_of_month=1),
        "options": {"queue": "default"},
    },
    "accrue-monthly-interest": {
        "task": "tasks.savings.accrue_monthly_interest",
        "schedule": crontab(hour=0, minute=30, day_of_month=1),
        "options": {"queue": "default"},
    },
    "process-budget-period-resets": {
        "task": "tasks.budget.process_period_resets",
        "schedule": crontab(hour=0, minute=15, day_of_month=1),
        "options": {"queue": "default"},
    },
    "calculate-debt-monthly-interest": {
        "task": "tasks.debt.calculate_monthly_interest",
        "schedule": crontab(hour=1, minute=0, day_of_month=1),
        "options": {"queue": "default"},
    },
}
