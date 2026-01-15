"""
AI Insights Service
Generate intelligent financial insights using AI
"""
import logging
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from openai import OpenAI
import os
from uuid import UUID

logger = logging.getLogger(__name__)

from app.modules.ai.models import AIInsight
from app.modules.expenses.models import Expense
from app.modules.income.models import IncomeSource
from app.modules.savings.models import SavingsAccount
from app.modules.subscriptions.models import Subscription
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency."""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


class AIInsightsService:
    """Service for generating AI-powered financial insights"""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        """Lazy-load OpenAI client"""
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set")
            self._client = OpenAI(api_key=api_key)
        return self._client

    async def generate_spending_insights(
        self, db: AsyncSession, user_id: UUID, period_days: int = 30
    ) -> List[str]:
        """
        Generate insights about spending patterns

        Args:
            db: Database session
            user_id: User ID
            period_days: Number of days to analyze

        Returns:
            List of insight strings
        """
        # Get expenses for the period
        start_date = datetime.utcnow() - timedelta(days=period_days)

        result = await db.execute(
            select(Expense)
            .where(
                Expense.user_id == user_id,
                Expense.is_active == True,
                Expense.start_date >= start_date,
            )
            .order_by(desc(Expense.start_date))
        )
        expenses = result.scalars().all()

        if not expenses:
            return []

        # Get user's display currency and convert all amounts
        display_currency = await get_user_display_currency(db, user_id)
        currency_service = CurrencyService(db)

        # Convert all expense amounts to display currency before summing
        total_spending = Decimal("0")
        category_spending: Dict[str, Decimal] = {}

        for expense in expenses:
            # Convert amount to display currency
            converted_amount = await currency_service.convert_amount(
                Decimal(str(expense.amount)),
                expense.currency,
                display_currency
            )
            # Use converted amount or original if conversion fails
            if converted_amount is not None:
                amount_in_display = converted_amount
            else:
                logger.warning(
                    f"Currency conversion failed for expense {expense.id}: "
                    f"could not convert {expense.currency} to {display_currency}"
                )
                amount_in_display = Decimal(str(expense.amount))

            total_spending += amount_in_display

            category = expense.category or "Other"
            category_spending[category] = category_spending.get(category, Decimal("0")) + amount_in_display

        # Find top categories
        top_categories = sorted(
            category_spending.items(), key=lambda x: x[1], reverse=True
        )[:3]

        # Prepare data summary for AI
        data_summary = f"""
Spending Analysis ({period_days} days):
- Total Spending: {display_currency} {total_spending:.2f}
- Number of Expenses: {len(expenses)}
- Top Categories:
"""
        for category, amount in top_categories:
            percentage = (float(amount) / float(total_spending)) * 100 if total_spending > 0 else 0
            data_summary += f"  * {category}: {display_currency} {amount:.2f} ({percentage:.1f}%)\n"

        # Generate insights using AI
        prompt = f"""You are a financial advisor. Based on this user's spending data, provide 2-3 brief, actionable insights.

{data_summary}

Provide insights about:
1. Spending patterns and trends
2. Potential savings opportunities
3. Budget recommendations

Format: Return a simple bulleted list with 2-3 items, each starting with "- ".
Keep each insight to one sentence, maximum 20 words.
Be specific and actionable."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=200,
            )

            insights_text = response.choices[0].message.content.strip()

            # Parse insights (split by bullet points)
            insights = [
                line.strip("- ").strip()
                for line in insights_text.split("\n")
                if line.strip().startswith("-")
            ]

            # Save insights to database
            for insight in insights:
                db_insight = AIInsight(
                    user_id=user_id,
                    insight_type="spending_pattern",
                    title="Spending Pattern",
                    content=insight,
                )
                db.add(db_insight)

            await db.commit()

            return insights

        except Exception as e:
            print(f"Error generating spending insights: {str(e)}")
            return []

    async def generate_savings_insights(
        self, db: AsyncSession, user_id: UUID
    ) -> List[str]:
        """
        Generate insights about savings accounts and progress

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of insight strings
        """
        # Get active savings accounts
        result = await db.execute(
            select(SavingsAccount).where(
                SavingsAccount.user_id == user_id, SavingsAccount.is_active == True
            )
        )
        accounts = result.scalars().all()

        if not accounts:
            return []

        # Get user's display currency and convert all amounts
        display_currency = await get_user_display_currency(db, user_id)
        currency_service = CurrencyService(db)

        # Convert all account balances to display currency before summing
        total_balance = Decimal("0")
        account_balances: List[Dict] = []

        for account in accounts:
            # Convert balance to display currency
            converted_balance = await currency_service.convert_amount(
                Decimal(str(account.current_balance)),
                account.currency,
                display_currency
            )
            # Use converted balance or original if conversion fails
            if converted_balance is not None:
                balance_in_display = converted_balance
            else:
                logger.warning(
                    f"Currency conversion failed for savings account {account.id}: "
                    f"could not convert {account.currency} to {display_currency}"
                )
                balance_in_display = Decimal(str(account.current_balance))

            total_balance += balance_in_display
            account_balances.append({
                "name": account.name,
                "type": account.account_type,
                "balance": balance_in_display,
                "original_currency": account.currency
            })

        # Prepare data summary
        data_summary = f"""
Savings Accounts Analysis:
- Number of Active Accounts: {len(accounts)}
- Total Balance: {display_currency} {total_balance:.2f}

Accounts:
"""
        for acc in account_balances:
            data_summary += f"  * {acc['name']} ({acc['type']}): {display_currency} {acc['balance']:.2f}\n"

        # Generate insights using AI
        prompt = f"""You are a financial advisor. Based on this user's savings accounts, provide 2-3 brief, actionable insights.

{data_summary}

Provide insights about:
1. Current savings position and diversification
2. Recommendations for improving savings strategy
3. Emergency fund and financial security suggestions

Format: Return a simple bulleted list with 2-3 items, each starting with "- ".
Keep each insight to one sentence, maximum 20 words.
Be encouraging and actionable."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=200,
            )

            insights_text = response.choices[0].message.content.strip()

            # Parse insights
            insights = [
                line.strip("- ").strip()
                for line in insights_text.split("\n")
                if line.strip().startswith("-")
            ]

            # Save insights to database
            for insight in insights:
                db_insight = AIInsight(
                    user_id=user_id,
                    insight_type="savings_opportunity",
                    title="Savings Opportunity",
                    content=insight,
                )
                db.add(db_insight)

            await db.commit()

            return insights

        except Exception as e:
            print(f"Error generating savings insights: {str(e)}")
            return []

    async def detect_spending_anomalies(
        self, db: AsyncSession, user_id: UUID
    ) -> List[str]:
        """
        Detect unusual spending patterns

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of anomaly insights
        """
        # Get expenses for last 60 days
        sixty_days_ago = datetime.utcnow() - timedelta(days=60)

        result = await db.execute(
            select(Expense)
            .where(
                Expense.user_id == user_id,
                Expense.is_active == True,
                Expense.start_date >= sixty_days_ago,
            )
            .order_by(desc(Expense.start_date))
        )
        expenses = result.scalars().all()

        if len(expenses) < 5:  # Not enough data
            return []

        # Get user's display currency and convert all amounts
        display_currency = await get_user_display_currency(db, user_id)
        currency_service = CurrencyService(db)

        # Group by category with converted amounts
        category_data: Dict[str, List[float]] = {}
        for expense in expenses:
            # Convert amount to display currency
            converted_amount = await currency_service.convert_amount(
                Decimal(str(expense.amount)),
                expense.currency,
                display_currency
            )
            # Use converted amount or original if conversion fails
            if converted_amount is not None:
                amount_in_display = float(converted_amount)
            else:
                logger.warning(
                    f"Currency conversion failed for expense {expense.id} in anomaly detection: "
                    f"could not convert {expense.currency} to {display_currency}"
                )
                amount_in_display = float(expense.amount)

            category = expense.category or "Other"
            if category not in category_data:
                category_data[category] = []
            category_data[category].append(amount_in_display)

        # Find categories with high variance or unusual amounts
        anomalies = []
        for category, amounts in category_data.items():
            if len(amounts) < 3:
                continue

            avg_amount = sum(amounts) / len(amounts)
            max_amount = max(amounts)

            # If max is more than 2x the average, it's an anomaly
            if max_amount > avg_amount * 2:
                anomalies.append(
                    f"Unusual {category} expense detected: {display_currency} {max_amount:.2f} (avg: {display_currency} {avg_amount:.2f})"
                )

        # Save anomalies to database
        for anomaly in anomalies:
            db_insight = AIInsight(
                user_id=user_id,
                insight_type="spending_anomaly",
                title="Spending Anomaly",
                content=anomaly,
            )
            db.add(db_insight)

        await db.commit()

        return anomalies

    async def get_cached_insights(
        self, db: AsyncSession, user_id: UUID, hours: int = 24
    ) -> List[AIInsight]:
        """
        Get cached insights from database

        Args:
            db: Database session
            user_id: User ID
            hours: How many hours old can the insights be

        Returns:
            List of cached insights
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        result = await db.execute(
            select(AIInsight)
            .where(
                AIInsight.user_id == user_id,
                AIInsight.generated_at >= cutoff_time,
            )
            .order_by(desc(AIInsight.generated_at))
            .limit(10)
        )

        return result.scalars().all()

    async def generate_all_insights(
        self, db: AsyncSession, user_id: UUID
    ) -> Dict[str, List[str]]:
        """
        Generate all types of insights for a user

        Args:
            db: Database session
            user_id: User ID

        Returns:
            Dictionary with insight types as keys and lists of insights as values
        """
        spending_insights = await self.generate_spending_insights(db, user_id)
        savings_insights = await self.generate_savings_insights(db, user_id)
        anomalies = await self.detect_spending_anomalies(db, user_id)

        return {
            "spending": spending_insights,
            "savings": savings_insights,
            "anomalies": anomalies,
        }
