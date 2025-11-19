# Currency System Documentation

## Overview

The Wealth Vault application has a **fully dynamic, database-driven currency system** that works similarly to how you add new languages. Currencies can be added, managed, and displayed without requiring code changes or deployments.

---

## How to Add a New Currency

### Option 1: Via Admin Panel (Recommended)
1. Navigate to `/admin/currencies`
2. Click **"Add Currency"**
3. Fill in the form:
   - **Code**: ISO 4217 currency code (e.g., "GBP", "JPY", "CAD")
   - **Name**: Full currency name (e.g., "British Pound")
   - **Symbol**: Currency symbol (e.g., "£", "¥", "$")
   - **Decimal Places**: Usually 2, but can be 0 for currencies like JPY
4. Click **"Create Currency"**
5. Click **"Refresh Exchange Rates"** to fetch current rates
6. **Done!** The currency is now available throughout the app

### Option 2: Via API (for bulk operations)
```bash
curl -X POST http://localhost:8000/api/v1/currencies \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "GBP",
    "name": "British Pound",
    "symbol": "£",
    "decimal_places": 2,
    "is_active": true
  }'
```

---

## What Happens When You Add a Currency?

### ✅ Works Automatically (100%)

After adding a currency via the admin panel:

1. **Appears in all dropdowns immediately** (no page refresh needed)
   - Expense forms
   - Income forms
   - Budget forms
   - Savings forms
   - Portfolio forms
   - Goal forms
   - Subscription forms
   - Installment forms
   - Debt forms
   - Tax forms

2. **Exchange rates auto-fetch** from external API (exchangerate-api.com)
   - Rates cached for 1 hour
   - Manual refresh available in admin panel
   - Fallback to stale rates if API fails

3. **Currency conversion works** between all active currencies
   - Automatic tooltips showing converted amounts
   - User can set display currency preference
   - All charts and tables support multi-currency

4. **Exchange rates widget updates** (newly implemented!)
   - Shows top 3-5 active currencies dynamically
   - Generates all currency pairs automatically
   - No hardcoded currency lists

5. **User preferences work**
   - Users can set primary currency
   - Users can set display currency (for conversions)
   - Settings persist across sessions

---

## Architecture

### Database Layer
**Table:** `currencies`

```sql
CREATE TABLE currencies (
    id UUID PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,  -- ISO 4217 code
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Default Seeded Currencies:**
- USD (US Dollar, $)
- EUR (Euro, €)
- UAH (Ukrainian Hryvnia, ₴)

### API Layer
**Base URL:** `/api/v1/currencies`

**Endpoints:**
- `GET /currencies` - List all currencies (supports `?active_only=true`)
- `GET /currencies/{code}` - Get specific currency
- `POST /currencies` - Create currency (admin only)
- `PATCH /currencies/{code}` - Update currency (admin only)
- `DELETE /currencies/{code}` - Soft-delete/deactivate currency (admin only)
- `POST /currencies/convert` - Convert amount between currencies
- `GET /currencies/rates/{from}/{to}` - Get exchange rate
- `POST /currencies/rates/refresh` - Refresh all rates (admin only)
- `POST /currencies/rates/manual` - Set manual rate override (admin only)

### Frontend Components

**Dynamic Components:**
1. **CurrencySelect** (`/components/currency/currency-select.tsx`)
   - Fetches active currencies from API
   - Dropdown selector with symbol + code + name
   - Used in all forms

2. **CurrencyInput** (`/components/currency/currency-input.tsx`)
   - Combined amount input + currency selector
   - Shows currency symbol as prefix
   - Validates decimal places based on currency

3. **CurrencyDisplay** (`/components/currency/currency-display.tsx`)
   - Displays formatted amount with symbol
   - Shows conversion tooltip when display currency differs
   - Uses `toLocaleString()` for proper formatting

4. **ExchangeRatesWidget** (`/components/dashboard/exchange-rates-widget.tsx`)
   - **Fully dynamic** (newly updated!)
   - Fetches top 3-5 active currencies
   - Generates all currency pairs automatically
   - No hardcoded currency references

### State Management
**RTK Query Cache:**
- All currencies cached on dashboard mount
- Cache invalidated when currencies added/updated/deleted
- Automatic refetch on mount or argument change

**User Preferences:**
- Primary currency stored in `user_preferences.currency`
- Display currency stored in `user_preferences.display_currency`
- Updated via Settings > Appearance

---

## Comparison: Languages vs Currencies

| Aspect | Languages | Currencies |
|--------|-----------|------------|
| **Add Method** | Edit code file | Admin UI panel |
| **Config Location** | `/i18n.ts` array | Database table |
| **Translation Files** | Required (`messages/{locale}/*.json`) | Not needed |
| **Requires Deployment** | Yes | No |
| **Available Immediately** | After deployment | Instantly |
| **Admin Can Add** | No (developer only) | Yes |
| **User CRUD** | No interface | Full admin CRUD |
| **Dynamic Loading** | Static config | API-driven |

**Verdict:** The currency system is **EASIER and MORE FLEXIBLE** than the language system!

---

## Recent Improvements

### November 2025: Exchange Rates Widget Made Dynamic

**Before:**
```typescript
// Hardcoded currency pairs
const CURRENCY_COLUMNS = [
  { base: 'USD', pairs: [{ to: 'EUR' }, { to: 'UAH' }] },
  { base: 'EUR', pairs: [{ to: 'USD' }, { to: 'UAH' }] },
  { base: 'UAH', pairs: [{ to: 'USD' }, { to: 'EUR' }] },
];
```

**After:**
```typescript
// Fully dynamic - fetches from API
const { data: currencies } = useGetCurrenciesQuery({ active_only: true });

const currencyColumns = useMemo(() => {
  const topCurrencies = currencies?.slice(0, 5) || [];
  return topCurrencies.map(base => ({
    base: base.code,
    baseName: base.name,
    pairs: topCurrencies
      .filter(c => c.code !== base.code)
      .map(target => ({ from: base.code, to: target.code }))
  }));
}, [currencies]);
```

**Benefits:**
- ✅ No hardcoded currency references
- ✅ Automatically shows newly added currencies
- ✅ Handles 1-5+ currencies gracefully
- ✅ Responsive grid layout (1/2/3 columns)
- ✅ Loading states and empty states

---

## Future Enhancements (Optional)

### 1. Currency Priority Field
Add a `priority` field to currencies table to control which currencies appear in the exchange rates widget:

```sql
ALTER TABLE currencies ADD COLUMN priority INTEGER DEFAULT 0;
```

This would allow admins to pin specific currencies to the widget regardless of creation order.

### 2. Currency Usage Tracking
Track how often each currency is used:

```sql
ALTER TABLE currencies ADD COLUMN usage_count INTEGER DEFAULT 0;
```

Display most-used currencies first in dropdowns for better UX.

### 3. Smart Default Currency
Instead of hardcoded "USD" fallback, use:
1. User's preferred currency
2. User's country currency (based on IP/locale)
3. USD as final fallback

### 4. Currency Metadata
Add additional fields for enhanced display:
- `country_code` - ISO 3166 country code
- `flag_emoji` - Unicode flag emoji
- `is_crypto` - Boolean for cryptocurrency support
- `display_order` - Custom sort order

---

## Troubleshooting

### Currency Not Appearing in Dropdowns
- Check if currency is active: `is_active = true`
- Clear browser cache and reload
- Check RTK Query cache (Redux DevTools)

### Exchange Rates Not Updating
- Click "Refresh Exchange Rates" in admin panel
- Check API key configuration for exchangerate-api.com
- Verify network connectivity
- Check exchange rate cache TTL (1 hour default)

### Widget Showing Wrong Currencies
- Widget shows top 3-5 active currencies by order
- Add `priority` field (see Future Enhancements) for custom control
- Deactivate unwanted currencies in admin panel

---

## Code Locations

### Frontend
- **API Slice:** `/lib/api/currenciesApi.ts`
- **Components:** `/components/currency/`
- **Admin Panel:** `/app/admin/currencies/page.tsx`
- **Exchange Widget:** `/components/dashboard/exchange-rates-widget.tsx`
- **Settings:** `/components/settings/appearance-settings.tsx`

### Backend
- **Router:** `/app/modules/currency/router.py`
- **Service:** `/app/services/currency_service.py`
- **Models:** `/app/modules/currency/models.py`
- **Migration:** `/alembic/versions/20251013_2010_6eecb01d1f13_add_multi_currency_support.py`

---

## Summary

Your currency system is **production-ready and highly flexible**. Adding new currencies is as simple as clicking a button in the admin panel - no code changes, no deployments, no downtime.

**Key Takeaway:** The currency system is actually **EASIER** than your language system because it's fully database-driven with a complete admin UI. This is excellent architecture! 🎉
