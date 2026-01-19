"""
AI Module Router
API endpoints for file upload, parsing, and AI categorization
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import List
import os
import tempfile
from pathlib import Path

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.ai import schemas
from app.modules.ai.service import AIService
from app.modules.ai.models import UploadedFile, AIInsight
from app.services.ai_insights import AIInsightsService

router = APIRouter(prefix="/ai", tags=["ai"])
ai_service = AIService()
insights_service = AIInsightsService()


@router.post("/upload", response_model=schemas.FileUploadResponse)
@require_feature("ai_categorization")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a bank statement file (CSV, XLS/XLSX, or PDF)

    Supports Monobank (Ukraine) statements in both Ukrainian and English formats.
    The file will be stored temporarily and can be parsed later.

    **Requires:** Growth tier or higher
    """
    # Validate file type (CSV, Excel, and PDF formats)
    allowed_extensions = [".csv", ".xls", ".xlsx", ".pdf"]
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Only CSV, XLS/XLSX, and PDF files are allowed.",
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    # For now, save to temp directory
    # In production, upload to Vercel Blob Storage
    temp_dir = Path(tempfile.gettempdir()) / "wealth-vault" / "uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    import uuid
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = temp_dir / unique_filename

    # Save file
    with open(file_path, "wb") as f:
        f.write(content)

    # Create database record
    uploaded_file = UploadedFile(
        user_id=current_user.id,
        filename=file.filename,
        file_url=str(file_path),  # In production, this would be Vercel Blob URL
        file_type=file_ext.replace(".", ""),
        file_size=file_size,
        status="uploaded",
    )

    db.add(uploaded_file)
    await db.commit()
    await db.refresh(uploaded_file)

    return uploaded_file


@router.post("/parse-statement", response_model=schemas.ParseStatementResponse)
@require_feature("ai_categorization")
async def parse_statement(
    request: schemas.ParseStatementRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse an uploaded bank statement file

    Returns a list of transactions extracted from the statement

    **Requires:** Growth tier or higher
    """
    try:
        transactions = await ai_service.parse_statement(
            db=db, file_id=request.file_id, user_id=current_user.id
        )

        return schemas.ParseStatementResponse(
            file_id=request.file_id,
            transactions=transactions,
            total_count=len(transactions),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse statement: {str(e)}",
        )


@router.post("/categorize", response_model=schemas.CategorizationResponse)
@require_feature("ai_categorization")
async def categorize_transaction(
    request: schemas.CategorizationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Categorize a single transaction using AI

    Supports both expense and income categorization

    **Requires:** Growth tier or higher
    """
    try:
        category = await ai_service.categorize_transaction(
            db=db,
            user_id=current_user.id,
            description=request.description,
            amount=request.amount,
            transaction_type=request.transaction_type,
        )

        return schemas.CategorizationResponse(
            description=request.description, category=category
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Categorization failed: {str(e)}",
        )


@router.post(
    "/batch-categorize", response_model=schemas.BatchCategorizationResponse
)
@require_feature("ai_categorization")
async def batch_categorize_transactions(
    request: schemas.BatchCategorizationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Batch categorize multiple transactions using AI

    More efficient than calling /categorize multiple times

    **Requires:** Growth tier or higher
    """
    try:
        categories = await ai_service.batch_categorize_transactions(
            db=db,
            user_id=current_user.id,
            transactions=request.transactions,
            transaction_type=request.transaction_type,
        )

        return schemas.BatchCategorizationResponse(categories=categories)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch categorization failed: {str(e)}",
        )


@router.post("/save-correction", status_code=status.HTTP_201_CREATED)
async def save_categorization_correction(
    request: schemas.CategorizationCorrectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save a user's category correction

    The AI will learn from this correction for future categorizations
    """
    try:
        await ai_service.save_categorization_correction(
            db=db,
            user_id=current_user.id,
            description=request.description,
            correct_category=request.correct_category,
            original_category=request.original_category,
        )

        return {"message": "Correction saved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save correction: {str(e)}",
        )


@router.post("/upload-images", response_model=schemas.MultipleFileUploadResponse)
@require_feature("ai_categorization")
async def upload_images(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload multiple image files (screenshots) for AI parsing

    Supports JPEG, PNG, and WebP formats. Max 10 files per request.

    **Requires:** Growth tier or higher
    """
    # Validate file count
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files allowed per upload",
        )

    if len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file is required",
        )

    # Validate file types
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp"]

    uploaded_files = []
    for file in files:
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not supported for {file.filename}. Only JPEG, PNG, and WebP images are allowed.",
            )

        # Read file content
        content = await file.read()
        file_size = len(content)

        # Validate file size (max 5MB per image)
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File {file.filename} exceeds maximum size of 5MB",
            )

        # Save to temp directory
        temp_dir = Path(tempfile.gettempdir()) / "wealth-vault" / "uploads" / "images"
        temp_dir.mkdir(parents=True, exist_ok=True)

        import uuid as uuid_module

        unique_filename = f"{uuid_module.uuid4()}{file_ext}"
        file_path = temp_dir / unique_filename

        with open(file_path, "wb") as f:
            f.write(content)

        # Create database record
        uploaded_file = UploadedFile(
            user_id=current_user.id,
            filename=file.filename,
            file_url=str(file_path),
            file_type=file_ext.replace(".", ""),
            file_size=file_size,
            status="uploaded",
        )

        db.add(uploaded_file)
        await db.flush()
        await db.refresh(uploaded_file)
        uploaded_files.append(uploaded_file)

    await db.commit()

    return schemas.MultipleFileUploadResponse(
        files=[
            schemas.FileUploadResponse(
                id=f.id,
                filename=f.filename,
                file_url=f.file_url,
                file_type=f.file_type,
                file_size=f.file_size,
                status=f.status,
                created_at=f.created_at,
            )
            for f in uploaded_files
        ],
        total_count=len(uploaded_files),
    )


@router.post(
    "/parse-income-screenshots", response_model=schemas.ParseIncomeScreenshotsResponse
)
@require_feature("ai_categorization")
async def parse_income_screenshots(
    request: schemas.ParseIncomeScreenshotsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse uploaded screenshots to extract income transactions using AI Vision

    Uses GPT-4o Vision to analyze banking app screenshots and extract income transactions.
    Supports Monobank, PrivatBank, and similar Ukrainian banking apps.

    **Requires:** Growth tier or higher
    """
    try:
        transactions = await ai_service.parse_income_screenshots(
            db=db,
            file_ids=request.file_ids,
            user_id=current_user.id,
        )

        recurring_count = sum(1 for t in transactions if t.is_recurring_hint)

        return schemas.ParseIncomeScreenshotsResponse(
            transactions=transactions,
            total_count=len(transactions),
            recurring_count=recurring_count,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse screenshots: {str(e)}",
        )


@router.post(
    "/parse-account-screenshots", response_model=schemas.ParseAccountScreenshotsResponse
)
@require_feature("ai_categorization")
async def parse_account_screenshots(
    request: schemas.ParseAccountScreenshotsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse uploaded screenshots to extract bank accounts and cards using AI Vision

    Uses GPT-4o Vision to analyze banking app screenshots and extract account information.
    Supports Monobank, PrivatBank, and similar Ukrainian banking apps.

    **Requires:** Growth tier or higher
    """
    try:
        accounts = await ai_service.parse_account_screenshots(
            db=db,
            file_ids=request.file_ids,
            user_id=current_user.id,
        )

        # Calculate total balance by currency
        total_balance_by_currency: dict = {}
        for acc in accounts:
            currency = acc.currency
            if currency not in total_balance_by_currency:
                total_balance_by_currency[currency] = 0.0
            total_balance_by_currency[currency] += acc.balance

        return schemas.ParseAccountScreenshotsResponse(
            accounts=accounts,
            total_count=len(accounts),
            total_balance_by_currency=total_balance_by_currency,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse account screenshots: {str(e)}",
        )


@router.post(
    "/parse-portfolio-screenshots", response_model=schemas.ParsePortfolioScreenshotsResponse
)
@require_feature("ai_categorization")
async def parse_portfolio_screenshots(
    request: schemas.ParsePortfolioScreenshotsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse uploaded screenshots to extract portfolio holdings using AI Vision

    Uses GPT-4o Vision to analyze brokerage/trading app screenshots and extract holdings.
    Supports Interactive Brokers, Trading 212, Robinhood, and similar platforms.

    **Requires:** Growth tier or higher
    """
    try:
        holdings = await ai_service.parse_portfolio_screenshots(
            db=db,
            file_ids=request.file_ids,
            user_id=current_user.id,
        )

        # Calculate totals
        total_value = sum(h.total_value or 0 for h in holdings)
        total_cost = sum(h.total_cost or 0 for h in holdings)
        total_gain_loss = sum(h.gain_loss or 0 for h in holdings)

        return schemas.ParsePortfolioScreenshotsResponse(
            holdings=holdings,
            total_count=len(holdings),
            total_value=total_value,
            total_cost=total_cost,
            total_gain_loss=total_gain_loss,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse portfolio screenshots: {str(e)}",
        )


@router.get("/insights")
@require_feature("ai_insights")
async def get_financial_insights(
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get AI-generated financial insights for the user

    Returns cached insights if available (within 24 hours),
    otherwise generates new insights

    **Query Parameters:**
    - force_refresh: If true, bypass cache and generate fresh insights

    **Requires:** Wealth tier
    """
    try:
        # Check for cached insights first (unless force refresh is requested)
        if not force_refresh:
            cached_insights = await insights_service.get_cached_insights(
                db=db, user_id=current_user.id, hours=24
            )

            if cached_insights and len(cached_insights) >= 3:
                # Return cached insights grouped by type
                insights_by_type: dict = {
                    "spending": [],
                    "savings": [],
                    "anomalies": [],
                }

                for insight in cached_insights:
                    if insight.insight_type == "spending_pattern":
                        insights_by_type["spending"].append(insight.content)
                    elif insight.insight_type == "savings_opportunity":
                        insights_by_type["savings"].append(insight.content)
                    elif insight.insight_type == "spending_anomaly":
                        insights_by_type["anomalies"].append(insight.content)

                return insights_by_type

        # Generate new insights
        insights = await insights_service.generate_all_insights(
            db=db, user_id=current_user.id
        )

        return insights

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate insights: {str(e)}",
        )
