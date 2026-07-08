"""
AI Module Service - Tax & budget presets
Business logic for AI-generated tax and budget presets.
"""
from typing import List, Dict
import json

from app.modules.ai.schemas import TaxPreset, BudgetPreset


class PresetsMixin:
    """AI-generated tax and budget preset methods for :class:`AIService`."""

    async def get_tax_presets(
        self, country: str, occupation: str
    ) -> List[TaxPreset]:
        """
        Get tax presets based on country and occupation using AI

        Args:
            country: ISO 3166-1 alpha-2 country code (e.g., "UA", "US", "DE")
            occupation: User's occupation type (e.g., "employed", "self_employed", "freelancer")

        Returns:
            List of relevant tax presets
        """
        # Map occupation codes to readable names
        occupation_names = {
            "employed": "Employee (working for a company)",
            "self_employed": "Self-employed individual",
            "business_owner": "Business owner / Entrepreneur",
            "freelancer": "Freelancer / Independent contractor",
            "retired": "Retired person",
            "student": "Student",
            "unemployed": "Unemployed",
            "homemaker": "Homemaker",
            "military": "Military / Armed forces",
            "government": "Government employee",
            "other": "Other occupation",
        }

        occupation_name = occupation_names.get(occupation, occupation)

        # Build the prompt
        prompt = f"""You are a tax expert assistant. Based on the user's country and occupation, provide a list of common tax obligations and deductions they should be aware of.

Country: {country} (ISO 3166-1 alpha-2 code)
Occupation: {occupation_name}

Provide relevant tax presets that this person would typically need to pay or can deduct. Include:
1. Income taxes (federal, state/regional if applicable)
2. Social security contributions (employee and/or self-employed portions)
3. Healthcare/medical insurance contributions if mandatory
4. Pension contributions if mandatory
5. Professional taxes if applicable
6. Any occupation-specific taxes or deductions

For each tax preset, provide:
1. name - Tax name in English
2. description - Brief description of what this tax is for
3. rate - Tax rate as a decimal (e.g., 0.18 for 18%). For progressive taxes, use the most common rate or mid-bracket rate.
4. tax_type - "percentage" for rate-based taxes, "fixed" for fixed amounts
5. frequency - How often it's paid: "monthly", "quarterly", or "annually"
6. is_deductible - true if this is a deduction that reduces taxable income, false if it's a tax payment
7. category - One of: "Income", "Social", "Property", "Business", "Healthcare", "Pension", "Other"
8. notes - Any important notes (optional, include if there are important conditions or thresholds)

Return a JSON object with this structure:
{{
  "presets": [
    {{
      "name": "Personal Income Tax",
      "description": "Tax on personal income from employment",
      "rate": 0.18,
      "tax_type": "percentage",
      "frequency": "monthly",
      "is_deductible": false,
      "category": "Income",
      "notes": "18% flat rate on employment income"
    }}
  ]
}}

Important:
- Only include taxes that are actually applicable in the specified country
- Use current tax rates (as of your knowledge cutoff)
- For self-employed/freelancers, include both personal taxes and business-related taxes
- For employees, include the employee portion of social contributions
- Be accurate with rates - don't guess if unsure, use approximate rates and note uncertainty"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a tax expert assistant providing accurate tax information. Always return valid JSON with tax presets relevant to the user's country and occupation.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.3,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )

            # Parse the response
            content = response.choices[0].message.content
            parsed_data = json.loads(content)

            # Convert to TaxPreset objects
            presets = []
            valid_tax_types = ["percentage", "fixed"]
            valid_frequencies = ["monthly", "quarterly", "annually"]
            valid_categories = ["Income", "Social", "Property", "Business", "Healthcare", "Pension", "Other"]

            for preset in parsed_data.get("presets", []):
                # Validate tax_type
                tax_type = preset.get("tax_type", "percentage")
                if tax_type not in valid_tax_types:
                    tax_type = "percentage"

                # Validate frequency
                frequency = preset.get("frequency", "monthly")
                if frequency not in valid_frequencies:
                    frequency = "monthly"

                # Validate category
                category = preset.get("category", "Other")
                if category not in valid_categories:
                    category = "Other"

                # Parse rate
                rate = preset.get("rate", 0)
                try:
                    rate = float(rate)
                except (ValueError, TypeError):
                    rate = 0.0

                presets.append(
                    TaxPreset(
                        name=preset.get("name", "Unknown Tax"),
                        description=preset.get("description", ""),
                        rate=rate,
                        tax_type=tax_type,
                        frequency=frequency,
                        is_deductible=bool(preset.get("is_deductible", False)),
                        category=category,
                        notes=preset.get("notes"),
                    )
                )

            return presets

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"AI tax presets generation failed: {str(e)}")

    async def get_budget_presets(
        self,
        currency: str,
        expenses_summary: Dict,
        subscriptions_summary: Dict,
        installments_summary: Dict,
        goals_summary: Dict,
        portfolio_summary: Dict,
    ) -> tuple[List[BudgetPreset], str]:
        """
        Get budget presets based on user's financial data using AI

        Args:
            currency: User's preferred currency
            expenses_summary: Summary of user's expenses by category
            subscriptions_summary: Summary of user's subscriptions
            installments_summary: Summary of user's installments
            goals_summary: Summary of user's financial goals
            portfolio_summary: Summary of user's portfolio

        Returns:
            Tuple of (list of budget presets, analysis summary)
        """
        # Build data context for AI
        data_context = []

        if expenses_summary.get("categories"):
            data_context.append("EXPENSES (last 3 months):")
            for cat, data in expenses_summary["categories"].items():
                data_context.append(f"  - {cat}: {data['total']} {currency} ({data['count']} transactions, avg: {data['avg']:.2f})")
            data_context.append(f"  Total monthly average: {expenses_summary.get('monthly_avg', 0):.2f} {currency}")

        if subscriptions_summary.get("items"):
            data_context.append("\nSUBSCRIPTIONS:")
            for sub in subscriptions_summary["items"][:10]:  # Limit to top 10
                data_context.append(f"  - {sub['name']}: {sub['amount']} {sub['currency']} ({sub['frequency']})")
            data_context.append(f"  Total monthly: {subscriptions_summary.get('monthly_total', 0):.2f} {currency}")

        if installments_summary.get("items"):
            data_context.append("\nINSTALLMENTS:")
            for inst in installments_summary["items"][:10]:
                data_context.append(f"  - {inst['name']}: {inst['monthly_payment']} {inst['currency']}/month")
            data_context.append(f"  Total monthly: {installments_summary.get('monthly_total', 0):.2f} {currency}")

        if goals_summary.get("items"):
            data_context.append("\nFINANCIAL GOALS:")
            for goal in goals_summary["items"][:5]:
                data_context.append(f"  - {goal['name']}: target {goal['target_amount']} {goal['currency']}, monthly contribution: {goal.get('monthly_contribution', 0)}")

        if portfolio_summary.get("total_value", 0) > 0:
            data_context.append("\nPORTFOLIO:")
            data_context.append(f"  Total value: {portfolio_summary['total_value']:.2f} {currency}")
            data_context.append(f"  Holdings count: {portfolio_summary.get('holdings_count', 0)}")

        data_text = "\n".join(data_context) if data_context else "No financial data available yet."

        # Get actual expense categories from user's data - these are the ONLY categories that will work for budget tracking
        actual_expense_categories = list(expenses_summary.get("categories", {}).keys())

        # Build the prompt
        prompt = f"""You are a personal finance expert helping create budget recommendations.

Based on the user's financial data below, suggest budget presets that would help them manage their finances effectively.

USER'S FINANCIAL DATA:
{data_text}

Target Currency for budgets: {currency}

IMPORTANT CURRENCY RULES:
- All suggested_amount values MUST be in {currency}
- If the source data is in a different currency (e.g., UAH, EUR), you MUST convert it to {currency} before suggesting
- Common conversions: 1 USD ≈ 41 UAH, 1 USD ≈ 0.92 EUR, 1 USD ≈ 0.79 GBP
- The suggested_amount should be REALISTIC and match the scale of actual spending
- For example, if installments total 19,600 UAH/month, that's approximately 480 USD, so suggest around 500-550 USD, NOT 19,600 or 20,000

CRITICAL CATEGORY RULE:
The budget system tracks spending by EXACT category match. You MUST use categories that exist in the user's EXPENSES data.
User's actual expense categories: {', '.join(actual_expense_categories) if actual_expense_categories else 'No expense data yet'}

Create budget presets ONLY for categories that appear in the user's expense data above. For each budget:
1. name - A clear, descriptive budget name
2. category - MUST be one of the user's actual expense categories listed above. Do NOT use generic categories like "subscriptions" or "debt_payments" unless they appear in the expense data.
3. description - Brief explanation of what this budget covers
4. suggested_amount - Recommended MONTHLY amount in {currency}, converted if necessary from source currency. Add 10-15% buffer but keep it realistic.
5. period - "monthly" (recommended), "quarterly", or "yearly"
6. alert_threshold - Percentage at which to alert (70-90, default 80)
7. reasoning - Explain the calculation, including any currency conversion done
8. priority - "high" (essential), "medium" (important), "low" (nice to have)

Guidelines:
- ONLY suggest budgets for categories that exist in the user's expense data
- ALWAYS convert amounts to {currency} using realistic exchange rates
- Base the budget on actual spending data plus 10-15% buffer
- If user has subscriptions/installments, their expenses will have specific categories (like "Music", "Storage", etc.) - use THOSE categories, not generic "subscriptions"
- Suggest budgets for the most significant spending categories
- CRITICAL: suggested_amount must be a reasonable number in {currency}, not copied from another currency

Return a JSON object with this structure:
{{
  "presets": [
    {{
      "name": "Monthly Groceries",
      "category": "groceries",
      "description": "Budget for food and household essentials",
      "suggested_amount": 500,
      "period": "monthly",
      "alert_threshold": 80,
      "reasoning": "Based on your average grocery spending of $450, with 10% buffer",
      "priority": "high"
    }}
  ],
  "analysis_summary": "Brief summary of what data was analyzed and overall recommendations"
}}"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a personal finance expert providing budget recommendations. Always return valid JSON with practical, data-driven budget suggestions.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.4,
                max_tokens=2500,
                response_format={"type": "json_object"},
            )

            # Parse the response
            content = response.choices[0].message.content
            parsed_data = json.loads(content)

            # Convert to BudgetPreset objects
            presets = []
            valid_periods = ["monthly", "quarterly", "yearly"]
            valid_priorities = ["high", "medium", "low"]

            for preset in parsed_data.get("presets", []):
                # Get category - accept whatever the AI returns since we instructed it to use actual expense categories
                category = preset.get("category", "other")

                # Validate period
                period = preset.get("period", "monthly")
                if period not in valid_periods:
                    period = "monthly"

                # Validate priority
                priority = preset.get("priority", "medium")
                if priority not in valid_priorities:
                    priority = "medium"

                # Parse amount
                amount = preset.get("suggested_amount", 0)
                try:
                    amount = float(amount)
                except (ValueError, TypeError):
                    amount = 0.0

                # Parse alert threshold
                alert_threshold = preset.get("alert_threshold", 80)
                try:
                    alert_threshold = int(alert_threshold)
                    alert_threshold = max(50, min(100, alert_threshold))  # Clamp between 50-100
                except (ValueError, TypeError):
                    alert_threshold = 80

                presets.append(
                    BudgetPreset(
                        name=preset.get("name", "Budget"),
                        category=category,
                        description=preset.get("description", ""),
                        suggested_amount=amount,
                        period=period,
                        alert_threshold=alert_threshold,
                        reasoning=preset.get("reasoning", ""),
                        priority=priority,
                    )
                )

            analysis_summary = parsed_data.get("analysis_summary", "Budget recommendations based on your financial data.")

            return presets, analysis_summary

        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse AI response: {str(e)}")
        except Exception as e:
            raise ValueError(f"AI budget presets generation failed: {str(e)}")
