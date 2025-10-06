# Timezone Date Fix

## Issue
When users selected a date (e.g., October 6) in the Income/Expenses forms, it was being saved as the previous day (October 5).

## Root Cause
The issue occurred in the date conversion pipeline:

1. **Frontend** was converting date strings to ISO format with UTC timezone:
   - Input: `"2025-10-06"` from date picker
   - Conversion: `new Date("2025-10-06").toISOString()`
   - Result: `"2025-10-05T21:00:00.000Z"` (for UTC+3 timezone)

2. **Backend** was stripping timezone info without preserving the date:
   - Received: `"2025-10-05T21:00:00.000Z"`
   - Processed: `v.replace(tzinfo=None)` → `2025-10-05T21:00:00`
   - Stored in DB as the wrong date

## Solution

### Frontend Changes - Part 1: Sending Dates (Create/Update)
Changed date formatting from `.toISOString()` to simple date+time concatenation:

**Files Modified:**
- `frontend/components/income/income-source-form.tsx`
- `frontend/components/expenses/expense-form.tsx`

**Before:**
```typescript
submitData.date = data.date ? new Date(data.date).toISOString() : undefined;
```

**After:**
```typescript
// Keep date-only format to avoid timezone issues
submitData.date = data.date ? `${data.date}T00:00:00` : undefined;
```

This sends the date as `"2025-10-06T00:00:00"` without timezone, which is parsed as naive datetime.

### Frontend Changes - Part 2: Receiving Dates (Loading for Edit)
Changed date extraction to avoid timezone conversion when loading existing data:

**Files Modified:**
- `frontend/components/income/income-source-form.tsx`
- `frontend/components/expenses/expense-form.tsx`

**Before:**
```typescript
date: existingExpense.date
  ? new Date(existingExpense.date).toISOString().split('T')[0]
  : ''
```
This would convert `"2025-11-01T00:00:00"` → `new Date()` (interprets as local) → `.toISOString()` (converts to UTC) → `"2025-10-31T21:00:00.000Z"` → split → `"2025-10-31"` ❌

**After:**
```typescript
// Extract date directly from string to avoid timezone conversion
date: existingExpense.date
  ? existingExpense.date.split('T')[0]
  : ''
```
This directly extracts `"2025-11-01T00:00:00"` → split → `"2025-11-01"` ✅

### Backend Changes
Updated date validators to preserve the date value:

**Files Modified:**
- `backend/app/modules/income/schemas.py`
- `backend/app/modules/expenses/schemas.py`

**Updated Comments:**
```python
@field_validator("date", "start_date", "end_date", mode="before")
@classmethod
def validate_dates(cls, v: Optional[datetime]) -> Optional[datetime]:
    """Convert timezone-aware datetimes to naive datetime, preserving the date."""
    if v is None:
        return None
    if isinstance(v, str):
        from dateutil import parser
        v = parser.parse(v)
    # If timezone-aware, just strip timezone (don't convert to UTC)
    # This preserves the local date that the user selected
    if hasattr(v, 'tzinfo') and v.tzinfo is not None:
        return v.replace(tzinfo=None)
    return v
```

## Testing

### Expenses Module
✅ Create with date: October 6 → Stored as October 6
✅ Create with start_date: October 6 → Stored as October 6
✅ Update start_date to October 6 → Updated to October 6
✅ Edit expense with November 1 → Displays as November 1 (not October 31)

### Income Module
✅ Create with date: October 6 → Stored as October 6
✅ Edit income with November 1 → Displays as November 1 (not October 31)

### Verification
```bash
# Create expense with Nov 1
curl -X POST '.../expenses' -d '{"start_date":"2025-11-01T00:00:00"}'
# Returns: "start_date": "2025-11-01T00:00:00"

# Frontend processes for edit form
node -e "console.log('2025-11-01T00:00:00'.split('T')[0])"
# Returns: 2025-11-01 ✅

# OLD way would give wrong result
node -e "console.log(new Date('2025-11-01T00:00:00').toISOString().split('T')[0])"
# Returns: 2025-10-31 ❌ (in UTC+3 timezone)
```

## Impact
- ✅ No more off-by-one date errors
- ✅ Users see the exact date they selected
- ✅ Works across all timezones
- ✅ Applies to both one-time and recurring entries
- ✅ Works for create and update operations

## Technical Notes
- Dates are now stored as naive datetimes (no timezone info)
- Frontend sends dates as `YYYY-MM-DDT00:00:00` format
- Backend treats these as local dates and doesn't perform timezone conversion
- This is appropriate for date-only fields where we care about the calendar date, not the exact moment in time
