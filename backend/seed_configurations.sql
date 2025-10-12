-- Seed sample configurations for the admin panel
-- Run with: psql -d wealth_vault_dev -f seed_configurations.sql

-- Feature Flags
INSERT INTO app_configuration (id, key, value, description, is_system, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'feature_flags',
    '{"enable_crypto_tracking": true, "enable_ai_insights": false, "enable_tax_reports": true, "enable_budgets": true, "enable_goal_tracking": true}'::jsonb,
    'Control which features are visible to users',
    false,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

-- Notification Thresholds
INSERT INTO app_configuration (id, key, value, description, is_system, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'notification_thresholds',
    '{"high_expense_amount": 1000, "budget_warning_percentage": 80, "budget_exceeded_percentage": 100, "low_balance_amount": 500, "large_income_amount": 5000}'::jsonb,
    'Trigger levels for user notifications and alerts',
    false,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

-- UI Settings
INSERT INTO app_configuration (id, key, value, description, is_system, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'ui_settings',
    '{"default_currency": "USD", "supported_currencies": ["USD", "EUR", "GBP", "CAD", "AUD"], "items_per_page": 20, "chart_default_period": "30d", "date_format": "MMM dd, yyyy", "theme": "system"}'::jsonb,
    'Default UI behavior and display options',
    false,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

-- Platform Status
INSERT INTO app_configuration (id, key, value, description, is_system, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'platform_status',
    '{"maintenance_mode": false, "maintenance_message": "We are performing scheduled maintenance. We will be back soon!", "read_only_mode": false, "new_registrations_enabled": true, "api_enabled": true}'::jsonb,
    'Platform operational status and restrictions',
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

-- Rate Limits
INSERT INTO app_configuration (id, key, value, description, is_system, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'rate_limits',
    '{"api_requests_per_minute": 60, "api_requests_per_hour": 1000, "transactions_per_day_starter": 100, "transactions_per_day_growth": 1000, "transactions_per_day_wealth": -1, "login_attempts_per_hour": 5}'::jsonb,
    'Rate limiting configuration by tier and action type (-1 = unlimited)',
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

SELECT COUNT(*) as "Configurations Added" FROM app_configuration;
