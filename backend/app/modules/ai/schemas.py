"""
AI Module Schemas
Pydantic schemas for AI-related API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# File Upload Schemas
class FileUploadResponse(BaseModel):
    """Response after file upload"""
    id: UUID
    filename: str
    file_url: str
    file_type: str
    file_size: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ParsedTransaction(BaseModel):
    """A single parsed transaction from statement"""
    date: str
    description: str
    amount: float
    balance: Optional[float] = None
    category: Optional[str] = None


class ParseStatementRequest(BaseModel):
    """Request to parse a bank statement"""
    file_id: UUID


class ParseStatementResponse(BaseModel):
    """Response with parsed transactions"""
    file_id: UUID
    transactions: List[ParsedTransaction]
    total_count: int


# AI Categorization Schemas
class CategorizationRequest(BaseModel):
    """Request to categorize a single transaction"""
    description: str
    amount: float
    transaction_type: str = Field(..., description="'expense' or 'income'")


class CategorizationResponse(BaseModel):
    """Response with suggested category"""
    description: str
    category: str
    confidence: Optional[str] = "high"  # high, medium, low


class BatchCategorizationRequest(BaseModel):
    """Request to categorize multiple transactions"""
    transactions: List[dict]  # List of {description, amount}
    transaction_type: str = Field(..., description="'expense' or 'income'")


class BatchCategorizationResponse(BaseModel):
    """Response with categories for all transactions"""
    categories: List[str]


class CategorizationCorrectionRequest(BaseModel):
    """Request to save a category correction"""
    description: str
    correct_category: str
    original_category: Optional[str] = None


# Import Transactions Schema
class ImportTransactionsRequest(BaseModel):
    """Request to import transactions from parsed statement"""
    file_id: UUID
    transactions: List[dict]  # Transactions to import with categories


class ImportTransactionsResponse(BaseModel):
    """Response after importing transactions"""
    imported_count: int
    failed_count: int
    errors: List[str] = []


# Income Screenshot Parsing Schemas
class ParsedIncomeTransaction(BaseModel):
    """A single parsed income transaction from screenshot"""
    date: str
    description: str
    amount: float
    currency: str = "UAH"
    category: Optional[str] = None
    suggested_frequency: Optional[str] = None  # one_time, daily, weekly, monthly, etc.
    is_recurring_hint: bool = False
    confidence: str = "medium"  # high, medium, low


class ParseIncomeScreenshotsRequest(BaseModel):
    """Request to parse income screenshots"""
    file_ids: List[UUID]


class ParseIncomeScreenshotsResponse(BaseModel):
    """Response with parsed income transactions from screenshots"""
    transactions: List[ParsedIncomeTransaction]
    total_count: int
    recurring_count: int


class MultipleFileUploadResponse(BaseModel):
    """Response after uploading multiple files"""
    files: List[FileUploadResponse]
    total_count: int


# Account Screenshot Parsing Schemas
class ParsedAccount(BaseModel):
    """A single parsed account from screenshot"""
    name: str  # Account/card name (e.g., "Картка Універсальна Голд", "всеКАРТА")
    account_type: str  # card, deposit, cash, savings, other
    balance: float
    currency: str = "UAH"
    institution: Optional[str] = None  # Bank name (Monobank, PrivatBank, etc.)
    card_last4: Optional[str] = None  # Last 4 digits of card
    card_expiry: Optional[str] = None  # Expiry date MM/YY
    card_network: Optional[str] = None  # VISA, Mastercard, etc.
    interest_rate: Optional[float] = None  # For deposits, annual interest rate as decimal
    maturity_date: Optional[str] = None  # For deposits, YYYY-MM-DD
    is_virtual: bool = False  # Virtual card flag
    confidence: str = "medium"  # high, medium, low


class ParseAccountScreenshotsRequest(BaseModel):
    """Request to parse account screenshots"""
    file_ids: List[UUID]


class ParseAccountScreenshotsResponse(BaseModel):
    """Response with parsed accounts from screenshots"""
    accounts: List[ParsedAccount]
    total_count: int
    total_balance_by_currency: dict = {}  # e.g., {"UAH": 22468.87, "USD": 9311.16, "EUR": 20046.50}
