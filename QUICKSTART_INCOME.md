# Income Module - Quick Start Guide

This guide will help you get the Income Tracking module up and running quickly.

## Prerequisites

- PostgreSQL database running
- Python 3.10+ with virtual environment
- Node.js 18+ and npm

## Step 1: Database Setup

```bash
# Create database (if not exists)
createdb wealth_vault_dev

# Or using psql
psql -U postgres
CREATE DATABASE wealth_vault_dev;
\q
```

## Step 2: Backend Setup

```bash
# Navigate to backend directory
cd /Users/bohdanburukhin/Projects/wealth-vault/backend

# Activate virtual environment
source .venv/bin/activate

# Ensure dependencies are installed
pip install -r requirements.txt

# Apply database migrations
alembic upgrade head

# Expected output:
# INFO  [alembic.runtime.migration] Running upgrade  -> 20251006_1400, add income tables

# Start the backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend should now be running at: http://localhost:8000

API Documentation available at: http://localhost:8000/docs

## Step 3: Frontend Setup

Open a new terminal:

```bash
# Navigate to frontend directory
cd /Users/bohdanburukhin/Projects/wealth-vault/frontend

# Ensure dependencies are installed
npm install

# Start the development server
npm run dev
```

Frontend should now be running at: http://localhost:3000

## Step 4: Access the Income Module

1. Open your browser to: http://localhost:3000
2. Log in with your credentials (Google OAuth)
3. Navigate to: http://localhost:3000/dashboard/income

## Step 5: Test the Module

### Create Your First Income Source

1. Click "Add Income Source" button
2. Fill in the form:
   - **Name**: Full-time Salary
   - **Description**: Primary job salary
   - **Category**: Salary
   - **Amount**: 5000
   - **Currency**: USD
   - **Frequency**: Monthly
   - **Start Date**: (Optional) Select a date
   - Check "Active income source"
3. Click "Add Source"

You should see:
- A new card appear with your income source
- Statistics update at the top showing:
  - Total sources: 1
  - Monthly income: $5,000
  - Annual income: $60,000

### Edit an Income Source

1. Click "Edit" on any income source card
2. Modify any field (e.g., change amount to 5500)
3. Click "Update Source"
4. Card should update with new information

### Delete an Income Source

1. Click "Delete" on any income source card
2. Confirm the deletion
3. Card should disappear
4. Statistics should update

## Common Issues

### Issue: Migration fails with "relation already exists"

**Solution**: The tables already exist. Skip migration or run:
```bash
alembic stamp head
```

### Issue: "Could not validate credentials" error

**Solution**: You need to be logged in. Go to http://localhost:3000/login

### Issue: "Feature not available for your tier"

**Solution**: Ensure the `income_tracking` feature is configured in the database:

```sql
-- Connect to database
psql -d wealth_vault_dev

-- Check if feature exists
SELECT * FROM features WHERE key = 'income_tracking';

-- If not, you may need to run the seed script or add it manually
```

### Issue: Frontend showing loading state indefinitely

**Solution**:
1. Check backend is running: http://localhost:8000/health
2. Check browser console for errors
3. Verify API URL in `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000`

## API Endpoints Quick Reference

All endpoints require authentication via JWT token in Authorization header.

### List Income Sources
```bash
GET /api/v1/income/sources
Query params: page, page_size, is_active
```

### Create Income Source
```bash
POST /api/v1/income/sources
Body: { name, description, category, amount, currency, frequency, is_active, start_date, end_date }
```

### Update Income Source
```bash
PUT /api/v1/income/sources/{id}
Body: (same as create, all fields optional)
```

### Delete Income Source
```bash
DELETE /api/v1/income/sources/{id}
```

### Get Statistics
```bash
GET /api/v1/income/stats
Returns: total_sources, active_sources, total_monthly_income, total_annual_income, etc.
```

### Create Transaction
```bash
POST /api/v1/income/transactions
Body: { source_id?, description, amount, currency, date, category, notes }
```

### List Transactions
```bash
GET /api/v1/income/transactions
Query params: page, page_size, source_id, start_date, end_date
```

## Testing with cURL

Replace `YOUR_TOKEN` with actual JWT token from login:

```bash
# List sources
curl -X GET "http://localhost:8000/api/v1/income/sources" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create source
curl -X POST "http://localhost:8000/api/v1/income/sources" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Freelance Work",
    "category": "Freelance",
    "amount": 3000,
    "currency": "USD",
    "frequency": "monthly",
    "is_active": true
  }'

# Get stats
curl -X GET "http://localhost:8000/api/v1/income/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Tier Limits

The income module respects tier limits:

- **Starter Tier**: 3 income sources
- **Growth Tier**: 10 income sources
- **Wealth Tier**: Unlimited income sources

When you try to create more sources than your tier allows, you'll see an error message with upgrade information.

## What's Next?

Now that the Income Tracking module is working, you can:

1. **Add more income sources**: Track all your income streams
2. **Create transactions**: Record actual income received
3. **View statistics**: Monitor your income trends
4. **Test tier limits**: Try creating sources up to your limit

## Need Help?

- Check the full documentation: `INCOME_MODULE_COMPLETION.md`
- API docs: http://localhost:8000/docs
- Frontend code: `/frontend/app/dashboard/income/`
- Backend code: `/backend/app/modules/income/`

---

**Happy tracking! 📊💰**
