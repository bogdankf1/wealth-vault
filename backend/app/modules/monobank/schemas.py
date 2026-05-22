"""Pydantic schemas for Monobank integration."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=128, description="Monobank personal token from https://api.monobank.ua/")


class MonoAccount(BaseModel):
    """A single account or jar as returned by Mono client-info, normalized for our UI."""
    mono_account_id: str
    kind: str               # "account" | "jar"
    type: Optional[str] = None    # mono account type: black, white, fop, etc.
    title: Optional[str] = None   # jars have titles, accounts use last-4 + currency
    iban: Optional[str] = None
    masked_pan: Optional[str] = None
    currency: str           # 3-letter alpha (UAH, USD, ...)
    balance: float          # in major units (already /100)
    credit_limit: float = 0
    linked_savings_account_id: Optional[str] = None  # if already linked


class MonoAccountList(BaseModel):
    accounts: List[MonoAccount]
    jars: List[MonoAccount]


class ConnectionStatus(BaseModel):
    connected: bool
    status: Optional[str] = None
    mono_client_name: Optional[str] = None
    last_full_sync_at: Optional[datetime] = None
    last_webhook_at: Optional[datetime] = None
    webhook_registered: bool = False
    last_error: Optional[str] = None


class LinkAccountRequest(BaseModel):
    savings_account_id: Optional[str] = Field(
        None,
        description="Existing SavingsAccount UUID to link to. If omitted, a new SavingsAccount is created.",
    )
    backfill_months: int = Field(3, ge=0, le=12)


class LinkAccountResponse(BaseModel):
    savings_account_id: str
    backfill_task_id: Optional[str] = None
