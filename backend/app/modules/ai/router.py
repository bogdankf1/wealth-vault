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
    Upload a bank statement file (CSV or XLS/XLSX)

    Supports Monobank (Ukraine) statements in both Ukrainian and English formats.
    The file will be stored temporarily and can be parsed later.

    **Requires:** Growth tier or higher
    """
    # Validate file type (CSV and Excel formats)
    allowed_extensions = [".csv", ".xls", ".xlsx"]
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Only CSV and XLS/XLSX files are allowed.",
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
