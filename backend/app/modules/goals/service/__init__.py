"""
Goals module service layer.
"""
from .common import (
    logger,
    get_user_display_currency,
    convert_goal_to_display_currency,
    calculate_progress_percentage,
    calculate_projected_completion_date,
)
from .crud import (
    create_goal,
    get_goal,
    list_goals,
    update_goal,
    delete_goal,
)
from .accounts import (
    link_account_to_goal,
    unlink_account_from_goal,
    update_account_link,
    get_goal_linked_accounts,
    get_goals_by_linked_account,
    calculate_progress_from_accounts,
    update_goal_progress_from_accounts,
    record_progress_snapshot,
    get_progress_history,
    get_goal_with_linked_accounts_total,
    enrich_goal_with_linked_accounts,
)
from .stats import get_goal_stats

__all__ = [
    "logger",
    "get_user_display_currency",
    "convert_goal_to_display_currency",
    "calculate_progress_percentage",
    "calculate_projected_completion_date",
    "create_goal",
    "get_goal",
    "list_goals",
    "update_goal",
    "delete_goal",
    "link_account_to_goal",
    "unlink_account_from_goal",
    "update_account_link",
    "get_goal_linked_accounts",
    "get_goals_by_linked_account",
    "calculate_progress_from_accounts",
    "update_goal_progress_from_accounts",
    "record_progress_snapshot",
    "get_progress_history",
    "get_goal_with_linked_accounts_total",
    "enrich_goal_with_linked_accounts",
    "get_goal_stats",
]
