"""
Taxes module service layer
"""
from .common import (
    get_user_display_currency,
    get_current_period_range,
    get_tax_payment_status,
    get_total_monthly_income,
    convert_tax_to_display_currency,
    calculate_next_payment_date,
)
from .crud import (
    create_tax,
    get_tax,
    get_taxes,
    update_tax,
    delete_tax,
    batch_delete_taxes,
)
from .payments import (
    create_tax_payment,
    get_tax_payments,
    get_tax_payment,
    delete_tax_payment,
    get_taxes_due_for_auto_pay,
    pay_tax,
)
from .stats import (
    get_tax_stats,
    get_income_tax_summary,
)

__all__ = [
    "get_user_display_currency",
    "get_current_period_range",
    "get_tax_payment_status",
    "get_total_monthly_income",
    "convert_tax_to_display_currency",
    "calculate_next_payment_date",
    "create_tax",
    "get_tax",
    "get_taxes",
    "update_tax",
    "delete_tax",
    "batch_delete_taxes",
    "create_tax_payment",
    "get_tax_payments",
    "get_tax_payment",
    "delete_tax_payment",
    "get_taxes_due_for_auto_pay",
    "pay_tax",
    "get_tax_stats",
    "get_income_tax_summary",
]
