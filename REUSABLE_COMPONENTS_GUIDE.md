# Reusable Module Components Guide

**Created:** October 6, 2025
**Purpose:** Standardize UI/UX across all modules (Expenses, Subscriptions, Installments, etc.)

---

## Overview

The Income module has been refactored to extract reusable components that all future modules should use. This ensures **consistent UX** across the platform and reduces code duplication.

---

## Components Created

### 1. ModuleHeader
**File:** `frontend/components/ui/module-header.tsx`

**Purpose:** Standard header for all module pages

**Usage:**
```tsx
import { ModuleHeader } from '@/components/ui/module-header';
import { Plus } from 'lucide-react';

<ModuleHeader
  title="Income Tracking"
  description="Track and manage your income sources"
  actionLabel="Add Income Source"
  actionIcon={Plus}
  onAction={handleAddSource}
/>
```

**Props:**
- `title` (required): Module title
- `description` (optional): Subtitle text
- `actionLabel` (optional): Button text (default: "Add New")
- `actionIcon` (optional): Lucide icon (default: Plus)
- `onAction` (optional): Click handler for action button
- `children` (optional): Additional custom content

**When to use:** As the FIRST element on every module page.

---

### 2. StatsCards
**File:** `frontend/components/ui/stats-cards.tsx`

**Purpose:** Display key metrics in a responsive grid

**Usage:**
```tsx
import { StatsCards, StatCard } from '@/components/ui/stats-cards';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';

const statsCards: StatCard[] = [
  {
    title: 'Total Sources',
    value: 12,
    description: '8 active',
    icon: DollarSign,
  },
  {
    title: 'Monthly Income',
    value: '$5,000',
    description: 'From 8 active sources',
    icon: TrendingUp,
  },
  {
    title: 'Annual Income',
    value: '$60,000',
    description: 'Projected yearly income',
    icon: Calendar,
  },
];

<StatsCards stats={statsCards} />
```

**StatCard Interface:**
```typescript
interface StatCard {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
}
```

**When to use:** Display 2-4 key metrics at the top of module pages (after ModuleHeader).

---

### 3. DeleteConfirmDialog
**File:** `frontend/components/ui/delete-confirm-dialog.tsx`

**Purpose:** Consistent delete confirmation across all modules

**Usage:**
```tsx
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';

const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [deletingId, setDeletingId] = useState<string | null>(null);
const [deleteItem, { isLoading: isDeleting }] = useDeleteItemMutation();

const handleDelete = (id: string) => {
  setDeletingId(id);
  setDeleteDialogOpen(true);
};

const confirmDelete = async () => {
  if (!deletingId) return;
  try {
    await deleteItem(deletingId).unwrap();
    setDeleteDialogOpen(false);
    setDeletingId(null);
  } catch (error) {
    console.error('Failed to delete:', error);
  }
};

<DeleteConfirmDialog
  open={deleteDialogOpen}
  onOpenChange={setDeleteDialogOpen}
  onConfirm={confirmDelete}
  title="Delete Income Source"
  itemName="income source"
  isDeleting={isDeleting}
/>
```

**Props:**
- `open` (required): Dialog visibility state
- `onOpenChange` (required): Callback for open/close
- `onConfirm` (required): Callback when delete is confirmed
- `title` (optional): Dialog title (default: "Are you sure?")
- `description` (optional): Custom message
- `isDeleting` (optional): Loading state during deletion
- `itemName` (optional): Name of item (default: "item")

**When to use:** Replace ALL browser `confirm()` or custom delete dialogs.

---

### 4. SearchFilter
**File:** `frontend/components/ui/search-filter.tsx`

**Purpose:** Reusable search bar with category dropdown for filtering module data

**Usage:**
```tsx
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';

const [searchQuery, setSearchQuery] = useState('');
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

// Get unique categories
const uniqueCategories = React.useMemo(() => {
  if (!data?.items) return [];
  const categories = data.items
    .map((item) => item.category)
    .filter((cat): cat is string => !!cat);
  return Array.from(new Set(categories)).sort();
}, [data?.items]);

// In JSX
<SearchFilter
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  selectedCategory={selectedCategory}
  onCategoryChange={setSelectedCategory}
  categories={uniqueCategories}
  searchPlaceholder="Search items..."
  categoryPlaceholder="All Categories"
/>

// Filter data
const filteredItems = filterBySearchAndCategory(
  items,
  searchQuery,
  selectedCategory,
  (item) => item.name,
  (item) => item.category
);
```

**Props:**
- `searchQuery` (required): Current search query string
- `onSearchChange` (required): Callback for search input changes
- `selectedCategory` (required): Currently selected category (or null)
- `onCategoryChange` (required): Callback for category selection
- `categories` (required): Array of available categories
- `searchPlaceholder` (optional): Search input placeholder (default: "Search by name...")
- `categoryPlaceholder` (optional): Category dropdown placeholder (default: "All Categories")

**When to use:** All modules that need name search and category filtering.

---

### 5. MonthFilter
**File:** `frontend/components/ui/month-filter.tsx`

**Purpose:** Filter time-based data by month/year

**Usage:**
```tsx
import { MonthFilter, filterByMonth } from '@/components/ui/month-filter';

const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

// In JSX
<MonthFilter
  selectedMonth={selectedMonth}
  onMonthChange={setSelectedMonth}
/>

// Filter data
const filteredItems = filterByMonth(
  items,
  selectedMonth,
  (item) => item.frequency,
  (item) => item.date,
  (item) => item.start_date,
  (item) => item.end_date
);
```

**When to use:** All time-based modules (Income, Expenses, Subscriptions, Installments).

---

## Standard Module Page Structure

All module pages should follow this structure:

```tsx
export default function ModulePage() {
  // 1. State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // 2. API Hooks
  const { data, isLoading, error, refetch } = useListItemsQuery({});
  const { data: stats } = useGetStatsQuery();
  const [deleteItem, { isLoading: isDeleting }] = useDeleteItemMutation();

  // 3. Handlers
  const handleAdd = () => {
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteItem(deletingId).unwrap();
      setDeleteDialogOpen(false);
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // 4. Prepare data
  // Get unique categories
  const uniqueCategories = React.useMemo(() => {
    if (!data?.items) return [];
    const categories = data.items
      .map((item) => item.category)
      .filter((cat): cat is string => !!cat);
    return Array.from(new Set(categories)).sort();
  }, [data?.items]);

  const statsCards: StatCard[] = stats ? [] : [];

  // Apply all filters: month -> search/category
  const monthFilteredItems = filterByMonth(items, selectedMonth, ...);
  const filteredItems = filterBySearchAndCategory(
    monthFilteredItems,
    searchQuery,
    selectedCategory,
    (item) => item.name,
    (item) => item.category
  );

  // 5. Render
  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* ModuleHeader */}
      <ModuleHeader
        title="Module Name"
        description="Module description"
        actionLabel="Add Item"
        onAction={handleAdd}
      />

      {/* StatsCards */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ApiErrorState error={error} />
      ) : stats ? (
        <StatsCards stats={statsCards} />
      ) : null}

      {/* Filter Section */}
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Items</h2>
          {/* Month filter for time-based modules */}
          <MonthFilter
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        </div>

        {/* Search and Category Filter */}
        <div className="mb-4">
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categories={uniqueCategories}
            searchPlaceholder="Search items..."
            categoryPlaceholder="All Categories"
          />
        </div>
      </div>

      {/* Data List/Grid */}
      {isLoading ? (
        <LoadingCards count={3} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !filteredItems || filteredItems.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="No items yet"
          description="Get started by adding your first item"
          actionLabel="Add Item"
          onAction={handleAdd}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Card key={item.id}>
              {/* Card content */}
              <Button onClick={() => handleEdit(item.id)}>Edit</Button>
              <Button onClick={() => handleDelete(item.id)}>Delete</Button>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      {isFormOpen && (
        <ItemForm
          itemId={editingId}
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingId(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Item"
        itemName="item"
        isDeleting={isDeleting}
      />
    </div>
  );
}
```

---

## Benefits

1. **Consistency**: All modules look and behave the same
2. **Less Code**: Reuse components instead of duplicating
3. **Easier Maintenance**: Update one component, affects all modules
4. **Faster Development**: Copy the pattern, plug in your data
5. **Better UX**: Users learn once, use everywhere

---

## Before/After Comparison

### Before (Income Page - 297 lines)
- Custom header HTML
- Inline stats cards with repeated CardHeader/CardContent
- Custom AlertDialog with inline props
- ~100 lines of repetitive UI code

### After (Income Page - ~250 lines)
- `<ModuleHeader />` - 5 lines
- `<StatsCards stats={statsCards} />` - 1 line
- `<DeleteConfirmDialog />` - 6 lines
- **47 lines saved** on a single module!

**For 7 modules:** ~329 lines saved across the platform! 🎉

---

## Migration Checklist for New Modules

When building a new module (Expenses, Subscriptions, etc.):

- [ ] Use `ModuleHeader` for page header
- [ ] Use `StatsCards` for metrics (if applicable)
- [ ] Use `SearchFilter` for name search and category filtering
- [ ] Use `DeleteConfirmDialog` for delete operations
- [ ] Use `MonthFilter` for time-based filtering (if applicable)
- [ ] Use `EmptyState` for no-data states
- [ ] Use `LoadingCards` / `LoadingState` for loading states
- [ ] Use `ApiErrorState` for error handling
- [ ] Follow the standard page structure template above

---

## Files Created/Modified

### New Components:
1. `frontend/components/ui/module-header.tsx` ✨ NEW
2. `frontend/components/ui/stats-cards.tsx` ✨ NEW
3. `frontend/components/ui/delete-confirm-dialog.tsx` ✨ NEW
4. `frontend/components/ui/search-filter.tsx` ✨ NEW
5. `frontend/components/ui/month-filter.tsx` (already existed)

### Updated:
1. `frontend/app/dashboard/income/page.tsx` - Refactored to use new components
2. `.claudeproject` - Documented all components with usage guidelines

---

## Next Steps

When building **Expenses**, **Subscriptions**, or **Installments** modules:

1. Copy the Income page structure as a template
2. Replace Income-specific logic with your module logic
3. Update the `statsCards` array with your metrics
4. Update the card rendering with your data fields
5. Everything else stays the same!

---

**Remember:** Consistency is key! Use these components everywhere. 🚀
