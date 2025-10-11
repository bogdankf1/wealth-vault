"""
AI Module Service
Business logic for file parsing, AI categorization, and insights
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from typing import List, Dict
import os
import tempfile
from pathlib import Path

from app.modules.ai.models import UploadedFile
from app.modules.ai.schemas import ParsedTransaction
from app.services.statement_parser import StatementParser, Transaction
from app.services.ai_categorizer import AICategorizer


class AIService:
    """Service for AI-powered features"""

    def __init__(self):
        self.categorizer = AICategorizer()

    async def parse_statement(
        self, db: AsyncSession, file_id: UUID, user_id: UUID
    ) -> List[ParsedTransaction]:
        """
        Parse a bank statement file and return transactions

        Args:
            db: Database session
            file_id: ID of uploaded file
            user_id: User ID (for security check)

        Returns:
            List of parsed transactions
        """
        # Get file from database
        result = await db.execute(
            select(UploadedFile).where(
                UploadedFile.id == file_id, UploadedFile.user_id == user_id
            )
        )
        uploaded_file = result.scalar_one_or_none()

        if not uploaded_file:
            raise ValueError("File not found")

        # Update status to processing
        uploaded_file.status = "processing"
        await db.commit()

        try:
            # Download file from Vercel Blob to temp location
            # Note: In production, you'd download from uploaded_file.file_url
            # For now, assuming file_url is a local path for testing
            file_path = uploaded_file.file_url

            # Parse based on file type
            transactions: List[Transaction] = []

            if uploaded_file.file_type == "csv":
                transactions = StatementParser.parse_csv(file_path)
            elif uploaded_file.file_type in ["xlsx", "xls"]:
                transactions = StatementParser.parse_excel(file_path)
            elif uploaded_file.file_type == "pdf":
                transactions = StatementParser.parse_pdf(file_path)
            else:
                raise ValueError(f"Unsupported file type: {uploaded_file.file_type}")

            # Convert to Pydantic models
            parsed_transactions = [
                ParsedTransaction(
                    date=txn.date,
                    description=txn.description,
                    amount=txn.amount,
                    balance=txn.balance,
                    category=txn.category,
                )
                for txn in transactions
            ]

            # Update status to completed
            uploaded_file.status = "completed"
            uploaded_file.transactions_imported = len(parsed_transactions)
            await db.commit()

            return parsed_transactions

        except Exception as e:
            # Update status to failed
            uploaded_file.status = "failed"
            uploaded_file.error_message = str(e)
            await db.commit()
            raise

    async def categorize_transaction(
        self,
        db: AsyncSession,
        user_id: UUID,
        description: str,
        amount: float,
        transaction_type: str,
    ) -> str:
        """
        Categorize a single transaction using AI

        Args:
            db: Database session
            user_id: User ID (for learning from history)
            description: Transaction description
            amount: Transaction amount
            transaction_type: 'expense' or 'income'

        Returns:
            Category name
        """
        if transaction_type == "expense":
            return await self.categorizer.categorize_expense(
                description=description, amount=amount, db=db, user_id=user_id
            )
        elif transaction_type == "income":
            return await self.categorizer.categorize_income(
                description=description, amount=amount, db=db, user_id=user_id
            )
        else:
            raise ValueError(f"Invalid transaction type: {transaction_type}")

    async def batch_categorize_transactions(
        self,
        db: AsyncSession,
        user_id: UUID,
        transactions: List[Dict],
        transaction_type: str,
    ) -> List[str]:
        """
        Batch categorize multiple transactions

        Args:
            db: Database session
            user_id: User ID
            transactions: List of dicts with 'description' and 'amount'
            transaction_type: 'expense' or 'income'

        Returns:
            List of categories
        """
        if transaction_type == "expense":
            return await self.categorizer.batch_categorize_expenses(
                transactions=transactions, db=db, user_id=user_id
            )
        else:
            # For income, loop through
            categories = []
            for txn in transactions:
                category = await self.categorizer.categorize_income(
                    description=txn["description"],
                    amount=txn["amount"],
                    db=db,
                    user_id=user_id,
                )
                categories.append(category)
            return categories

    async def save_categorization_correction(
        self,
        db: AsyncSession,
        user_id: UUID,
        description: str,
        correct_category: str,
        original_category: str = None,
    ):
        """Save a user's category correction for learning"""
        await self.categorizer.save_correction(
            db=db,
            user_id=user_id,
            description=description,
            correct_category=correct_category,
            original_category=original_category,
        )
