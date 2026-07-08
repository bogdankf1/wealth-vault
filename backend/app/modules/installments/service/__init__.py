"""
Installments module service layer.
"""
from .common import (
    logger,
    get_user_display_currency,
    convert_installment_to_display_currency,
    calculate_remaining_balance,
    calculate_payments_made,
    calculate_end_date,
    calculate_next_installment_payment_date,
)
from .crud import (
    create_installment,
    get_installment,
    list_installments,
    update_installment,
    delete_installment,
    mark_installment_completed,
    mark_installment_defaulted,
    reactivate_installment,
)
from .payments import (
    process_installment_payment,
    backfill_installment_payments,
    reverse_installment_payments,
    get_installment_payments,
    get_due_installments,
    get_installments_for_reminder,
)
from .stats import (
    get_installment_stats,
    get_installment_history,
)

__all__ = [
    "logger",
    "get_user_display_currency",
    "convert_installment_to_display_currency",
    "calculate_remaining_balance",
    "calculate_payments_made",
    "calculate_end_date",
    "calculate_next_installment_payment_date",
    "create_installment",
    "get_installment",
    "list_installments",
    "update_installment",
    "delete_installment",
    "mark_installment_completed",
    "mark_installment_defaulted",
    "reactivate_installment",
    "process_installment_payment",
    "backfill_installment_payments",
    "reverse_installment_payments",
    "get_installment_payments",
    "get_due_installments",
    "get_installments_for_reminder",
    "get_installment_stats",
    "get_installment_history",
]
