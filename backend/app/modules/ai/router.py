"""
AI Module Router
API endpoints for file upload, parsing, and AI categorization
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import tempfile
from pathlib import Path

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.ai import schemas
from app.modules.ai.service import AIService
from app.modules.ai.models import UploadedFile
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
            detail="File type not supported. Only CSV, XLS/XLSX, and PDF files are allowed.",
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


@router.post(
    "/parse-subscription-screenshots", response_model=schemas.ParseSubscriptionScreenshotsResponse
)
@require_feature("ai_categorization")
async def parse_subscription_screenshots(
    request: schemas.ParseSubscriptionScreenshotsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse uploaded screenshots to extract subscriptions using AI Vision

    Uses GPT-4o Vision to analyze subscription management screenshots and extract subscription details.
    Supports Apple Subscriptions, Google Play Subscriptions, and similar platforms.

    **Requires:** Growth tier or higher
    """
    try:
        subscriptions = await ai_service.parse_subscription_screenshots(
            db=db,
            file_ids=request.file_ids,
            user_id=current_user.id,
        )

        # Calculate totals
        active_count = sum(1 for s in subscriptions if s.status == "active")

        # Calculate monthly total (normalize all frequencies to monthly)
        monthly_total = 0.0
        for sub in subscriptions:
            if sub.status == "active":
                if sub.frequency == "monthly":
                    monthly_total += sub.amount
                elif sub.frequency == "quarterly":
                    monthly_total += sub.amount / 3
                elif sub.frequency == "biannually":
                    monthly_total += sub.amount / 6
                elif sub.frequency == "annually":
                    monthly_total += sub.amount / 12

        annual_total = monthly_total * 12

        return schemas.ParseSubscriptionScreenshotsResponse(
            subscriptions=subscriptions,
            total_count=len(subscriptions),
            active_count=active_count,
            monthly_total=round(monthly_total, 2),
            annual_total=round(annual_total, 2),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse subscription screenshots: {str(e)}",
        )


@router.post(
    "/parse-installment-screenshots", response_model=schemas.ParseInstallmentScreenshotsResponse
)
@require_feature("ai_categorization")
async def parse_installment_screenshots(
    request: schemas.ParseInstallmentScreenshotsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parse uploaded screenshots to extract installment plans using AI Vision

    Uses GPT-4o Vision to analyze banking app screenshots and extract installment details.
    Supports Monobank Pay, PrivatBank, and similar Ukrainian banking apps.

    **Requires:** Growth tier or higher
    """
    try:
        installments = await ai_service.parse_installment_screenshots(
            db=db,
            file_ids=request.file_ids,
            user_id=current_user.id,
        )

        # Calculate totals
        active_count = sum(1 for i in installments if i.status == "active")
        total_debt = sum(i.remaining_balance or 0 for i in installments if i.status == "active")
        monthly_payment = sum(i.amount_per_payment for i in installments if i.status == "active")

        return schemas.ParseInstallmentScreenshotsResponse(
            installments=installments,
            total_count=len(installments),
            active_count=active_count,
            total_debt=round(total_debt, 2),
            monthly_payment=round(monthly_payment, 2),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse installment screenshots: {str(e)}",
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


@router.post("/tax-presets", response_model=schemas.GetTaxPresetsResponse)
@require_feature("ai_categorization")
async def get_tax_presets(
    request: schemas.GetTaxPresetsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get AI-generated tax presets based on country and occupation

    Uses GPT-4o to generate relevant tax presets for the user's country and occupation.
    Returns a list of common taxes, contributions, and deductions that may apply.

    **Requires:** Growth tier or higher
    """
    try:
        presets = await ai_service.get_tax_presets(
            country=request.country,
            occupation=request.occupation,
        )

        disclaimer = (
            "This information is for general guidance only and should not be considered tax advice. "
            "Tax rates and regulations change frequently. Please consult a qualified tax professional "
            "or your local tax authority for accurate and up-to-date information specific to your situation."
        )

        return schemas.GetTaxPresetsResponse(
            presets=presets,
            country=request.country,
            occupation=request.occupation,
            total_count=len(presets),
            disclaimer=disclaimer,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get tax presets: {str(e)}",
        )


@router.post("/budget-presets", response_model=schemas.GetBudgetPresetsResponse)
@require_feature("ai_categorization")
async def get_budget_presets(
    request: schemas.GetBudgetPresetsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get AI-generated budget presets based on user's financial data

    Analyzes the user's expenses, subscriptions, installments, goals, and portfolio
    to generate personalized budget recommendations.

    **Requires:** Growth tier or higher
    """
    from sqlalchemy import func, select
    from datetime import datetime, timedelta
    from app.modules.expenses.models import Expense
    from app.modules.subscriptions.models import Subscription
    from app.modules.installments.models import Installment
    from app.modules.goals.models import Goal
    from app.modules.portfolio.models import PortfolioAsset

    try:
        # Get date range for expense analysis (last 3 months)
        three_months_ago = datetime.utcnow() - timedelta(days=90)

        # Fetch expenses summary by category
        expenses_query = await db.execute(
            select(
                Expense.category,
                func.count(Expense.id).label("count"),
                func.sum(Expense.amount).label("total"),
                func.avg(Expense.amount).label("avg"),
            )
            .where(Expense.user_id == current_user.id)
            .where(Expense.date >= three_months_ago)
            .group_by(Expense.category)
        )
        expenses_result = expenses_query.all()

        expenses_summary = {
            "categories": {},
            "monthly_avg": 0,
        }
        total_expenses = 0
        for row in expenses_result:
            expenses_summary["categories"][row.category or "other"] = {
                "count": row.count,
                "total": float(row.total or 0),
                "avg": float(row.avg or 0),
            }
            total_expenses += float(row.total or 0)
        expenses_summary["monthly_avg"] = total_expenses / 3  # 3 months

        # Fetch subscriptions
        subscriptions_query = await db.execute(
            select(Subscription)
            .where(Subscription.user_id == current_user.id)
            .where(Subscription.is_active == True)
        )
        subscriptions = subscriptions_query.scalars().all()

        subscriptions_summary = {
            "items": [],
            "monthly_total": 0,
        }
        for sub in subscriptions:
            monthly_amount = float(sub.amount)
            if sub.frequency == "quarterly":
                monthly_amount = float(sub.amount) / 3
            elif sub.frequency in ("yearly", "annually"):
                monthly_amount = float(sub.amount) / 12

            subscriptions_summary["items"].append({
                "name": sub.name,
                "amount": float(sub.amount),
                "currency": sub.currency,
                "frequency": sub.frequency,
            })
            subscriptions_summary["monthly_total"] += monthly_amount

        # Fetch installments
        installments_query = await db.execute(
            select(Installment)
            .where(Installment.user_id == current_user.id)
            .where(Installment.is_active == True)
        )
        installments = installments_query.scalars().all()

        installments_summary = {
            "items": [],
            "monthly_total": 0,
        }
        for inst in installments:
            installments_summary["items"].append({
                "name": inst.name,
                "monthly_payment": float(inst.amount_per_payment),
                "currency": inst.currency,
            })
            installments_summary["monthly_total"] += float(inst.amount_per_payment)

        # Fetch savings goals
        goals_query = await db.execute(
            select(Goal)
            .where(Goal.user_id == current_user.id)
            .where(Goal.is_active == True)
        )
        goals = goals_query.scalars().all()

        goals_summary = {
            "items": [],
        }
        for goal in goals:
            goals_summary["items"].append({
                "name": goal.name,
                "target_amount": float(goal.target_amount),
                "currency": goal.currency,
                "monthly_contribution": float(goal.monthly_contribution or 0),
            })

        # Fetch portfolio summary
        portfolio_query = await db.execute(
            select(
                func.count(PortfolioAsset.id).label("count"),
                func.sum(PortfolioAsset.quantity * PortfolioAsset.current_price).label("total_value"),
            )
            .where(PortfolioAsset.user_id == current_user.id)
        )
        portfolio_result = portfolio_query.first()

        portfolio_summary = {
            "total_value": float(portfolio_result.total_value or 0) if portfolio_result else 0,
            "holdings_count": portfolio_result.count if portfolio_result else 0,
        }

        # Generate budget presets using AI
        presets, analysis_summary = await ai_service.get_budget_presets(
            currency=request.currency,
            expenses_summary=expenses_summary,
            subscriptions_summary=subscriptions_summary,
            installments_summary=installments_summary,
            goals_summary=goals_summary,
            portfolio_summary=portfolio_summary,
        )

        # Calculate total suggested monthly budget
        total_suggested_monthly = sum(
            p.suggested_amount if p.period == "monthly"
            else p.suggested_amount / 3 if p.period == "quarterly"
            else p.suggested_amount / 12
            for p in presets
        )

        return schemas.GetBudgetPresetsResponse(
            presets=presets,
            total_count=len(presets),
            total_suggested_monthly=round(total_suggested_monthly, 2),
            analysis_summary=analysis_summary,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get budget presets: {str(e)}",
        )
