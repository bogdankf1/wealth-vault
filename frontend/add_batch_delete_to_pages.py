#!/usr/bin/env python3
"""
Script to add batch delete functionality to remaining dashboard pages.
"""
import re
import sys

# Configuration for each module
MODULES = {
    "savings": {
        "path": "app/dashboard/savings/page.tsx",
        "api_import": "useBatchDeleteSavingsAccountsMutation",
        "api_file": "savingsApi",
        "item_name": "account",
        "item_name_singular": "account",
        "id_field": "ids",
        "state_var": "selectedAccountIds",
        "id_property": "id"
    },
    "portfolio": {
        "path": "app/dashboard/portfolio/page.tsx",
        "api_import": "useBatchDeleteAssetsMutation",
        "api_file": "portfolioApi",
        "item_name": "asset",
        "item_name_singular": "asset",
        "id_field": "ids",
        "state_var": "selectedAssetIds",
        "id_property": "id"
    },
    "goals": {
        "path": "app/dashboard/goals/page.tsx",
        "api_import": "useBatchDeleteGoalsMutation",
        "api_file": "goalsApi",
        "item_name": "goal",
        "item_name_singular": "goal",
        "id_field": "ids",
        "state_var": "selectedGoalIds",
        "id_property": "id"
    },
    "installments": {
        "path": "app/dashboard/installments/page.tsx",
        "api_import": "useBatchDeleteInstallmentsMutation",
        "api_file": "installmentsApi",
        "item_name": "installment",
        "item_name_singular": "installment",
        "id_field": "ids",
        "state_var": "selectedInstallmentIds",
        "id_property": "id"
    },
    "debts": {
        "path": "app/dashboard/debts/page.tsx",
        "api_import": "useBatchDeleteDebtsMutation",
        "api_file": "debtsApi",
        "item_name": "debt",
        "item_name_singular": "debt",
        "id_field": "ids",
        "state_var": "selectedDebtIds",
        "id_property": "id"
    },
    "taxes": {
        "path": "app/dashboard/taxes/page.tsx",
        "api_import": "useBatchDeleteTaxesMutation",
        "api_file": "taxesApi",
        "item_name": "tax",
        "item_name_singular": "tax record",
        "id_field": "ids",
        "state_var": "selectedTaxIds",
        "id_property": "id"
    }
}

def generate_handlers(config):
    """Generate the handler functions code."""
    return f"""
  const handleToggleSelect = ({config['id_property']}Id: string) => {{
    set{config['state_var'][0].upper() + config['state_var'][1:]}((prev) => {{
      const newSet = new Set(prev);
      if (newSet.has({config['id_property']}Id)) {{
        newSet.delete({config['id_property']}Id);
      }} else {{
        newSet.add({config['id_property']}Id);
      }}
      return newSet;
    }});
  }};

  const handleSelectAll = () => {{
    if ({config['state_var']}.size === filtered{config['item_name'][0].upper() + config['item_name'][1:]}s.length && filtered{config['item_name'][0].upper() + config['item_name'][1:]}s.length > 0) {{
      set{config['state_var'][0].upper() + config['state_var'][1:]}(new Set());
    }} else {{
      set{config['state_var'][0].upper() + config['state_var'][1:]}(new Set(filtered{config['item_name'][0].upper() + config['item_name'][1:]}s.map(({config['item_name']}) => {config['item_name']}.{config['id_property']})));
    }}
  }};

  const handleBatchDelete = () => {{
    setBatchDeleteDialogOpen(true);
  }};

  const confirmBatchDelete = async () => {{
    if ({config['state_var']}.size === 0) return;

    try {{
      const result = await batchDelete{config['item_name'][0].upper() + config['item_name'][1:]}s({{
        {config['id_field']}: Array.from({config['state_var']}),
      }}).unwrap();

      if (result.failed_ids.length > 0) {{
        toast.error(`Failed to delete ${{result.failed_ids.length}} {config['item_name_singular']}(s)`);
      }} else {{
        toast.success(`Successfully deleted ${{result.deleted_count}} {config['item_name_singular']}(s)`);
      }}

      setBatchDeleteDialogOpen(false);
      set{config['state_var'][0].upper() + config['state_var'][1:]}(new Set());
    }} catch (error) {{
      toast.error('Failed to delete {config['item_name']}s');
    }}
  }};
"""

print("Configuration ready. This script generates the code patterns.")
print("Use Claude Code tools to apply changes to each file.")
for module_name, config in MODULES.items():
    print(f"\n=== {module_name.upper()} MODULE ===")
    print(f"File: {config['path']}")
    print(f"API Import: {config['api_import']}")
    print(f"ID Field: {config['id_field']}")
