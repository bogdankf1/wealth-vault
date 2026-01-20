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
from app.modules.ai.schemas import ParsedTransaction, ParsedIncomeTransaction, ParsedAccount, ParsedPortfolioHolding, ParsedSubscription, ParsedInstallment, TaxPreset
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

            # Determine MIME type from file_type or file extension
            file_ext = (uploaded_file.file_type or "").lower()
            if not file_ext:
                # Try to get extension from file path
                file_ext = Path(file_path).suffix.lower().lstrip(".")
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

            # Determine MIME type from file_type or file extension
            file_ext = (uploaded_file.file_type or "").lower()
            if not file_ext:
                # Try to get extension from file path
                file_ext = Path(file_path).suffix.lower().lstrip(".")
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

    async def parse_portfolio_screenshots(
        self, db: AsyncSession, file_ids: List[UUID], user_id: UUID
    ) -> List[ParsedPortfolioHolding]:
        """
        Parse portfolio holdings from brokerage/trading app screenshots using Vision API

        Args:
            db: Database session
            file_ids: List of uploaded file IDs (images)
            user_id: User ID (for security check)

        Returns:
            List of parsed portfolio holdings
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

            # Determine MIME type from file_type or file extension
            file_ext = (uploaded_file.file_type or "").lower()
            if not file_ext:
                # Try to get extension from file path
                file_ext = Path(file_path).suffix.lower().lstrip(".")
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
        prompt = f"""Analyze these {len(image_contents)} brokerage/trading platform screenshots and extract ALL portfolio holdings from EVERY image.

CRITICAL: You are receiving {len(image_contents)} separate screenshots. These may be from DIFFERENT brokerage accounts (e.g., Interactive Brokers AND Trading 212).
You MUST analyze EACH screenshot independently and extract ALL holdings from ALL of them.
The same ticker appearing in multiple screenshots is NOT a duplicate - it represents holdings in different accounts.

COMMON BROKERAGE PLATFORM FORMATS:

1. INTERACTIVE BROKERS (IBKR) FORMAT (light/white theme):
   - Row format: INSTRUMENT (ticker + company name) | POSITION | LAST | CHANGE % | COST BASIS | MARKET VALUE | AVG PRICE | DAILY P&L | UNREALIZED P&L
   - Example row: "AMZN Amazon.com Inc" | 5 | 238.82 | +0.27% | 1,158.14 | 1,194.10 | 231.63 | -1.00 | +36.00
   - INSTRUMENT shows ticker first then company name (e.g., "GOOGL Alphabet Inc Cl A")
   - POSITION = quantity (number of shares)
   - AVG PRICE = purchase_price (average cost per share)
   - LAST = current_price
   - MARKET VALUE = total_value
   - COST BASIS = total_cost
   - UNREALIZED P&L = gain_loss

2. TRADING 212 / WEBULL FORMAT (dark theme):
   - Ticker shown as "AAPL.US", "NVDA.US", "VOO.US" (with .US suffix for US stocks)
   - Columns: Ticker | Qty | Entry Price | Book Value | Price | Value | Share(%) | P&L
   - "Entry Price" = purchase_price (average cost per share)
   - "Price" = current_price
   - "Qty" = quantity
   - "Value" = total_value (current)
   - "Book value" = total_cost
   - P&L columns show gain/loss

3. ROBINHOOD / FIDELITY / SCHWAB FORMAT:
   - Instrument name with company description
   - "AMZN - Amazon.com Inc"
   - Position (shares), Last Price, Change %, Cost Basis, Market Value, Avg Price, Daily P&L, Unrealized P&L

4. CRYPTO EXCHANGES (Binance, Coinbase, Kraken):
   - Symbol: BTC, ETH, SOL, etc.
   - Holdings shown in crypto units
   - USD equivalent value
   - Entry/average price

For each holding found, extract:
1. ticker - Stock/ETF/Crypto symbol WITHOUT exchange suffix (e.g., "NVDA" not "NVDA.US", "AAPL" not "AAPL.US")
2. name - Full company/asset name if visible (e.g., "NVIDIA Corporation", "Apple Inc")
3. asset_type - One of: stock, etf, crypto, bond, other
   - ETFs: VOO, VTI, QQQ, SPY, VGT, SMH, ARKK, etc.
   - Crypto: BTC, ETH, SOL, ADA, etc.
   - Stocks: Everything else with company names
4. quantity - Number of shares/units held (can be fractional)
5. purchase_price - Average cost per share/unit (Entry Price, Avg Price, or Cost Basis / Quantity)
6. current_price - Current market price per share/unit
7. currency - Currency code (usually "USD")
8. total_value - Current market value (quantity * current_price) if shown
9. total_cost - Total cost basis (quantity * purchase_price) if shown
10. gain_loss - Unrealized gain/loss amount if shown
11. gain_loss_percent - Unrealized gain/loss percentage if shown (as decimal, e.g., 0.15 for 15%)
12. confidence - high, medium, or low

DETECTION RULES:
- ETF detection: VOO, VTI, QQQ, SPY, IVV, VGT, SMH, ARKK, VXX, GLD, SLV, TLT, BND, VCIT, VEA, EFA, VWO
- Crypto detection: BTC, ETH, SOL, ADA, XRP, DOGE, DOT, LINK, AVAX, MATIC, ATOM
- Everything else with a company name = stock

CALCULATIONS (if not directly shown):
- total_value = quantity * current_price
- total_cost = quantity * purchase_price
- gain_loss = total_value - total_cost
- gain_loss_percent = (gain_loss / total_cost) if total_cost > 0

Return a JSON object with this exact structure:
{{
  "holdings": [
    {{
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "asset_type": "stock",
      "quantity": 147,
      "purchase_price": 83.30,
      "current_price": 186.26,
      "currency": "USD",
      "total_value": 27380.22,
      "total_cost": 12245.10,
      "gain_loss": 15135.12,
      "gain_loss_percent": 1.2359,
      "confidence": "high"
    }},
    {{
      "ticker": "VOO",
      "name": "Vanguard S&P 500 ETF",
      "asset_type": "etf",
      "quantity": 12,
      "purchase_price": 584.82,
      "current_price": 636.01,
      "currency": "USD",
      "total_value": 7632.12,
      "total_cost": 7017.84,
      "gain_loss": 614.28,
      "gain_loss_percent": 0.0875,
      "confidence": "high"
    }},
    {{
      "ticker": "BTC",
      "name": "Bitcoin",
      "asset_type": "crypto",
      "quantity": 0.5,
      "purchase_price": 45000.00,
      "current_price": 67000.00,
      "currency": "USD",
      "total_value": 33500.00,
      "total_cost": 22500.00,
      "gain_loss": 11000.00,
      "gain_loss_percent": 0.4889,
      "confidence": "high"
    }}
  ]
}}

If no portfolio holdings are found in the screenshots, return:
{{"holdings": []}}

IMPORTANT:
- Extract ALL holdings visible in ALL screenshots - do not skip any image
- If you see {len(image_contents)} images, you should extract holdings from EACH one
- Holdings from different screenshots (different brokers) should ALL be included, even if they have the same ticker
- Remove exchange suffixes from tickers (.US, .L, .DE, etc.)
- Distinguish between stocks and ETFs correctly
- For crypto, use standard ticker symbols (BTC, ETH, etc.)"""

        try:
            # Call Vision API
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial data extraction assistant specialized in parsing brokerage and trading platform screenshots. Extract portfolio holdings accurately and return valid JSON.",
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

            # Convert to ParsedPortfolioHolding objects
            holdings = []
            valid_asset_types = ["stock", "etf", "crypto", "bond", "other"]

            # Known ETF tickers for validation
            etf_tickers = {
                "VOO", "VTI", "QQQ", "SPY", "IVV", "VGT", "SMH", "ARKK", "VXX",
                "GLD", "SLV", "TLT", "BND", "VCIT", "VEA", "EFA", "VWO", "SCHD",
                "JEPI", "QQQM", "VYM", "VIG", "VXUS", "VTV", "IWF", "IWM", "IJR"
            }

            # Known crypto tickers
            crypto_tickers = {
                "BTC", "ETH", "SOL", "ADA", "XRP", "DOGE", "DOT", "LINK", "AVAX",
                "MATIC", "ATOM", "UNI", "LTC", "BCH", "XLM", "ALGO", "FTM", "NEAR"
            }

            for holding in parsed_data.get("holdings", []):
                # Clean ticker (remove exchange suffix)
                ticker = holding.get("ticker", "").upper()
                for suffix in [".US", ".L", ".DE", ".PA", ".TO", ".AX", ".HK"]:
                    if ticker.endswith(suffix):
                        ticker = ticker[:-len(suffix)]
                        break

                # Validate/correct asset_type
                asset_type = holding.get("asset_type", "stock")
                if asset_type not in valid_asset_types:
                    asset_type = "stock"

                # Auto-correct asset_type based on ticker
                if ticker in etf_tickers:
                    asset_type = "etf"
                elif ticker in crypto_tickers:
                    asset_type = "crypto"

                # Extract values with defaults
                quantity = float(holding.get("quantity", 0))
                purchase_price = float(holding.get("purchase_price", 0))
                current_price = float(holding.get("current_price", 0))

                # Calculate derived values if not provided
                total_value = holding.get("total_value")
                if total_value is None and quantity > 0 and current_price > 0:
                    total_value = quantity * current_price
                else:
                    total_value = float(total_value) if total_value else None

                total_cost = holding.get("total_cost")
                if total_cost is None and quantity > 0 and purchase_price > 0:
                    total_cost = quantity * purchase_price
                else:
                    total_cost = float(total_cost) if total_cost else None

                gain_loss = holding.get("gain_loss")
                if gain_loss is None and total_value and total_cost:
                    gain_loss = total_value - total_cost
                else:
                    gain_loss = float(gain_loss) if gain_loss else None

                gain_loss_percent = holding.get("gain_loss_percent")
                if gain_loss_percent is None and gain_loss and total_cost and total_cost > 0:
                    gain_loss_percent = gain_loss / total_cost
                else:
                    gain_loss_percent = float(gain_loss_percent) if gain_loss_percent else None

                holdings.append(
                    ParsedPortfolioHolding(
                        ticker=ticker,
                        name=holding.get("name"),
                        asset_type=asset_type,
                        quantity=quantity,
                        purchase_price=purchase_price,
                        current_price=current_price,
                        currency=holding.get("currency", "USD"),
                        total_value=total_value,
                        total_cost=total_cost,
                        gain_loss=gain_loss,
                        gain_loss_percent=gain_loss_percent,
                        confidence=holding.get("confidence", "medium"),
                    )
                )

            return holdings

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"Vision API parsing failed: {str(e)}")

    async def parse_subscription_screenshots(
        self, db: AsyncSession, file_ids: List[UUID], user_id: UUID
    ) -> List[ParsedSubscription]:
        """
        Parse subscriptions from app screenshots (Apple Subscriptions, Google Play, etc.) using Vision API

        Args:
            db: Database session
            file_ids: List of uploaded file IDs (images)
            user_id: User ID (for security check)

        Returns:
            List of parsed subscriptions
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

            # Determine MIME type from file_type or file extension
            file_ext = (uploaded_file.file_type or "").lower()
            if not file_ext:
                # Try to get extension from file path
                file_ext = Path(file_path).suffix.lower().lstrip(".")
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
        prompt = f"""Analyze these {len(image_contents)} subscription management screenshots and extract ALL subscriptions.

CRITICAL: You are receiving {len(image_contents)} separate screenshots. Analyze EACH screenshot and extract ALL subscriptions from ALL of them.

COMMON SUBSCRIPTION SCREENSHOT FORMATS:

1. APPLE SUBSCRIPTIONS (iOS Settings > Apple ID > Subscriptions):
   - Shows app icon, subscription name, plan type
   - Price with currency (e.g., "49,00 US$", "2,99 US$")
   - Renewal info: "Renews 12 November" or "Expires on 20 January"
   - Status sections: "Active" and "Inactive" (expired)
   - Example: "Apple Music | Individual | 49,00 US$ | Renews 12 November"

2. GOOGLE PLAY SUBSCRIPTIONS:
   - App name and icon
   - Price per billing period
   - "Renews on" date
   - Status: Active, Paused, Cancelled

3. GENERAL SUBSCRIPTION LISTS:
   - Service name (Netflix, Spotify, YouTube Premium, etc.)
   - Monthly/Yearly price
   - Next billing date or renewal date

For each subscription found, extract:
1. name - Service/app name (e.g., "Apple Music", "Netflix", "iCloud+", "Duolingo")
2. description - Plan description if shown (e.g., "Individual", "Family Plan", "Super Duolingo", "50 GB of storage")
3. amount - Subscription price as a number (e.g., 49.00, 2.99, 149.00)
4. currency - Currency code (USD, EUR, UAH, etc.) - parse from formats like "US$", "€", "₴"
5. frequency - Billing frequency: "monthly", "quarterly", "biannually", "annually"
   - Default to "monthly" unless stated otherwise
   - "Annual" or "Yearly" = "annually"
   - "Every 3 months" = "quarterly"
   - "Every 6 months" = "biannually"
6. category - Category: Entertainment, Productivity, Storage, Education, Health & Fitness, News, Utilities, Gaming, Music, Video, Other
7. next_payment_date - Next renewal/payment date in YYYY-MM-DD format
   - Parse from "Renews 12 November" -> current/next year
   - Parse from "Expires on 20 January" -> that date
8. status - "active", "expired", or "cancelled"
   - If in "Active" section or "Renews" -> "active"
   - If in "Inactive" section or "Expired" -> "expired"
9. provider - Platform provider: "Apple", "Google", or null if unknown
10. confidence - "high", "medium", or "low"

CATEGORY MAPPING:
- Music streaming (Spotify, Apple Music, YouTube Music) -> Music
- Video streaming (Netflix, Disney+, Apple TV+, MEGOGO) -> Video
- Cloud storage (iCloud+, Google One, Dropbox) -> Storage
- Learning (Duolingo, DataCamp, Coursera, Skillshare) -> Education
- News (Apple News+, NY Times, Medium) -> News
- Fitness (Strava, MyFitnessPal) -> Health & Fitness
- Gaming (Apple Arcade, Xbox Game Pass) -> Gaming
- Productivity (Microsoft 365, Notion, Evernote) -> Productivity
- Other apps -> Other

Return a JSON object with this exact structure:
{{
  "subscriptions": [
    {{
      "name": "Apple Music",
      "description": "Individual",
      "amount": 49.00,
      "currency": "USD",
      "frequency": "monthly",
      "category": "Music",
      "next_payment_date": "2026-11-12",
      "status": "active",
      "provider": "Apple",
      "confidence": "high"
    }},
    {{
      "name": "iCloud+",
      "description": "50 GB of storage",
      "amount": 0.99,
      "currency": "USD",
      "frequency": "monthly",
      "category": "Storage",
      "next_payment_date": "2026-02-05",
      "status": "active",
      "provider": "Apple",
      "confidence": "high"
    }},
    {{
      "name": "Cocktail Flow - Drink Recipes",
      "description": "1 Year Subscription",
      "amount": 29.99,
      "currency": "USD",
      "frequency": "annually",
      "category": "Other",
      "next_payment_date": null,
      "status": "expired",
      "provider": "Apple",
      "confidence": "medium"
    }}
  ]
}}

If no subscriptions are found, return:
{{"subscriptions": []}}

IMPORTANT:
- Extract ALL subscriptions from ALL screenshots
- Parse prices correctly (49,00 US$ -> 49.00 USD)
- Determine frequency from context (most subscriptions are monthly)
- For annual subscriptions, extract the annual price (don't divide by 12)
- Convert dates to YYYY-MM-DD format
- Mark expired/inactive subscriptions with status "expired"
- Include the plan description if visible"""

        try:
            # Call Vision API
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a subscription data extraction assistant specialized in parsing subscription management screenshots from iOS, Android, and web apps. Extract subscription details accurately and return valid JSON.",
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

            # Convert to ParsedSubscription objects
            subscriptions = []
            valid_frequencies = ["monthly", "quarterly", "biannually", "annually"]
            valid_statuses = ["active", "expired", "cancelled"]

            for sub in parsed_data.get("subscriptions", []):
                # Validate frequency (use 'or' to handle None values)
                frequency = (sub.get("frequency") or "monthly").lower()
                if frequency not in valid_frequencies:
                    frequency = "monthly"

                # Validate status (use 'or' to handle None values)
                status = (sub.get("status") or "active").lower()
                if status not in valid_statuses:
                    status = "active"

                # Parse amount
                amount = sub.get("amount", 0)
                try:
                    amount = float(amount)
                except (ValueError, TypeError):
                    amount = 0.0

                subscriptions.append(
                    ParsedSubscription(
                        name=sub.get("name") or "Unknown",
                        description=sub.get("description"),
                        amount=amount,
                        currency=sub.get("currency") or "USD",
                        frequency=frequency,
                        category=sub.get("category"),
                        next_payment_date=sub.get("next_payment_date"),
                        status=status,
                        provider=sub.get("provider"),
                        confidence=sub.get("confidence") or "medium",
                    )
                )

            return subscriptions

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"Vision API parsing failed: {str(e)}")

    async def parse_installment_screenshots(
        self, db: AsyncSession, file_ids: List[UUID], user_id: UUID
    ) -> List[ParsedInstallment]:
        """
        Parse installments from banking app screenshots (Monobank Pay, PrivatBank) using Vision API

        Args:
            db: Database session
            file_ids: List of uploaded file IDs (images)
            user_id: User ID (for security check)

        Returns:
            List of parsed installments
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

            # Determine MIME type from file_type or file extension
            file_ext = (uploaded_file.file_type or "").lower()
            if not file_ext:
                # Try to get extension from file path
                file_ext = Path(file_path).suffix.lower().lstrip(".")
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
        prompt = f"""Analyze these {len(image_contents)} Ukrainian banking app screenshots showing installment plans (payments in parts / "Оплата частинами" / "Покупка в розстрочку").

CRITICAL: You are receiving {len(image_contents)} separate screenshots. Each may show a DIFFERENT installment plan. Analyze EACH screenshot and extract ALL installments from ALL of them.

MONOBANK PAY (Оплата частинами) FORMAT:
- Product/item name shown at the top (e.g., "Зубна щітка Philips", "Годинник Casio", "Airpods Pro 3", "Шуруповерт Stanley")
- Total amount shown prominently (e.g., "9 999.00 ₴", "12 099.00 ₴")
- Circle progress chart showing:
  - Amount paid: "X XXX ₴ Виплачено" (X XXX ₴ Paid)
  - Remaining payments text: "Залишився 1 платіж на X XXX ₴" or "Залишилося 2 платежі на X XXX ₴"
- Payment schedule list with:
  - Date (e.g., "22 квітня 2025", "4 грудня 2025")
  - "Щомісячний платіж" = Monthly payment
  - Amount per payment (e.g., "999.90 ₴", "4 033 ₴")
  - Checkmark (✓) = paid, Empty circle (○) = upcoming, "Сплатити X XXX ₴" button = next due
- "Погасити достроково" button = Early payoff option

Ukrainian month names: січня (Jan), лютого (Feb), березня (Mar), квітня (Apr), травня (May), червня (Jun), липня (Jul), серпня (Aug), вересня (Sep), жовтня (Oct), листопада (Nov), грудня (Dec)

PRIVATBANK INSTALLMENT FORMAT:
- "Розстрочка" or "Оплата частинами" section
- Product name and total amount
- Payment schedule with dates and amounts

For each installment found, extract:
1. name - Product/item name (e.g., "Зубна щітка Philips", "Airpods Pro 3")
2. description - Any additional details if visible (plan type, store name)
3. total_amount - Total price of the item (e.g., 9999.00)
4. amount_per_payment - Monthly payment amount (e.g., 999.90)
5. currency - Currency code: UAH for ₴
6. frequency - Payment frequency: "monthly" (Щомісячний платіж = monthly)
7. number_of_payments - Total number of payments (count all payments in the schedule)
8. payments_made - Number of payments already made (count checkmarks ✓)
9. remaining_balance - Remaining amount to pay (from "Залишилось... на X XXX ₴")
10. start_date - First payment date in YYYY-MM-DD format (first date in schedule)
11. next_payment_date - Next upcoming payment date in YYYY-MM-DD (payment with "Сплатити" or empty circle)
12. category - Detect from product name:
    - Phones, tablets, laptops, headphones, smartwatches = "Personal Tech"
    - Electric toothbrush, health devices = "Health Tech"
    - Kitchen appliances, blenders, coffee machines = "Kitchen Appliances"
    - Tools, drills, equipment = "Home Appliances"
    - Fitness equipment = "Fitness Equipment"
    - Furniture, home goods = "Housing Goods"
    - Cars, motorcycles = "Vehicle"
    - Other items = "Miscellaneous"
13. status - "active" if has remaining payments, "completed" if all paid (all checkmarks)
14. provider - Bank/service name: "Monobank" for Monobank Pay
15. confidence - "high", "medium", or "low"

Return a JSON object with this exact structure:
{{
  "installments": [
    {{
      "name": "Зубна щітка Philips",
      "description": null,
      "total_amount": 9999.00,
      "amount_per_payment": 999.90,
      "currency": "UAH",
      "frequency": "monthly",
      "number_of_payments": 10,
      "payments_made": 5,
      "remaining_balance": 4995.00,
      "start_date": "2025-04-22",
      "next_payment_date": "2025-09-22",
      "category": "Health Tech",
      "status": "active",
      "provider": "Monobank",
      "confidence": "high"
    }},
    {{
      "name": "Airpods Pro 3",
      "description": null,
      "total_amount": 12099.00,
      "amount_per_payment": 4033.00,
      "currency": "UAH",
      "frequency": "monthly",
      "number_of_payments": 3,
      "payments_made": 2,
      "remaining_balance": 4033.00,
      "start_date": "2025-12-04",
      "next_payment_date": "2026-02-04",
      "category": "Personal Tech",
      "status": "active",
      "provider": "Monobank",
      "confidence": "high"
    }}
  ]
}}

If no installments are found, return:
{{"installments": []}}

IMPORTANT:
- Extract ALL installments from ALL screenshots
- Count payments accurately by looking at the payment schedule list
- Payments with checkmarks (✓) are completed, others are pending
- Convert Ukrainian dates to YYYY-MM-DD format
- The "Виплачено" amount is total paid so far
- Calculate remaining_balance from the schedule or "Залишилось" text"""

        try:
            # Call Vision API
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial data extraction assistant specialized in parsing Ukrainian banking app screenshots showing installment payment plans. Extract installment details accurately and return valid JSON.",
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

            # Convert to ParsedInstallment objects
            installments = []
            valid_frequencies = ["weekly", "biweekly", "monthly"]
            valid_statuses = ["active", "completed"]
            valid_categories = [
                "Personal Tech", "Kitchen Appliances", "Health Tech",
                "Home Appliances", "Miscellaneous", "Fitness Equipment",
                "Housing Goods", "Vehicle", "Property & Real Estate"
            ]

            for inst in parsed_data.get("installments", []):
                # Validate frequency
                frequency = (inst.get("frequency") or "monthly").lower()
                if frequency not in valid_frequencies:
                    frequency = "monthly"

                # Validate status
                status = (inst.get("status") or "active").lower()
                if status not in valid_statuses:
                    status = "active"

                # Validate category
                category = inst.get("category")
                if category not in valid_categories:
                    category = "Miscellaneous"

                # Parse amounts
                total_amount = inst.get("total_amount", 0)
                try:
                    total_amount = float(total_amount)
                except (ValueError, TypeError):
                    total_amount = 0.0

                amount_per_payment = inst.get("amount_per_payment", 0)
                try:
                    amount_per_payment = float(amount_per_payment)
                except (ValueError, TypeError):
                    amount_per_payment = 0.0

                remaining_balance = inst.get("remaining_balance")
                if remaining_balance is not None:
                    try:
                        remaining_balance = float(remaining_balance)
                    except (ValueError, TypeError):
                        remaining_balance = None

                # Parse payment counts
                number_of_payments = inst.get("number_of_payments", 1)
                try:
                    number_of_payments = int(number_of_payments)
                except (ValueError, TypeError):
                    number_of_payments = 1

                payments_made = inst.get("payments_made", 0)
                try:
                    payments_made = int(payments_made)
                except (ValueError, TypeError):
                    payments_made = 0

                installments.append(
                    ParsedInstallment(
                        name=inst.get("name") or "Unknown",
                        description=inst.get("description"),
                        total_amount=total_amount,
                        amount_per_payment=amount_per_payment,
                        currency=inst.get("currency") or "UAH",
                        frequency=frequency,
                        number_of_payments=number_of_payments,
                        payments_made=payments_made,
                        remaining_balance=remaining_balance,
                        start_date=inst.get("start_date"),
                        next_payment_date=inst.get("next_payment_date"),
                        category=category,
                        status=status,
                        provider=inst.get("provider"),
                        confidence=inst.get("confidence") or "medium",
                    )
                )

            return installments

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"Vision API parsing failed: {str(e)}")

    async def get_tax_presets(
        self, country: str, occupation: str
    ) -> List[TaxPreset]:
        """
        Get tax presets based on country and occupation using AI

        Args:
            country: ISO 3166-1 alpha-2 country code (e.g., "UA", "US", "DE")
            occupation: User's occupation type (e.g., "employed", "self_employed", "freelancer")

        Returns:
            List of relevant tax presets
        """
        # Map occupation codes to readable names
        occupation_names = {
            "employed": "Employee (working for a company)",
            "self_employed": "Self-employed individual",
            "business_owner": "Business owner / Entrepreneur",
            "freelancer": "Freelancer / Independent contractor",
            "retired": "Retired person",
            "student": "Student",
            "unemployed": "Unemployed",
            "homemaker": "Homemaker",
            "military": "Military / Armed forces",
            "government": "Government employee",
            "other": "Other occupation",
        }

        occupation_name = occupation_names.get(occupation, occupation)

        # Build the prompt
        prompt = f"""You are a tax expert assistant. Based on the user's country and occupation, provide a list of common tax obligations and deductions they should be aware of.

Country: {country} (ISO 3166-1 alpha-2 code)
Occupation: {occupation_name}

Provide relevant tax presets that this person would typically need to pay or can deduct. Include:
1. Income taxes (federal, state/regional if applicable)
2. Social security contributions (employee and/or self-employed portions)
3. Healthcare/medical insurance contributions if mandatory
4. Pension contributions if mandatory
5. Professional taxes if applicable
6. Any occupation-specific taxes or deductions

For each tax preset, provide:
1. name - Tax name in English
2. description - Brief description of what this tax is for
3. rate - Tax rate as a decimal (e.g., 0.18 for 18%). For progressive taxes, use the most common rate or mid-bracket rate.
4. tax_type - "percentage" for rate-based taxes, "fixed" for fixed amounts
5. frequency - How often it's paid: "monthly", "quarterly", or "annually"
6. is_deductible - true if this is a deduction that reduces taxable income, false if it's a tax payment
7. category - One of: "Income", "Social", "Property", "Business", "Healthcare", "Pension", "Other"
8. notes - Any important notes (optional, include if there are important conditions or thresholds)

Return a JSON object with this structure:
{{
  "presets": [
    {{
      "name": "Personal Income Tax",
      "description": "Tax on personal income from employment",
      "rate": 0.18,
      "tax_type": "percentage",
      "frequency": "monthly",
      "is_deductible": false,
      "category": "Income",
      "notes": "18% flat rate on employment income"
    }}
  ]
}}

Important:
- Only include taxes that are actually applicable in the specified country
- Use current tax rates (as of your knowledge cutoff)
- For self-employed/freelancers, include both personal taxes and business-related taxes
- For employees, include the employee portion of social contributions
- Be accurate with rates - don't guess if unsure, use approximate rates and note uncertainty"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a tax expert assistant providing accurate tax information. Always return valid JSON with tax presets relevant to the user's country and occupation.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.3,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )

            # Parse the response
            content = response.choices[0].message.content
            parsed_data = json.loads(content)

            # Convert to TaxPreset objects
            presets = []
            valid_tax_types = ["percentage", "fixed"]
            valid_frequencies = ["monthly", "quarterly", "annually"]
            valid_categories = ["Income", "Social", "Property", "Business", "Healthcare", "Pension", "Other"]

            for preset in parsed_data.get("presets", []):
                # Validate tax_type
                tax_type = preset.get("tax_type", "percentage")
                if tax_type not in valid_tax_types:
                    tax_type = "percentage"

                # Validate frequency
                frequency = preset.get("frequency", "monthly")
                if frequency not in valid_frequencies:
                    frequency = "monthly"

                # Validate category
                category = preset.get("category", "Other")
                if category not in valid_categories:
                    category = "Other"

                # Parse rate
                rate = preset.get("rate", 0)
                try:
                    rate = float(rate)
                except (ValueError, TypeError):
                    rate = 0.0

                presets.append(
                    TaxPreset(
                        name=preset.get("name", "Unknown Tax"),
                        description=preset.get("description", ""),
                        rate=rate,
                        tax_type=tax_type,
                        frequency=frequency,
                        is_deductible=bool(preset.get("is_deductible", False)),
                        category=category,
                        notes=preset.get("notes"),
                    )
                )

            return presets

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"AI tax presets generation failed: {str(e)}")
