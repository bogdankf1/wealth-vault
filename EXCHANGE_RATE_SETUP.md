# Exchange Rate API Setup

## Overview

The application now uses real exchange rates from **exchangerate-api.com** instead of hardcoded values. The system includes:

- ✅ Backend exchange rate service with API integration
- ✅ Database storage for exchange rates (historical tracking)
- ✅ 1-hour caching of rates (in database)
- ✅ Automatic fallback to last known rates if API is unavailable
- ✅ Frontend components use real-time API conversions
- ✅ Admin endpoints for manual rate overrides

## Getting an API Key

### Free Tier (Recommended for Development)

1. Visit: https://www.exchangerate-api.com/
2. Sign up for a free account
3. Free tier includes:
   - 1,500 requests per month
   - Updates daily
   - All currency pairs supported

4. Copy your API key from the dashboard

### Setting Up the API Key

Add to your `.env` file in the backend directory:

```bash
EXCHANGE_RATE_API_KEY=your_api_key_here
```

**Important:** The system will work WITHOUT an API key by using the last known rates from the database. However, rates won't update automatically.

## How It Works

### With API Key:
1. User requests currency conversion
2. Backend checks database for cached rate (< 1 hour old)
3. If not cached, fetches from exchangerate-api.com
4. Stores rate in database with timestamp
5. Returns converted amount

### Without API Key:
1. User requests currency conversion
2. Backend checks database for last known rate
3. If rate exists (even if old), uses it
4. If no rate exists, conversion fails
5. Admin can manually set rates via admin panel

## Testing Exchange Rates

### Test Basic Currency Fetch (requires authentication):

```bash
# Get all currencies
curl http://localhost:8000/api/v1/currencies \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific currency
curl http://localhost:8000/api/v1/currencies/USD \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Currency Conversion:

```bash
curl -X POST http://localhost:8000/api/v1/currencies/convert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from_currency": "USD",
    "to_currency": "EUR"
  }'
```

### Test Exchange Rate Fetch:

```bash
curl http://localhost:8000/api/v1/currencies/rates/USD/EUR \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Admin: Refresh All Rates (requires admin role):

```bash
curl -X POST http://localhost:8000/api/v1/currencies/rates/refresh \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Admin: Set Manual Rate:

```bash
curl -X POST http://localhost:8000/api/v1/currencies/rates/manual \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_currency": "USD",
    "to_currency": "EUR",
    "rate": 0.92
  }'
```

## Seeding Initial Rates (Without API Key)

If you don't have an API key yet, you can manually insert initial rates into the database:

```sql
-- Connect to your database
psql -U your_user -d wealthvault_dev

-- Insert some common exchange rates (example rates, not current)
INSERT INTO exchange_rates (id, from_currency, to_currency, rate, source, fetched_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'USD', 'EUR', 0.92, 'manual', now(), now(), now()),
  (gen_random_uuid(), 'USD', 'UAH', 41.0, 'manual', now(), now(), now()),
  (gen_random_uuid(), 'EUR', 'USD', 1.09, 'manual', now(), now(), now()),
  (gen_random_uuid(), 'EUR', 'UAH', 44.5, 'manual', now(), now(), now()),
  (gen_random_uuid(), 'UAH', 'USD', 0.024, 'manual', now(), now(), now()),
  (gen_random_uuid(), 'UAH', 'EUR', 0.022, 'manual', now(), now(), now());
```

## Frontend Integration

The frontend automatically uses the backend API for all currency conversions via the `CurrencyDisplay` component:

```tsx
<CurrencyDisplay
  amount={1000}
  currency="USD"
  displayCurrency="EUR"  // Automatically converts using API
  showConversionTooltip={true}
/>
```

All charts and widgets already use this component, so no frontend changes are needed.

## Monitoring

Check the backend logs for exchange rate fetching:

```bash
# Backend logs will show:
# - "Fetched rate USD/EUR = 0.92" (when API call succeeds)
# - "Using cached rate USD/EUR" (when using database cache)
# - "Using stale exchange rate for USD/EUR" (when falling back)
# - "Warning: EXCHANGE_RATE_API_KEY not set, using fallback rates" (when no API key)
```

## Production Deployment

For production on Render:

1. Go to your Render dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Add environment variable:
   - Key: `EXCHANGE_RATE_API_KEY`
   - Value: your_api_key_here
5. Save and redeploy

The exchange rates will start updating automatically every hour.

## Future Enhancements

- [ ] Celery background job to refresh rates hourly (currently manual refresh only)
- [ ] Redis caching for faster rate lookups (currently using database cache)
- [ ] Admin UI for viewing rate history and trends
- [ ] Email alerts when rates change significantly
- [ ] Support for cryptocurrency rates

## Troubleshooting

### Rates not updating

1. Check if API key is set: `echo $EXCHANGE_RATE_API_KEY`
2. Check backend logs for API errors
3. Verify you haven't exceeded API rate limit (1,500/month on free tier)
4. Try manual refresh via admin endpoint

### Conversion returns null

1. Check if currencies exist in database: `SELECT * FROM currencies;`
2. Check if any rates exist: `SELECT * FROM exchange_rates LIMIT 10;`
3. Add manual rates using SQL or admin endpoint
4. Verify both currencies are active

### Old rates being used

- Rates are cached for 1 hour by default
- Use `force_refresh=true` query parameter to bypass cache
- Or wait for cache to expire (< 1 hour)

## API Rate Limits

- Free tier: 1,500 requests/month
- Updates: Daily (or on-demand via API call)
- If you exceed the limit, the system will fall back to database cache

With 1-hour caching, you'll use approximately:
- 24 requests/day (if fetching all pairs hourly)
- 720 requests/month (well within free tier)
