"use client"

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'

type ProductFiltersProps = {
  search: string
  filter: string
  sort: string
  onSearchChange: (value: string) => void
  onFilterChange: (value: string) => void
  onSortChange: (value: string) => void
}

export function ProductFilters({
  search,
  filter,
  sort,
  onSearchChange,
  onFilterChange,
  onSortChange
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search */}
      <div className="flex-1">
        <Label htmlFor="search" className="text-sm mb-2 block">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            type="text"
            placeholder="Search by SKU or product title..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filter */}
      <div className="sm:w-64">
        <Label htmlFor="filter" className="text-sm mb-2 block">Filter</Label>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger id="filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            <SelectItem value="missing_de">Missing in .de</SelectItem>
            <SelectItem value="missing_be">Missing in .be</SelectItem>
            <SelectItem value="missing_both">Missing in Both</SelectItem>
            <SelectItem value="exists_both">Exists in Both</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem>
            <SelectItem value="has_duplicates">Has Duplicates</SelectItem>
            <SelectItem value="nl_duplicates">.nl Has Duplicates</SelectItem>
            <SelectItem value="de_multiple">.de Multiple Matches</SelectItem>
            <SelectItem value="be_multiple">.be Multiple Matches</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort */}
      <div className="sm:w-48">
        <Label htmlFor="sort" className="text-sm mb-2 block">Sort By</Label>
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger id="sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at_desc">Newest First</SelectItem>
            <SelectItem value="created_at_asc">Oldest First</SelectItem>
            <SelectItem value="sku_asc">SKU (A-Z)</SelectItem>
            <SelectItem value="sku_desc">SKU (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
