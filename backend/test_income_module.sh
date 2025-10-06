#!/bin/bash

# Income Module Testing Script
# Run this after applying migrations and starting the server

echo "==================================="
echo "Income Module Testing Script"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend server is running
echo "Checking if backend server is running..."
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✓ Backend server is running${NC}"
else
    echo -e "${RED}✗ Backend server is not running${NC}"
    echo "Please start the server with: uvicorn app.main:app --reload"
    exit 1
fi

echo ""
echo "==================================="
echo "Step 1: Check API Documentation"
echo "==================================="
echo "Open http://localhost:8000/docs in your browser to see all endpoints"
echo ""

# Note: These commands require authentication
echo "==================================="
echo "Step 2: Test Endpoints (Requires Auth)"
echo "==================================="
echo ""
echo -e "${YELLOW}Note: The following tests require authentication.${NC}"
echo "Replace YOUR_TOKEN with a valid JWT token from login."
echo ""

echo "Test 1: List Income Sources"
echo "curl -X GET 'http://localhost:8000/api/v1/income/sources' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN'"
echo ""

echo "Test 2: Create Income Source"
echo "curl -X POST 'http://localhost:8000/api/v1/income/sources' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"name\": \"Test Salary\","
echo "    \"description\": \"Test income source\","
echo "    \"category\": \"Salary\","
echo "    \"amount\": 5000.00,"
echo "    \"currency\": \"USD\","
echo "    \"frequency\": \"monthly\","
echo "    \"is_active\": true"
echo "  }'"
echo ""

echo "Test 3: Get Income Statistics"
echo "curl -X GET 'http://localhost:8000/api/v1/income/stats' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN'"
echo ""

echo "==================================="
echo "Step 3: Check Database Tables"
echo "==================================="
echo ""
echo "psql -d wealth_vault_dev -c '\dt income*'"
echo ""

echo "==================================="
echo "Testing Complete"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Apply migration: alembic upgrade head"
echo "2. Start backend: uvicorn app.main:app --reload"
echo "3. Start frontend: cd ../frontend && npm run dev"
echo "4. Access income page: http://localhost:3000/dashboard/income"
