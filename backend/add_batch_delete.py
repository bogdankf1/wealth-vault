"""
Script to add batch delete functionality to all modules
"""
import os
import re

MODULES = {
    "budgets": {"model": "Budget", "endpoint": "budgets"},
    "savings": {"model": "SavingsAccount", "endpoint": "accounts"},
    "portfolio": {"model": "Asset", "endpoint": "assets"},
    "goals": {"model": "Goal", "endpoint": "goals"},
    "subscriptions": {"model": "Subscription", "endpoint": "subscriptions"},
    "installments": {"model": "Installment", "endpoint": "installments"},
    "debts": {"model": "Debt", "endpoint": "debts"},
    "taxes": {"model": "TaxRecord", "endpoint": "records"},
}

def add_batch_delete_schemas(module_name):
    """Add batch delete schemas to module's schemas.py"""
    schemas_path = f"/Users/bohdanburukhin/Projects/wealth-vault/backend/app/modules/{module_name}/schemas.py"

    if not os.path.exists(schemas_path):
        print(f"Skipping {module_name}: schemas.py not found")
        return False

    with open(schemas_path, 'r') as f:
        content = f.read()

    # Check if batch delete schemas already exist
    if "BatchDelete" in content:
        print(f"Skipping {module_name}: batch delete schemas already exist")
        return True

    model = MODULES[module_name]["model"]

    # Add batch delete schemas at the end
    batch_delete_schemas = f'''

# ============================================================================
# Batch Delete Schemas
# ============================================================================

class {model}BatchDelete(BaseModel):
    """Schema for batch deleting {module_name}."""
    ids: list[UUID] = Field(..., min_length=1, description="List of {model} IDs to delete")


class {model}BatchDeleteResponse(BaseModel):
    """Schema for batch delete response."""
    deleted_count: int
    failed_ids: list[UUID] = []
'''

    content += batch_delete_schemas

    with open(schemas_path, 'w') as f:
        f.write(content)

    print(f"✓ Added batch delete schemas to {module_name}")
    return True


def find_router_file(module_name):
    """Find the router/api file for a module"""
    module_path = f"/Users/bohdanburukhin/Projects/wealth-vault/backend/app/modules/{module_name}"

    # Check for router.py or api.py
    if os.path.exists(f"{module_path}/router.py"):
        return f"{module_path}/router.py", "router"
    elif os.path.exists(f"{module_path}/api.py"):
        return f"{module_path}/api.py", "api"

    return None, None


def add_batch_delete_endpoint(module_name):
    """Add batch delete endpoint to module's router/api file"""
    router_path, router_type = find_router_file(module_name)

    if not router_path:
        print(f"Skipping {module_name}: router/api file not found")
        return False

    with open(router_path, 'r') as f:
        content = f.read()

    # Check if batch delete endpoint already exists
    if "batch-delete" in content or "batch_delete" in content:
        print(f"Skipping {module_name}: batch delete endpoint already exists")
        return True

    model = MODULES[module_name]["model"]
    endpoint = MODULES[module_name]["endpoint"]

    # Add imports - find the schemas import section and add batch delete schemas
    import_pattern = r'(from app\.modules\.' + re.escape(module_name) + r'\.schemas import \([^)]+\))'

    def add_to_imports(match):
        imports = match.group(1)
        # Add batch delete imports before the closing parenthesis
        imports = imports.rstrip(')')
        imports += f",\n    {model}BatchDelete,\n    {model}BatchDeleteResponse,\n)"
        return imports

    content = re.sub(import_pattern, add_to_imports, content, flags=re.MULTILINE | re.DOTALL)

    # Find the delete endpoint and add batch delete after it
    # Look for the single delete endpoint pattern
    delete_pattern = rf'(@router\.delete\(["\']/{endpoint}/{{[^}}]+}}'

    matches = list(re.finditer(delete_pattern, content))

    if not matches:
        print(f"Warning: Could not find delete endpoint pattern for {module_name}")
        # Try to add at the end of the file
        insertion_point = len(content)
    else:
        # Find the end of the delete function (next @router or end of file)
        last_delete_match = matches[-1]
        search_start = last_delete_match.end()

        # Find the next router decorator or end of file
        next_router_match = re.search(r'\n@router\.', content[search_start:])

        if next_router_match:
            insertion_point = search_start + next_router_match.start()
        else:
            insertion_point = len(content)

    # Create batch delete endpoint
    batch_delete_endpoint = f'''

@router.post("/{endpoint}/batch-delete", response_model={model}BatchDeleteResponse)
async def batch_delete_{endpoint}(
    batch_data: {model}BatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple {module_name} in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            # Use the existing delete logic
            from app.modules.{module_name}.service import delete_{endpoint.rstrip('s') if endpoint.endswith('s') and not endpoint.endswith('ss') else endpoint[:-1]}
            success = await delete_{endpoint.rstrip('s') if endpoint.endswith('s') and not endpoint.endswith('ss') else endpoint[:-1]}(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return {model}BatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )

'''

    content = content[:insertion_point] + batch_delete_endpoint + content[insertion_point:]

    with open(router_path, 'w') as f:
        f.write(content)

    print(f"✓ Added batch delete endpoint to {module_name}")
    return True


if __name__ == "__main__":
    print("Adding batch delete functionality to all modules...\n")

    for module_name in MODULES.keys():
        print(f"\n=== Processing {module_name} ===")

        # Add schemas
        add_batch_delete_schemas(module_name)

        # Add endpoint
        add_batch_delete_endpoint(module_name)

    print("\n✓ Done!")
