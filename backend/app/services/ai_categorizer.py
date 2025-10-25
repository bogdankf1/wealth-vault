"""
AI Categorization Service
Uses OpenAI to categorize expenses and income based on descriptions
"""
from typing import Optional, List, Dict
from openai import OpenAI
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.modules.ai.models import CategorizationCorrection


# Expense categories (must match frontend categories)
EXPENSE_CATEGORIES = [
    "Groceries",
    "Dining Out / Delivery",
    "Clothing",
    "Gifts",
    "Transportation",
    "Personal Care",
    "Healthcare",
    "Luxury & Premium Items",
    "Postal & Shipping",
    "Miscellaneous",
    "Housing",
    "Education & Learning",
    "Travel & Vacations",
    "Entertainment",
]

# Income categories
INCOME_CATEGORIES = [
    "Salary",
    "Business",
    "Freelance",
    "Side Projects",
    "Investments",
    "Gifts",
    "Refunds & Reimbursements",
    "Rental",
    "Other",
]


class AICategorizer:
    """AI-powered transaction categorization"""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        """Lazy-load OpenAI client"""
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key or len(api_key.strip()) == 0:
                # Don't raise an error during initialization, just return None
                # The error will be caught in the try-except blocks
                raise ValueError("OPENAI_API_KEY environment variable not set or empty")
            self._client = OpenAI(api_key=api_key.strip())
        return self._client

    async def categorize_expense(
        self,
        description: str,
        amount: float,
        db: Optional[AsyncSession] = None,
        user_id: Optional[UUID] = None,
    ) -> str:
        """
        Categorize an expense transaction using AI

        Args:
            description: Transaction description
            amount: Transaction amount
            db: Database session (optional, for learning from corrections)
            user_id: User ID (optional, for learning from user's history)

        Returns:
            Category name
        """
        # Get user's correction history for learning
        user_corrections = ""
        if db and user_id:
            corrections = await self._get_user_corrections(db, user_id, limit=10)
            if corrections:
                user_corrections = "\n\nUser's past corrections (learn from these):\n"
                for corr in corrections:
                    user_corrections += f"- '{corr.description}' → '{corr.correct_category}'\n"

        prompt = f"""You are a financial transaction categorizer. Categorize the following expense transaction into ONE of these categories:

{', '.join(EXPENSE_CATEGORIES)}

Transaction details:
- Description: {description}
- Amount: ${amount:.2f}

Rules:
1. Return ONLY the category name, nothing else
2. Choose the most specific category that fits
3. If unsure, use "Other"
4. Be consistent with similar transactions
{user_corrections}

Category:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Fast and cost-effective
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise financial categorization assistant. Always return exactly one category name from the provided list.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,  # Lower temperature for more consistent results
                max_tokens=20,
            )

            category = response.choices[0].message.content.strip()

            # Validate category
            if category not in EXPENSE_CATEGORIES:
                # Try to find closest match
                category_lower = category.lower()
                for valid_cat in EXPENSE_CATEGORIES:
                    if category_lower in valid_cat.lower() or valid_cat.lower() in category_lower:
                        return valid_cat
                return "Other"

            return category

        except Exception as e:
            print(f"AI categorization error: {e}")
            return "Other"

    async def categorize_income(
        self,
        description: str,
        amount: float,
        db: Optional[AsyncSession] = None,
        user_id: Optional[UUID] = None,
    ) -> str:
        """Categorize an income transaction using AI"""

        user_corrections = ""
        if db and user_id:
            corrections = await self._get_user_corrections(db, user_id, limit=10)
            if corrections:
                user_corrections = "\n\nUser's past corrections:\n"
                for corr in corrections:
                    user_corrections += f"- '{corr.description}' → '{corr.correct_category}'\n"

        prompt = f"""Categorize this income transaction into ONE of these categories:

{', '.join(INCOME_CATEGORIES)}

Transaction details:
- Description: {description}
- Amount: ${amount:.2f}

Rules:
1. Return ONLY the category name
2. If unsure, use "Other"
{user_corrections}

Category:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial categorization assistant.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=20,
            )

            category = response.choices[0].message.content.strip()

            if category not in INCOME_CATEGORIES:
                for valid_cat in INCOME_CATEGORIES:
                    if category.lower() in valid_cat.lower() or valid_cat.lower() in category.lower():
                        return valid_cat
                return "Other"

            return category

        except Exception as e:
            print(f"AI categorization error: {e}")
            return "Other"

    async def batch_categorize_expenses(
        self,
        transactions: List[Dict[str, any]],
        db: Optional[AsyncSession] = None,
        user_id: Optional[UUID] = None,
    ) -> List[str]:
        """
        Batch categorize multiple expense transactions

        Args:
            transactions: List of dicts with 'description' and 'amount' keys

        Returns:
            List of category names in same order as input
        """
        categories = []
        for txn in transactions:
            category = await self.categorize_expense(
                description=txn["description"],
                amount=txn["amount"],
                db=db,
                user_id=user_id,
            )
            categories.append(category)
        return categories

    async def save_correction(
        self,
        db: AsyncSession,
        user_id: UUID,
        description: str,
        correct_category: str,
        original_category: Optional[str] = None,
    ):
        """Save a user's category correction for future learning"""
        correction = CategorizationCorrection(
            user_id=user_id,
            description=description,
            correct_category=correct_category,
            original_category=original_category,
        )
        db.add(correction)
        await db.commit()

    async def _get_user_corrections(
        self, db: AsyncSession, user_id: UUID, limit: int = 10
    ) -> List[CategorizationCorrection]:
        """Get user's recent category corrections"""
        result = await db.execute(
            select(CategorizationCorrection)
            .where(CategorizationCorrection.user_id == user_id)
            .order_by(CategorizationCorrection.corrected_at.desc())
            .limit(limit)
        )
        return result.scalars().all()
