"""
Income Distribution Service.
Handles distribution rules for splitting income across accounts and goals.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Tuple
from uuid import UUID
import logging

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.income.models import (
    IncomeDistributionRule,
    IncomeSource,
    IncomeTransaction,
    IncomeTransactionStatus,
    DistributionType,
)
from app.modules.income.schemas import (
    IncomeDistributionRuleCreate,
    IncomeDistributionRuleUpdate,
    IncomeDistributionRuleResponse,
    DistributionPreview,
    IncomeDistributionPreviewResponse,
)
from app.modules.savings.models import SavingsAccount
from app.modules.savings.transaction_service import TransactionService
from app.modules.goals.models import Goal

logger = logging.getLogger(__name__)


class DistributionServiceError(Exception):
    """Base exception for distribution service errors."""
    pass


class RuleNotFoundError(DistributionServiceError):
    """Raised when a distribution rule is not found."""
    pass


class InvalidRuleError(DistributionServiceError):
    """Raised when rule configuration is invalid."""
    pass


class DistributionService:
    """Service for managing income distribution rules."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_rule(
        self,
        user_id: UUID,
        rule_data: IncomeDistributionRuleCreate,
    ) -> IncomeDistributionRule:
        """
        Create a new distribution rule.

        Args:
            user_id: User UUID
            rule_data: Rule creation data

        Returns:
            Created IncomeDistributionRule

        Raises:
            InvalidRuleError: If rule configuration is invalid
        """
        # Validate rule has at least one target
        if not rule_data.target_account_id and not rule_data.target_goal_id:
            raise InvalidRuleError("Rule must have either a target account or target goal")

        # Validate distribution type has required field
        if rule_data.distribution_type == DistributionType.PERCENTAGE:
            if rule_data.percentage is None:
                raise InvalidRuleError("Percentage type requires percentage value")
        elif rule_data.distribution_type == DistributionType.FIXED_AMOUNT:
            if rule_data.amount is None:
                raise InvalidRuleError("Fixed amount type requires amount value")

        # Validate income source exists if specified
        if rule_data.income_source_id:
            source = await self.db.get(IncomeSource, rule_data.income_source_id)
            if not source or source.user_id != user_id:
                raise InvalidRuleError("Invalid income source")

        # Validate target account exists if specified
        if rule_data.target_account_id:
            account = await self.db.get(SavingsAccount, rule_data.target_account_id)
            if not account or account.user_id != user_id:
                raise InvalidRuleError("Invalid target account")

        # Validate target goal exists if specified
        if rule_data.target_goal_id:
            goal = await self.db.get(Goal, rule_data.target_goal_id)
            if not goal or goal.user_id != user_id:
                raise InvalidRuleError("Invalid target goal")

        rule = IncomeDistributionRule(
            user_id=user_id,
            income_source_id=rule_data.income_source_id,
            target_account_id=rule_data.target_account_id,
            target_goal_id=rule_data.target_goal_id,
            distribution_type=rule_data.distribution_type,
            amount=rule_data.amount,
            percentage=rule_data.percentage,
            priority=rule_data.priority,
            name=rule_data.name,
            is_active=rule_data.is_active,
        )

        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)

        logger.info(f"Created distribution rule {rule.id} for user {user_id}")
        return rule

    async def get_rule(self, rule_id: UUID, user_id: UUID) -> IncomeDistributionRule:
        """Get a distribution rule by ID."""
        result = await self.db.execute(
            select(IncomeDistributionRule).where(
                and_(
                    IncomeDistributionRule.id == rule_id,
                    IncomeDistributionRule.user_id == user_id,
                    IncomeDistributionRule.deleted_at.is_(None),
                )
            )
        )
        rule = result.scalar_one_or_none()
        if not rule:
            raise RuleNotFoundError(f"Rule {rule_id} not found")
        return rule

    async def get_rules(
        self,
        user_id: UUID,
        income_source_id: Optional[UUID] = None,
        is_active: Optional[bool] = None,
    ) -> List[IncomeDistributionRule]:
        """
        Get distribution rules for a user.

        Args:
            user_id: User UUID
            income_source_id: Optional filter by income source
            is_active: Optional filter by active status

        Returns:
            List of IncomeDistributionRule
        """
        query = select(IncomeDistributionRule).where(
            and_(
                IncomeDistributionRule.user_id == user_id,
                IncomeDistributionRule.deleted_at.is_(None),
            )
        )

        if income_source_id is not None:
            # Get rules for specific source OR global rules (null income_source_id)
            query = query.where(
                (IncomeDistributionRule.income_source_id == income_source_id) |
                (IncomeDistributionRule.income_source_id.is_(None))
            )

        if is_active is not None:
            query = query.where(IncomeDistributionRule.is_active == is_active)

        query = query.order_by(IncomeDistributionRule.priority)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_rule(
        self,
        rule_id: UUID,
        user_id: UUID,
        rule_data: IncomeDistributionRuleUpdate,
    ) -> IncomeDistributionRule:
        """Update a distribution rule."""
        rule = await self.get_rule(rule_id, user_id)

        update_data = rule_data.model_dump(exclude_unset=True)

        # Validate targets if being updated
        if 'target_account_id' in update_data and update_data['target_account_id']:
            account = await self.db.get(SavingsAccount, update_data['target_account_id'])
            if not account or account.user_id != user_id:
                raise InvalidRuleError("Invalid target account")

        if 'target_goal_id' in update_data and update_data['target_goal_id']:
            goal = await self.db.get(Goal, update_data['target_goal_id'])
            if not goal or goal.user_id != user_id:
                raise InvalidRuleError("Invalid target goal")

        for key, value in update_data.items():
            setattr(rule, key, value)

        rule.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(rule)

        logger.info(f"Updated distribution rule {rule_id}")
        return rule

    async def delete_rule(self, rule_id: UUID, user_id: UUID) -> bool:
        """Soft delete a distribution rule."""
        rule = await self.get_rule(rule_id, user_id)
        rule.deleted_at = datetime.utcnow()
        await self.db.commit()
        logger.info(f"Deleted distribution rule {rule_id}")
        return True

    async def preview_distribution(
        self,
        user_id: UUID,
        income_amount: Decimal,
        currency: str,
        income_source_id: Optional[UUID] = None,
    ) -> IncomeDistributionPreviewResponse:
        """
        Preview how income would be distributed without actually applying.

        Args:
            user_id: User UUID
            income_amount: Amount to distribute
            currency: Currency code
            income_source_id: Optional income source for source-specific rules

        Returns:
            IncomeDistributionPreviewResponse with distribution preview
        """
        rules = await self.get_rules(user_id, income_source_id, is_active=True)

        distributions: List[DistributionPreview] = []
        remaining = income_amount
        total_distributed = Decimal("0")

        for rule in rules:
            if remaining <= 0:
                break

            # Calculate distribution amount
            dist_amount = Decimal("0")
            if rule.distribution_type == DistributionType.PERCENTAGE:
                dist_amount = income_amount * (rule.percentage / Decimal("100"))
            elif rule.distribution_type == DistributionType.FIXED_AMOUNT:
                dist_amount = min(rule.amount, remaining)
            elif rule.distribution_type == DistributionType.REMAINDER:
                dist_amount = remaining

            if dist_amount <= 0:
                continue

            # Get target name
            target_type = "account" if rule.target_account_id else "goal"
            target_id = rule.target_account_id or rule.target_goal_id
            target_name = "Unknown"

            if rule.target_account_id:
                account = await self.db.get(SavingsAccount, rule.target_account_id)
                if account:
                    target_name = account.name
            elif rule.target_goal_id:
                goal = await self.db.get(Goal, rule.target_goal_id)
                if goal:
                    target_name = goal.name

            distributions.append(DistributionPreview(
                rule_id=rule.id,
                rule_name=rule.name,
                target_type=target_type,
                target_id=target_id,
                target_name=target_name,
                amount=dist_amount,
                currency=currency,
            ))

            total_distributed += dist_amount
            remaining -= dist_amount

        return IncomeDistributionPreviewResponse(
            income_amount=income_amount,
            currency=currency,
            distributions=distributions,
            remaining_amount=remaining,
            total_distributed=total_distributed,
        )

    async def apply_distribution(
        self,
        user_id: UUID,
        income_transaction_id: UUID,
    ) -> List[Tuple[UUID, Decimal]]:
        """
        Apply distribution rules to an income transaction.

        Args:
            user_id: User UUID
            income_transaction_id: Income transaction to distribute

        Returns:
            List of (account_transaction_id, amount) tuples for created deposits
        """
        # Get the income transaction
        result = await self.db.execute(
            select(IncomeTransaction).where(
                and_(
                    IncomeTransaction.id == income_transaction_id,
                    IncomeTransaction.user_id == user_id,
                )
            )
        )
        transaction = result.scalar_one_or_none()
        if not transaction:
            raise DistributionServiceError("Income transaction not found")

        # Preview distribution
        preview = await self.preview_distribution(
            user_id,
            transaction.amount,
            transaction.currency,
            transaction.source_id,
        )

        # Apply each distribution
        transaction_service = TransactionService(self.db)
        created_deposits: List[Tuple[UUID, Decimal]] = []

        for dist in preview.distributions:
            if dist.target_type == "account":
                try:
                    # Create deposit to account
                    account_txn = await transaction_service.create_deposit(
                        account_id=dist.target_id,
                        user_id=user_id,
                        amount=dist.amount,
                        source_type="income",
                        source_id=income_transaction_id,
                        description=f"Income distribution: {dist.rule_name or 'Auto-distribution'}",
                    )
                    created_deposits.append((account_txn.id, dist.amount))
                except Exception as e:
                    logger.error(f"Failed to apply distribution to account {dist.target_id}: {e}")

            elif dist.target_type == "goal":
                try:
                    # Get the goal and update its current_amount
                    goal_result = await self.db.execute(
                        select(Goal).where(
                            and_(
                                Goal.id == dist.target_id,
                                Goal.user_id == user_id,
                                Goal.is_active == True
                            )
                        )
                    )
                    goal = goal_result.scalar_one_or_none()

                    if goal:
                        # Add the distribution amount to the goal's current amount
                        goal.current_amount = Decimal(str(goal.current_amount)) + dist.amount

                        # Recalculate progress percentage
                        if goal.target_amount and goal.target_amount > 0:
                            goal.progress_percentage = (goal.current_amount / goal.target_amount) * 100

                        # Check for completion
                        if goal.current_amount >= goal.target_amount and not goal.is_completed:
                            goal.is_completed = True
                            goal.completed_at = datetime.utcnow()

                        goal.updated_at = datetime.utcnow()

                        # Record progress snapshot
                        from app.modules.goals.service import record_progress_snapshot
                        await record_progress_snapshot(
                            self.db, user_id, goal.id,
                            current_amount=goal.current_amount,
                            trigger_type="transaction",
                            notes=f"Income distribution: {dist.rule_name or 'Auto-distribution'}"
                        )

                        logger.info(f"Distributed {dist.amount} to goal {dist.target_id}")
                    else:
                        logger.warning(f"Goal {dist.target_id} not found or inactive for distribution")
                except Exception as e:
                    logger.error(f"Failed to distribute to goal {dist.target_id}: {e}")

        # Update income transaction status if any deposits were made
        if created_deposits:
            transaction.status = IncomeTransactionStatus.DEPOSITED
            transaction.deposited_to_account_id = preview.distributions[0].target_id if preview.distributions else None
            if created_deposits:
                transaction.account_transaction_id = created_deposits[0][0]
            await self.db.commit()

        logger.info(f"Applied distribution for income transaction {income_transaction_id}: {len(created_deposits)} deposits")
        return created_deposits

    async def enrich_rule_response(
        self,
        rule: IncomeDistributionRule,
    ) -> IncomeDistributionRuleResponse:
        """
        Enrich a rule with related entity names for response.
        """
        response_data = {
            "id": rule.id,
            "user_id": rule.user_id,
            "income_source_id": rule.income_source_id,
            "target_account_id": rule.target_account_id,
            "target_goal_id": rule.target_goal_id,
            "distribution_type": rule.distribution_type,
            "amount": rule.amount,
            "percentage": rule.percentage,
            "priority": rule.priority,
            "name": rule.name,
            "is_active": rule.is_active,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at,
        }

        # Get related entity names
        if rule.income_source_id:
            source = await self.db.get(IncomeSource, rule.income_source_id)
            if source:
                response_data["income_source_name"] = source.name

        if rule.target_account_id:
            account = await self.db.get(SavingsAccount, rule.target_account_id)
            if account:
                response_data["target_account_name"] = account.name

        if rule.target_goal_id:
            goal = await self.db.get(Goal, rule.target_goal_id)
            if goal:
                response_data["target_goal_name"] = goal.name

        return IncomeDistributionRuleResponse(**response_data)
