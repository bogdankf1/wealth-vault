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
