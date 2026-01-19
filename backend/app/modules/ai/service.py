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
import base64
import json
from pathlib import Path
from openai import OpenAI

from app.modules.ai.models import UploadedFile
from app.modules.ai.schemas import ParsedTransaction, ParsedIncomeTransaction, ParsedAccount
from app.services.statement_parser import StatementParser, Transaction
from app.services.ai_categorizer import AICategorizer, INCOME_CATEGORIES


class AIService:
    """Service for AI-powered features"""

    def __init__(self):
        self.categorizer = AICategorizer()
        self._openai_client = None

    @property
    def openai_client(self):
        """Lazy-load OpenAI client"""
        if self._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key or len(api_key.strip()) == 0:
                raise ValueError("OPENAI_API_KEY environment variable not set or empty")
            self._openai_client = OpenAI(api_key=api_key.strip())
        return self._openai_client

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

    async def parse_income_screenshots(
        self, db: AsyncSession, file_ids: List[UUID], user_id: UUID
    ) -> List[ParsedIncomeTransaction]:
        """
        Parse income transactions from banking app screenshots using Vision API

        Args:
            db: Database session
            file_ids: List of uploaded file IDs (images)
            user_id: User ID (for security check)

        Returns:
            List of parsed income transactions
        """
        # Get all files from database
        result = await db.execute(
            select(UploadedFile).where(
                UploadedFile.id.in_(file_ids),
                UploadedFile.user_id == user_id,
            )
        )
        uploaded_files = result.scalars().all()

        if len(uploaded_files) != len(file_ids):
            raise ValueError("One or more files not found")

        # Prepare images for Vision API
        image_contents = []
        for uploaded_file in uploaded_files:
            file_path = uploaded_file.file_url

            # Read and encode image to base64
            with open(file_path, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")

            # Determine MIME type
            file_ext = uploaded_file.file_type.lower()
            mime_type = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
            }.get(file_ext, "image/jpeg")

            image_contents.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_data}",
                        "detail": "high",
                    },
                }
            )

        # Build the prompt for Vision API
        categories_str = ", ".join(INCOME_CATEGORIES)
        prompt = f"""Analyze these Ukrainian banking app screenshots (Monobank, PrivatBank, or similar).
Extract ONLY INCOME transactions (money received, positive amounts, deposits, incoming transfers).

MONOBANK TRANSACTION DETAIL FORMAT:
- "Від:" (From:) followed by sender/company name
- "Поповнення картки" or "Поповнення рахунку" = Income (card/account top-up)
- Date format: "DD місяць YYYY, HH:MM" (e.g., "29 грудня 2025, 16:03")
- Amount shown prominently with currency symbol (€, $, ₴)
- Commentary section may contain contract/agreement details
- "Залишок" = Balance after transaction

Ukrainian month names: січня (Jan), лютого (Feb), березня (Mar), квітня (Apr), травня (May), червня (Jun), липня (Jul), серпня (Aug), вересня (Sep), жовтня (Oct), листопада (Nov), грудня (Dec)

For each income transaction found, provide:
1. date - Transaction date in YYYY-MM-DD format (convert from Ukrainian format)
2. description - Sender/company name from "Від:" field
3. amount - The main amount shown (positive number)
4. currency - Currency code: UAH for ₴, USD for $, EUR for €
5. category - One of: {categories_str}
6. suggested_frequency - One of: one_time, daily, weekly, biweekly, monthly, quarterly, annually
7. is_recurring_hint - true if this looks like regular income (salary, contract payment, regular transfers)
8. confidence - high, medium, or low

Category detection hints:
- Company names with "SOFTWARE", "IT", programming services = Freelance or Business
- "Зарплата", "Заробітна плата" = Salary
- Contract payments ("договору", "AGREEMENT") = Freelance or Business
- "Відсотки", "Нарахування відсотків" = Investments
- "Кешбек", "Cashback" = Side Projects
- Personal transfers = Gifts or Other

Recurring income hints:
- Same company sending payments = likely monthly salary/contract
- Contract/agreement numbers suggest recurring business relationship
- IT services, programming services = typically monthly freelance

Return a JSON object with this exact structure:
{{
  "transactions": [
    {{
      "date": "2025-12-29",
      "description": "Krusche Company EOOD",
      "amount": 4500.00,
      "currency": "EUR",
      "category": "Business",
      "suggested_frequency": "monthly",
      "is_recurring_hint": true,
      "confidence": "high"
    }}
  ]
}}

If no income transactions are found in the screenshots, return:
{{"transactions": []}}

IMPORTANT: Only extract INCOME (money received). Look for "Поповнення" (top-up) transactions."""

        try:
            # Call Vision API
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial data extraction assistant specialized in parsing Ukrainian banking app screenshots. Extract income transactions accurately and return valid JSON.",
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}, *image_contents],
                    },
                ],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"},
            )

            # Parse the response
            content = response.choices[0].message.content
            parsed_data = json.loads(content)

            # Convert to ParsedIncomeTransaction objects
            transactions = []
            for txn in parsed_data.get("transactions", []):
                # Validate category
                category = txn.get("category", "Other")
                if category not in INCOME_CATEGORIES:
                    category = "Other"

                # Validate frequency
                valid_frequencies = [
                    "one_time",
                    "daily",
                    "weekly",
                    "biweekly",
                    "monthly",
                    "quarterly",
                    "annually",
                ]
                frequency = txn.get("suggested_frequency", "one_time")
                if frequency not in valid_frequencies:
                    frequency = "one_time"

                transactions.append(
                    ParsedIncomeTransaction(
                        date=txn.get("date", ""),
                        description=txn.get("description", ""),
                        amount=float(txn.get("amount", 0)),
                        currency=txn.get("currency", "UAH"),
                        category=category,
                        suggested_frequency=frequency,
                        is_recurring_hint=bool(txn.get("is_recurring_hint", False)),
                        confidence=txn.get("confidence", "medium"),
                    )
                )

            return transactions

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"Vision API parsing failed: {str(e)}")

    async def parse_account_screenshots(
        self, db: AsyncSession, file_ids: List[UUID], user_id: UUID
    ) -> List[ParsedAccount]:
        """
        Parse bank accounts/cards from banking app screenshots using Vision API

        Args:
            db: Database session
            file_ids: List of uploaded file IDs (images)
            user_id: User ID (for security check)

        Returns:
            List of parsed accounts
        """
        # Get all files from database
        result = await db.execute(
            select(UploadedFile).where(
                UploadedFile.id.in_(file_ids),
                UploadedFile.user_id == user_id,
            )
        )
        uploaded_files = result.scalars().all()

        if len(uploaded_files) != len(file_ids):
            raise ValueError("One or more files not found")

        # Prepare images for Vision API
        image_contents = []
        for uploaded_file in uploaded_files:
            file_path = uploaded_file.file_url

            # Read and encode image to base64
            with open(file_path, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")

            # Determine MIME type
            file_ext = uploaded_file.file_type.lower()
            mime_type = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
            }.get(file_ext, "image/jpeg")

            image_contents.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_data}",
                        "detail": "high",
                    },
                }
            )

        # Build the prompt for Vision API
        prompt = """Analyze these Ukrainian banking app screenshots (Monobank, PrivatBank, or similar).
Extract ALL bank accounts, cards, and deposits visible in the screenshots.

MONOBANK CARD/ACCOUNT FORMAT:
- Card number shown as "** XXXX" or "**** XXXX" (last 4 digits)
- Expiry date shown as "MM/YY" (e.g., "04/28")
- Balance shown prominently with currency symbol (€, $, ₴)
- Card network: VISA or Mastercard logo visible
- "всеКАРТА" = Multi-currency card wallet containing multiple cards
- "Віртуальна" = Virtual card
- "Накопичення" or "Депозит" = Savings/Deposit account
- Interest rate shown as "X,X% річних" (annual)
- Maturity date shown as "до DD.MM.YYYY"

PRIVATBANK FORMAT:
- "Заощадження" = Savings section
- "Мої вклади" = My deposits
- "Картка Універсальна Голд" = Universal Gold Card (account name)
- Balance shown as "Баланс: X XXX.XX CUR"
- Deposits show "Сума", "Нараховано" (accrued interest)
- Period shown as "Період отримання: DD.MM.YYYY - DD.MM.YYYY"

For each account/card found, provide:
1. name - Card/account name (e.g., "Картка Універсальна Голд", "всеКАРТА USD", "Депозит Валютний")
2. account_type - One of: card, deposit, cash, savings, other
3. balance - Current balance amount (positive number)
4. currency - Currency code: UAH for ₴, USD for $, EUR for €, GBP for £
5. institution - Bank name: "Monobank" or "PrivatBank" or other detected bank
6. card_last4 - Last 4 digits of card if visible (e.g., "9699")
7. card_expiry - Expiry date if visible (e.g., "04/28")
8. card_network - Card network if visible: "VISA", "Mastercard", or null
9. interest_rate - Annual interest rate as decimal (0.01 for 1%) for deposits, null for cards
10. maturity_date - Deposit maturity date in YYYY-MM-DD format, null for cards
11. is_virtual - true if marked as virtual card, false otherwise
12. confidence - high, medium, or low

IMPORTANT RULES:
- Extract EVERY unique account/card visible
- For "всеКАРТА" (multi-currency wallet), extract each card within it separately
- The main balance shown is the total, but individual cards have their own last4/expiry
- Don't create duplicate accounts (same card_last4 + currency = same account)
- For deposits, capture the interest rate and maturity date if visible
- Currency detection: ₴ or грн = UAH, $ = USD, € = EUR

Return a JSON object with this exact structure:
{{
  "accounts": [
    {{
      "name": "Картка Універсальна Голд",
      "account_type": "card",
      "balance": 4751.03,
      "currency": "EUR",
      "institution": "PrivatBank",
      "card_last4": "1324",
      "card_expiry": "01/27",
      "card_network": "Mastercard",
      "interest_rate": null,
      "maturity_date": null,
      "is_virtual": false,
      "confidence": "high"
    }},
    {{
      "name": "Депозит Валютний",
      "account_type": "deposit",
      "balance": 4629.00,
      "currency": "USD",
      "institution": "Monobank",
      "card_last4": null,
      "card_expiry": null,
      "card_network": null,
      "interest_rate": 0.001,
      "maturity_date": "2026-04-11",
      "is_virtual": false,
      "confidence": "high"
    }}
  ]
}}

If no accounts are found in the screenshots, return:
{{"accounts": []}}"""

        try:
            # Call Vision API
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial data extraction assistant specialized in parsing Ukrainian banking app screenshots. Extract account and card information accurately and return valid JSON.",
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}, *image_contents],
                    },
                ],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"},
            )

            # Parse the response
            content = response.choices[0].message.content
            parsed_data = json.loads(content)

            # Convert to ParsedAccount objects
            accounts = []
            valid_account_types = ["card", "deposit", "cash", "savings", "other"]
            valid_card_networks = ["VISA", "Mastercard", "Visa", "mastercard", None]

            for acc in parsed_data.get("accounts", []):
                # Validate account_type
                account_type = acc.get("account_type", "other")
                if account_type not in valid_account_types:
                    account_type = "other"

                # Normalize card network
                card_network = acc.get("card_network")
                if card_network:
                    card_network = card_network.upper() if card_network.lower() == "visa" else (
                        "Mastercard" if card_network.lower() == "mastercard" else card_network
                    )

                accounts.append(
                    ParsedAccount(
                        name=acc.get("name", "Unknown Account"),
                        account_type=account_type,
                        balance=float(acc.get("balance", 0)),
                        currency=acc.get("currency", "UAH"),
                        institution=acc.get("institution"),
                        card_last4=acc.get("card_last4"),
                        card_expiry=acc.get("card_expiry"),
                        card_network=card_network,
                        interest_rate=float(acc["interest_rate"]) if acc.get("interest_rate") is not None else None,
                        maturity_date=acc.get("maturity_date"),
                        is_virtual=bool(acc.get("is_virtual", False)),
                        confidence=acc.get("confidence", "medium"),
                    )
                )

            return accounts

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"Vision API parsing failed: {str(e)}")
