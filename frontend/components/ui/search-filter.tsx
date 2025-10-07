/**
 * Search and Filter Component
 * Reusable search bar with category dropdown for filtering module data
 */

import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  categories: string[];
  searchPlaceholder?: string;
  categoryPlaceholder?: string;
  categoryLabels?: Record<string, string>;
}

export function SearchFilter({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  searchPlaceholder = 'Search by name...',
  categoryPlaceholder = 'All Categories',
  categoryLabels,
}: SearchFilterProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category Filter */}
      <Select
        value={selectedCategory || 'all'}
        onValueChange={(value) => onCategoryChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={categoryPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{categoryPlaceholder}</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category} value={category}>
              {categoryLabels?.[category] || category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filter items by search query and category
 */
export function filterBySearchAndCategory<T>(
  items: T[] | undefined,
  searchQuery: string,
  selectedCategory: string | null,
  getName: (item: T) => string,
  getCategory: (item: T) => string | undefined | null
): T[] | undefined {
  if (!items) return items;

  let filtered = items;

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((item) =>
      getName(item).toLowerCase().includes(query)
    );
  }

  // Filter by category
  if (selectedCategory) {
    filtered = filtered.filter((item) => {
      const category = getCategory(item);
      return category === selectedCategory;
    });
  }

  return filtered;
}
