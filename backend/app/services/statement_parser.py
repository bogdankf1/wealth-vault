"""
Bank Statement Parser Service
Parses CSV, Excel, and PDF bank statements to extract transactions
"""
import pandas as pd
import pdfplumber
from typing import List, Dict, Any, Optional
from datetime import datetime
import re


class Transaction:
    """Represents a parsed transaction"""
    def __init__(
        self,
        date: str,
        description: str,
        amount: float,
        balance: Optional[float] = None,
        category: Optional[str] = None,
        currency: Optional[str] = "USD",
    ):
        self.date = date
        self.description = description
        self.amount = amount
        self.balance = balance
        self.category = category
        self.currency = currency

    def to_dict(self) -> Dict[str, Any]:
        return {
            "date": self.date,
            "description": self.description,
            "amount": self.amount,
            "balance": self.balance,
            "category": self.category,
            "currency": self.currency,
        }


class StatementParser:
    """Parse bank statements from various formats"""

    @staticmethod
    def parse_csv(file_path: str, encoding: str = "utf-8") -> List[Transaction]:
        """
        Parse CSV bank statement

        Attempts to detect columns automatically by looking for common patterns:
        - Date: columns with 'date', 'transaction date', 'posted'
        - Description: columns with 'description', 'memo', 'details', 'merchant'
        - Amount: columns with 'amount', 'debit', 'credit', 'transaction amount'
        - Balance: columns with 'balance', 'running balance'
        """
        try:
            # Try reading CSV with different encodings
            try:
                df = pd.read_csv(file_path, encoding=encoding)
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, encoding="latin-1")

            # Normalize column names
            df.columns = df.columns.str.lower().str.strip()

            # Detect columns (supports English and Ukrainian headers)
            date_col = StatementParser._find_column(
                df.columns, [
                    "date", "transaction date", "posted", "trans date", "posting date", "date and time",
                    "дата", "дата i час", "дата операції"  # Ukrainian
                ]
            )
            desc_col = StatementParser._find_column(
                df.columns, [
                    "description", "memo", "details", "merchant", "payee", "name",
                    "деталі", "опис", "призначення"  # Ukrainian
                ]
            )
            amount_col = StatementParser._find_column(
                df.columns, [
                    "amount", "transaction amount", "debit", "credit",
                    "card currency amount", "operation amount",
                    "сума", "сума в валюті"  # Ukrainian
                ]
            )
            balance_col = StatementParser._find_column(
                df.columns, [
                    "balance", "running balance", "available balance",
                    "залишок", "баланс"  # Ukrainian
                ]
            )
            currency_col = StatementParser._find_column(
                df.columns, [
                    "operation currency", "currency", "transaction currency", "ccy",
                    "валюта"  # Ukrainian
                ]
            )

            if not all([date_col, desc_col, amount_col]):
                raise ValueError(
                    f"Could not detect required columns. Found: {list(df.columns)}"
                )

            transactions = []
            for _, row in df.iterrows():
                try:
                    # Parse date
                    date_str = str(row[date_col])
                    date = StatementParser._parse_date(date_str)

                    # Parse description
                    description = str(row[desc_col]).strip()

                    # Parse amount
                    amount = StatementParser._parse_amount(str(row[amount_col]))

                    # Parse balance if available
                    balance = None
                    if balance_col and pd.notna(row[balance_col]):
                        balance = StatementParser._parse_amount(str(row[balance_col]))

                    # Parse currency if available
                    currency = "USD"  # default
                    if currency_col and pd.notna(row[currency_col]):
                        currency = str(row[currency_col]).strip().upper()

                    transactions.append(
                        Transaction(
                            date=date,
                            description=description,
                            amount=amount,
                            balance=balance,
                            currency=currency,
                        )
                    )
                except (ValueError, TypeError) as e:
                    # Skip rows that can't be parsed
                    continue

            return transactions

        except Exception as e:
            raise ValueError(f"Failed to parse CSV: {str(e)}")

    @staticmethod
    def parse_excel(file_path: str) -> List[Transaction]:
        """
        Parse Excel bank statement (supports both .xlsx and .xls formats)

        For Monobank .xls files, automatically detects and skips header rows (first 20 rows)
        and parses transaction data starting from row 21.

        Note: Some .xls files are actually .xlsx files with wrong extension.
        This function tries multiple engines to handle this.
        """
        try:
            # Try different engines in order
            # Note: Monobank provides .xlsx files with .xls extension, so we try openpyxl first
            engines_to_try = []
            if file_path.lower().endswith('.xlsx'):
                engines_to_try = ['openpyxl']
            elif file_path.lower().endswith('.xls'):
                # Try openpyxl first (for misnamed .xlsx files), then xlrd
                engines_to_try = ['openpyxl', 'xlrd']
            else:
                engines_to_try = ['openpyxl', 'xlrd']

            df = None
            last_error = None

            for engine in engines_to_try:
                try:
                    # First, try to read normally (for standard Excel files)
                    df = pd.read_excel(file_path, engine=engine)

                    # Normalize column names
                    df.columns = df.columns.str.lower().str.strip()

                    # Check if this looks like a Monobank file (has customer info header)
                    # Monobank files have "client:" or "клієнт:" in first column NAME (not value)
                    first_col_name = str(df.columns[0]).lower() if len(df.columns) > 0 else ""
                    is_monobank = 'client:' in first_col_name or 'клієнт:' in first_col_name

                    if is_monobank:
                        # This is a Monobank XLS file - skip header rows and re-read
                        # Transaction data starts at row 20 (0-indexed), with headers at row 20 and data from row 21
                        df = pd.read_excel(file_path, engine=engine, skiprows=20)
                        # Manually set first row as column names
                        df.columns = df.iloc[0]
                        # Drop the header row from data
                        df = df[1:].reset_index(drop=True)
                        # Normalize column names
                        df.columns = df.columns.str.lower().str.strip()

                    # If we got here, we successfully read the file
                    break
                except Exception as e:
                    last_error = e
                    # Try next engine
                    continue

            if df is None:
                # All engines failed
                raise last_error if last_error else ValueError("Could not read Excel file with any engine")

            # Use same detection logic as CSV (supports English and Ukrainian)
            date_col = StatementParser._find_column(
                df.columns, [
                    "date", "transaction date", "posted", "trans date", "posting date", "date and time",
                    "дата", "дата i час", "дата операції", "дата i час операції"  # Ukrainian
                ]
            )
            desc_col = StatementParser._find_column(
                df.columns, [
                    "description", "memo", "details", "merchant", "payee", "name",
                    "деталі", "опис", "призначення", "деталі операції"  # Ukrainian
                ]
            )
            amount_col = StatementParser._find_column(
                df.columns, [
                    "amount", "transaction amount", "debit", "credit",
                    "card currency amount", "operation amount",
                    "сума", "сума в валюті", "сума в валюті картки"  # Ukrainian
                ]
            )
            balance_col = StatementParser._find_column(
                df.columns, [
                    "balance", "running balance", "available balance",
                    "залишок", "баланс"  # Ukrainian
                ]
            )
            currency_col = StatementParser._find_column(
                df.columns, [
                    "operation currency", "currency", "transaction currency", "ccy",
                    "валюта"  # Ukrainian
                ]
            )

            if not all([date_col, desc_col, amount_col]):
                raise ValueError(f"Could not detect required columns in Excel file. Found columns: {list(df.columns)}")

            transactions = []
            for _, row in df.iterrows():
                try:
                    # Skip rows where date column is empty or nan
                    if pd.isna(row[date_col]) or str(row[date_col]).strip() == '':
                        continue

                    date = StatementParser._parse_date(str(row[date_col]))
                    description = str(row[desc_col]).strip()
                    amount = StatementParser._parse_amount(str(row[amount_col]))
                    balance = None
                    if balance_col and pd.notna(row[balance_col]):
                        balance = StatementParser._parse_amount(str(row[balance_col]))

                    # Parse currency if available
                    currency = "USD"  # default
                    if currency_col and pd.notna(row[currency_col]):
                        currency = str(row[currency_col]).strip().upper()

                    transactions.append(
                        Transaction(
                            date=date,
                            description=description,
                            amount=amount,
                            balance=balance,
                            currency=currency,
                        )
                    )
                except (ValueError, TypeError):
                    continue

            return transactions

        except Exception as e:
            raise ValueError(f"Failed to parse Excel: {str(e)}")

    @staticmethod
    def parse_pdf(file_path: str) -> List[Transaction]:
        """
        Parse PDF bank statement using pdfplumber

        This is a best-effort approach that looks for transaction-like patterns
        """
        try:
            transactions = []

            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()

                    # Look for transaction lines using regex
                    # Common pattern: Date | Description | Amount | Balance
                    lines = text.split('\n')

                    for line in lines:
                        # Try to extract transaction data using patterns
                        # Date patterns: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
                        date_match = re.search(
                            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})',
                            line
                        )

                        # Amount patterns: $1,234.56 or -1234.56
                        amount_match = re.search(
                            r'[\$]?([\-\+]?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',
                            line
                        )

                        if date_match and amount_match:
                            try:
                                date_str = date_match.group(1)
                                date = StatementParser._parse_date(date_str)

                                # Extract description (text between date and amount)
                                date_pos = date_match.end()
                                amount_pos = amount_match.start()
                                description = line[date_pos:amount_pos].strip()

                                # Clean description
                                description = re.sub(r'\s+', ' ', description)

                                amount_str = amount_match.group(1)
                                amount = StatementParser._parse_amount(amount_str)

                                if description and amount != 0:
                                    transactions.append(
                                        Transaction(
                                            date=date,
                                            description=description,
                                            amount=amount,
                                        )
                                    )
                            except (ValueError, TypeError):
                                continue

            return transactions

        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {str(e)}")

    @staticmethod
    def _find_column(columns: List[str], keywords: List[str]) -> Optional[str]:
        """Find column that matches any of the keywords"""
        for col in columns:
            for keyword in keywords:
                if keyword in col:
                    return col
        return None

    @staticmethod
    def _parse_date(date_str: str) -> str:
        """Parse date string to ISO format (YYYY-MM-DD)"""
        # Try common date formats
        formats = [
            "%m/%d/%Y", "%m/%d/%y",
            "%d/%m/%Y", "%d/%m/%y",
            "%Y-%m-%d", "%Y/%m/%d",
            "%m-%d-%Y", "%m-%d-%y",
            "%d-%m-%Y", "%d-%m-%y",
            "%b %d, %Y", "%d %b %Y",
            "%d.%m.%Y %H:%M:%S",  # 09.10.2025 12:47:49
            "%d.%m.%Y",  # 09.10.2025
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

        raise ValueError(f"Could not parse date: {date_str}")

    @staticmethod
    def _parse_amount(amount_str: str) -> float:
        """Parse amount string to float"""
        # Remove currency symbols, commas, spaces
        cleaned = re.sub(r'[\$,\s£€¥]', '', amount_str.strip())

        # Handle parentheses for negative amounts: (123.45) -> -123.45
        if cleaned.startswith('(') and cleaned.endswith(')'):
            cleaned = '-' + cleaned[1:-1]

        try:
            return float(cleaned)
        except ValueError:
            raise ValueError(f"Could not parse amount: {amount_str}")
