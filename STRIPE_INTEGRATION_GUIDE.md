# Stripe Integration - Phase 6 Complete

## Overview
Phase 6: Tier System & Monetization has been fully implemented with Stripe payment integration. The system includes subscription management, tier-based access control, and upgrade prompts.

## Backend Implementation

### Database Models
- **`UserSubscription`** (`backend/app/models/billing.py`): Tracks user subscription status
- **`PaymentHistory`** (`backend/app/models/billing.py`): Records all payment transactions
- Migration: `backend/alembic/versions/20251012_1119_bf30da70477e_add_billing_tables_for_stripe_.py`

### Stripe Service Layer
**File**: `backend/app/services/stripe_service.py`

Key methods:
- `create_customer()`: Creates Stripe customer
- `create_checkout_session()`: Initiates subscription checkout
- `cancel_subscription()`: Cancels user subscription
- `update_subscription()`: Updates subscription plan
- `create_customer_portal_session()`: Opens Stripe billing portal
- `handle_checkout_completed()`: Webhook handler for successful checkout
- `handle_subscription_updated()`: Webhook handler for subscription changes
- `handle_invoice_paid()`: Webhook handler for successful payments
- `handle_invoice_payment_failed()`: Webhook handler for failed payments

### API Endpoints
**File**: `backend/app/api/v1/billing.py`

Routes (all under `/api/v1/billing`):
- `POST /create-checkout`: Create Stripe checkout session
- `POST /webhook`: Handle Stripe webhook events (signature verified)
- `GET /subscription`: Get current subscription status and available tiers
- `POST /cancel-subscription`: Cancel subscription (at period end)
- `POST /update-subscription`: Upgrade/downgrade subscription
- `POST /create-portal-session`: Create Stripe customer portal session
- `GET /payment-history`: Get paginated payment history

### Environment Variables (Backend)
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_WEALTH_PRICE_ID=price_...
```

## Frontend Implementation

### RTK Query API
**File**: `frontend/lib/api/billingApi.ts`

Endpoints:
- `createCheckoutSession`: Initiates subscription checkout
- `createPortalSession`: Opens billing portal
- `getSubscriptionStatus`: Fetches subscription details and available tiers
- `cancelSubscription`: Cancels subscription
- `updateSubscription`: Changes subscription plan
- `getPaymentHistory`: Fetches payment history

### Pages

#### 1. Pricing Page
**File**: `frontend/app/pricing/page.tsx`

Public-facing pricing page showing:
- Three tiers: Starter (free), Growth ($9.99/mo), Wealth ($29.99/mo)
- Feature comparison for each tier
- "Subscribe" buttons that redirect to Stripe checkout
- Current tier indicator for logged-in users

#### 2. Subscription Settings Page
**File**: `frontend/app/dashboard/settings/subscription/page.tsx`

Dashboard page for managing subscriptions:
- Current subscription status and billing period
- Cancel subscription option
- Upgrade/downgrade to other tiers
- Payment history display
- Stripe customer portal integration

### Components

#### Upgrade Prompt Components
**File**: `frontend/components/upgrade-prompt.tsx`

Four reusable components:
1. **`UpgradePrompt`**: Card-style prompt with dismiss option
2. **`InlineUpgradePrompt`**: Inline banner (compact/full variants)
3. **`UpgradePromptDialog`**: Modal dialog for blocking actions
4. All components redirect to `/pricing` on upgrade click

#### Tier Check Hook
**File**: `frontend/lib/hooks/use-tier-check.ts`

Hook for checking tier limits:
```typescript
const tierCheck = useTierCheck('incomeSources', currentCount);
// Returns: { canAdd, limit, currentTier, requiredTier, isLoading }
```

Tier limits defined:
- **Starter**: 5 income sources, 10 expenses, 3 savings goals, etc.
- **Growth**: 20 income sources, 30 expenses, 10 savings goals, etc.
- **Wealth**: Unlimited everything

### Environment Variables (Frontend)
```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_WEALTH_PRICE_ID=price_...
```

## Implementation Example: Income Page

**File**: `frontend/app/dashboard/income/page.tsx`

Shows how tier limits are enforced:
```typescript
const tierCheck = useTierCheck('incomeSources', currentCount);

const handleAddSource = () => {
  if (!tierCheck.canAdd) {
    setShowUpgradeDialog(true);
    return;
  }
  setIsFormOpen(true);
};
```

When user hits limit, shows `UpgradePromptDialog` instead of allowing action.

## User Flow

### 1. New User Signup
1. User signs in with Google → automatically assigned "starter" tier
2. Can use free features within starter limits

### 2. Subscription Flow
1. User hits tier limit → sees upgrade prompt
2. Clicks "View Plans" → redirected to `/pricing`
3. Selects Growth or Wealth → redirected to Stripe Checkout
4. Completes payment in Stripe → redirected back to app
5. Stripe webhook fires → `handle_checkout_completed()` called
6. Backend updates user tier and creates subscription record
7. User now has access to higher tier features

### 3. Subscription Management
1. User navigates to `/dashboard/settings/subscription`
2. Can view current subscription status and billing dates
3. Can upgrade/downgrade plans (prorated)
4. Can cancel subscription (remains active until period end)
5. Can access Stripe customer portal for payment methods

## Webhook Setup

To receive Stripe webhooks in development:

1. Install Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
```

2. Login to Stripe:
```bash
stripe login
```

3. Forward webhooks to local server:
```bash
stripe listen --forward-to http://localhost:8000/api/v1/billing/webhook
```

4. Copy the webhook signing secret to `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Testing Subscription Flow

### Test Cards
Use Stripe test cards:
- **Success**: `4242 4242 4242 4242`
- **Declined**: `4000 0000 0000 0002`
- Any future expiry date and any CVC

### Test Steps
1. Start backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Start Stripe webhook forwarding: `stripe listen --forward-to http://localhost:8000/api/v1/billing/webhook`
4. Sign in to app
5. Navigate to `/pricing`
6. Click "Subscribe" on Growth or Wealth tier
7. Complete checkout with test card
8. Verify webhook received in Stripe CLI output
9. Check database for subscription record
10. Verify user tier updated in app

## Database Queries for Verification

```sql
-- Check user subscription
SELECT * FROM user_subscriptions WHERE user_id = '<user_id>';

-- Check payment history
SELECT * FROM payment_history WHERE user_id = '<user_id>' ORDER BY created_at DESC;

-- Check user tier
SELECT u.email, t.name as tier_name, t.display_name, u.stripe_customer_id, u.stripe_subscription_id
FROM users u
LEFT JOIN tiers t ON u.tier_id = t.id
WHERE u.email = 'your-email@example.com';
```

## Next Steps for Other Modules

To add tier limits to other modules (expenses, goals, etc.):

1. Import the tier check hook:
```typescript
import { useTierCheck, getFeatureDisplayName } from '@/lib/hooks/use-tier-check';
import { UpgradePromptDialog } from '@/components/upgrade-prompt';
```

2. Add tier check in component:
```typescript
const currentCount = data?.items?.length || 0;
const tierCheck = useTierCheck('expenses', currentCount); // or 'savingsGoals', 'budgets', etc.
const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
```

3. Check before allowing add action:
```typescript
const handleAdd = () => {
  if (!tierCheck.canAdd) {
    setShowUpgradeDialog(true);
    return;
  }
  // Proceed with add
};
```

4. Add dialog to render:
```tsx
<UpgradePromptDialog
  isOpen={showUpgradeDialog}
  onClose={() => setShowUpgradeDialog(false)}
  feature={getFeatureDisplayName('expenses')}
  currentTier={tierCheck.currentTier}
  requiredTier={tierCheck.requiredTier || 'growth'}
  currentLimit={tierCheck.limit}
/>
```

## Feature Access Check

For features that are tier-gated (not count-based):

```typescript
import { hasFeatureAccess } from '@/lib/hooks/use-tier-check';

const user = useGetCurrentUserQuery();
const canAccessAI = hasFeatureAccess(user?.tier?.name || 'starter', 'ai-insights');

if (!canAccessAI) {
  // Show upgrade prompt
}
```

Available feature flags:
- `advanced-analytics`: Growth & Wealth
- `ai-insights`: Growth & Wealth
- `portfolio-tracking`: Growth & Wealth
- `priority-support`: Wealth only
- `advanced-ai`: Wealth only

## Security Notes

1. ✅ Webhook signature verification implemented
2. ✅ All billing endpoints require authentication
3. ✅ Stripe API keys stored in environment variables (not committed)
4. ✅ Frontend only receives publishable key
5. ✅ Backend validates all requests before calling Stripe
6. ⚠️ In production, ensure HTTPS is enabled for webhooks
7. ⚠️ Replace test API keys with live keys in production

## Complete Implementation Summary

✅ **Backend**:
- Stripe SDK installed
- Database models created
- Alembic migration applied
- Service layer implemented
- API endpoints created
- Webhook handlers implemented
- Environment variables configured

✅ **Frontend**:
- Stripe.js installed
- RTK Query API created
- Pricing page created
- Subscription settings page created
- Upgrade prompt components created
- Tier check hook implemented
- Income page integrated with tier limits
- Environment variables configured

✅ **Ready for Testing**: Complete subscription flow from signup to checkout to webhook to tier upgrade
