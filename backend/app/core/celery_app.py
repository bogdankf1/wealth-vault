"""
Celery application configuration for background tasks.

Railway deployment (single combined worker + beat process):
  celery -A app.core.celery_app worker --beat --pool=solo --loglevel=info

This runs both the task worker and the beat scheduler in one process
using the solo pool (no child processes), minimizing memory usage.
"""
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "wealth_vault",
    broker=settings.REDIS_URL,
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
        "app.tasks.tax_tasks",
        "app.tasks.demo_tasks",
    ]
)

# Celery configuration — optimized for low memory on Railway
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # Task time limits
    task_time_limit=30 * 60,      # 30 minutes hard limit
    task_soft_time_limit=25 * 60,  # 25 minutes soft limit
    # Disable result backend — tasks don't consume results, saves Redis memory
    task_ignore_result=True,
    result_backend=None,
    # Memory optimization for solo/prefork pools
    worker_prefetch_multiplier=1,   # Don't prefetch extra tasks
    worker_max_tasks_per_child=50,  # Recycle after 50 tasks (prefork only)
    # Broker connection limits
    broker_pool_limit=1,
    broker_connection_retry_on_startup=True,
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
# All tasks consolidated into a tight overnight window (00:00–01:15 UTC)
# so the worker is only active for ~75 minutes per night.
#
# Weekly tasks run Sunday/Monday at 02:00 UTC.
# Monthly tasks run on the 1st at 02:00 UTC (after daily tasks complete).
# =============================================================================

celery_app.conf.beat_schedule = {
    # =========================================================================
    # DAILY TASKS — Core financial processing (00:00–00:45 UTC)
    # =========================================================================

    "process-recurring-income": {
        "task": "tasks.income.process_recurring_income",
        "schedule": crontab(hour=0, minute=0),
        "options": {"queue": "default"},
    },
    "process-recurring-expenses": {
        "task": "tasks.expense.process_recurring_expenses",
        "schedule": crontab(hour=0, minute=3),
        "options": {"queue": "default"},
    },
    "check-overdue-expenses": {
        "task": "tasks.expense.check_overdue_expenses",
        "schedule": crontab(hour=0, minute=6),
        "options": {"queue": "default"},
    },
    "process-subscription-renewals": {
        "task": "tasks.subscription.process_renewals",
        "schedule": crontab(hour=0, minute=9),
        "options": {"queue": "default"},
    },
    "check-expired-subscriptions": {
        "task": "tasks.subscription.check_expired_subscriptions",
        "schedule": crontab(hour=0, minute=12),
        "options": {"queue": "default"},
    },
    "process-installment-payments": {
        "task": "tasks.installment.process_payments",
        "schedule": crontab(hour=0, minute=15),
        "options": {"queue": "default"},
    },
    "check-late-installment-payments": {
        "task": "tasks.installment.check_late_payments",
        "schedule": crontab(hour=0, minute=18),
        "options": {"queue": "default"},
    },
    "mark-completed-installments": {
        "task": "tasks.installment.mark_completed",
        "schedule": crontab(hour=0, minute=21),
        "options": {"queue": "low_priority"},
    },
    "calculate-daily-interest": {
        "task": "tasks.savings.calculate_daily_interest",
        "schedule": crontab(hour=0, minute=24),
        "options": {"queue": "default"},
    },
    "check-overdue-debts": {
        "task": "tasks.debt.check_overdue_debts",
        "schedule": crontab(hour=0, minute=27),
        "options": {"queue": "default"},
    },
    "process-tax-auto-payments": {
        "task": "tasks.tax.process_auto_pay",
        "schedule": crontab(hour=0, minute=30),
        "options": {"queue": "default"},
    },
    "process-portfolio-dividends": {
        "task": "tasks.portfolio.process_dividends",
        "schedule": crontab(hour=0, minute=33),
        "options": {"queue": "default"},
    },
    "update-goal-progress": {
        "task": "tasks.goal.update_progress_from_accounts",
        "schedule": crontab(hour=0, minute=36),
        "options": {"queue": "default"},
    },
    "check-goal-deadlines": {
        "task": "tasks.goal.check_goal_deadlines",
        "schedule": crontab(hour=0, minute=39),
        "options": {"queue": "default"},
    },
    "check-tier-expirations": {
        "task": "tasks.billing.check_tier_expirations",
        "schedule": crontab(hour=0, minute=42),
        "options": {"queue": "high_priority"},
    },
    "check-trial-expirations": {
        "task": "tasks.billing.check_trial_expirations",
        "schedule": crontab(hour=0, minute=44),
        "options": {"queue": "high_priority"},
    },
    "check-budget-alerts": {
        "task": "tasks.budget.check_alerts",
        "schedule": crontab(hour=0, minute=45),
        "options": {"queue": "default"},
    },

    # =========================================================================
    # DAILY TASKS — Notifications & reminders (00:48–01:00 UTC)
    # =========================================================================

    "send-subscription-renewal-reminders": {
        "task": "tasks.subscription.send_renewal_reminders",
        "schedule": crontab(hour=0, minute=48),
        "options": {"queue": "default"},
    },
    "send-debt-payment-reminders": {
        "task": "tasks.debt.send_payment_reminders",
        "schedule": crontab(hour=0, minute=51),
        "options": {"queue": "default"},
    },
    "send-tax-payment-reminders": {
        "task": "tasks.tax.send_payment_reminders",
        "schedule": crontab(hour=0, minute=54),
        "options": {"queue": "default"},
    },
    "send-tier-expiration-warnings": {
        "task": "tasks.billing.send_expiration_warnings",
        "schedule": crontab(hour=0, minute=57),
        "options": {"queue": "default"},
    },

    # =========================================================================
    # DAILY TASKS — Snapshots & maintenance (01:00–01:15 UTC)
    # =========================================================================

    "create-balance-snapshots": {
        "task": "tasks.savings.create_balance_snapshot",
        "schedule": crontab(hour=1, minute=0),
        "options": {"queue": "low_priority"},
    },
    "create-goal-progress-snapshots": {
        "task": "tasks.goal.create_progress_snapshots",
        "schedule": crontab(hour=1, minute=3),
        "options": {"queue": "low_priority"},
    },
    "update-portfolio-prices": {
        "task": "tasks.portfolio.update_prices",
        "schedule": crontab(hour=1, minute=6),
        "options": {"queue": "low_priority"},
    },
    "cleanup-old-notifications": {
        "task": "tasks.notification.cleanup_old_notifications",
        "schedule": crontab(hour=1, minute=9),
        "options": {"queue": "low_priority"},
        "kwargs": {"days_old": 90},
    },
    "purge-expired-demo-users": {
        "task": "tasks.demo.purge_expired_demo_users",
        "schedule": crontab(hour=1, minute=12),
        "options": {"queue": "low_priority"},
    },

    # =========================================================================
    # WEEKLY TASKS — Sunday & Monday at 02:00 UTC
    # =========================================================================

    "calculate-portfolio-performance": {
        "task": "tasks.portfolio.calculate_performance",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),
        "options": {"queue": "low_priority"},
    },
    "calculate-financial-health": {
        "task": "tasks.dashboard.calculate_financial_health",
        "schedule": crontab(hour=2, minute=3, day_of_week=0),
        "options": {"queue": "low_priority"},
    },
    "sync-stripe-status": {
        "task": "tasks.billing.sync_stripe_status",
        "schedule": crontab(hour=2, minute=6, day_of_week=0),
        "options": {"queue": "default"},
    },
    # TODO: Re-enable when report generation and email delivery are implemented
    # "generate-weekly-report": {
    #     "task": "tasks.dashboard.generate_weekly_report",
    #     "schedule": crontab(hour=2, minute=0, day_of_week=1),
    #     "options": {"queue": "low_priority"},
    # },
    # "calculate-budget-weekly-summary": {
    #     "task": "tasks.budget.calculate_weekly_summary",
    #     "schedule": crontab(hour=2, minute=3, day_of_week=1),
    #     "options": {"queue": "low_priority"},
    # },

    # =========================================================================
    # MONTHLY TASKS — 1st of each month at 02:00 UTC (after daily tasks)
    # =========================================================================

    "process-budget-period-resets": {
        "task": "tasks.budget.process_period_resets",
        "schedule": crontab(hour=2, minute=0, day_of_month=1),
        "options": {"queue": "default"},
    },
    "accrue-monthly-interest": {
        "task": "tasks.savings.accrue_monthly_interest",
        "schedule": crontab(hour=2, minute=3, day_of_month=1),
        "options": {"queue": "default"},
    },
    "calculate-debt-monthly-interest": {
        "task": "tasks.debt.calculate_monthly_interest",
        "schedule": crontab(hour=2, minute=6, day_of_month=1),
        "options": {"queue": "default"},
    },
    "create-net-worth-snapshot": {
        "task": "tasks.dashboard.create_monthly_snapshot",
        "schedule": crontab(hour=2, minute=9, day_of_month=1),
        "options": {"queue": "default"},
    },
    "create-cash-flow-snapshot": {
        "task": "tasks.dashboard.create_cash_flow_snapshot",
        "schedule": crontab(hour=2, minute=12, day_of_month=1),
        "options": {"queue": "default"},
    },
}
