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
    <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
      {/* Search - occupies full space */}
      <div className="flex-1 min-w-0 w-full">
        <Label htmlFor="search" className="text-xs mb-1.5 block font-medium">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            type="text"
            placeholder="Search by SKU or product title..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9 w-full"
          />
        </div>
      </div>

      {/* Filter */}
      <div className="w-full md:w-52 shrink-0">
        <Label htmlFor="filter" className="text-xs mb-1.5 block font-medium">Filter</Label>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger id="filter" className="cursor-pointer h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="cursor-pointer">
            <SelectItem value="all" className="cursor-pointer">All Products</SelectItem>
            <SelectItem value="missing_de" className="cursor-pointer">Missing in .de</SelectItem>
            <SelectItem value="missing_be" className="cursor-pointer">Missing in .be</SelectItem>
            <SelectItem value="missing_both" className="cursor-pointer">Missing in Both</SelectItem>
            <SelectItem value="exists_both" className="cursor-pointer">Exists in Both</SelectItem>
            <SelectItem value="needs_attention" className="cursor-pointer">Needs Attention</SelectItem>
            <SelectItem value="has_duplicates" className="cursor-pointer">Has Duplicates</SelectItem>
            <SelectItem value="nl_duplicates" className="cursor-pointer">.nl Has Duplicates</SelectItem>
            <SelectItem value="de_multiple" className="cursor-pointer">.de Multiple Matches</SelectItem>
            <SelectItem value="be_multiple" className="cursor-pointer">.be Multiple Matches</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort */}
      <div className="w-full md:w-44 shrink-0">
        <Label htmlFor="sort" className="text-xs mb-1.5 block font-medium">Sort By</Label>
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger id="sort" className="cursor-pointer h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="cursor-pointer">
            <SelectItem value="created_at_desc" className="cursor-pointer">Newest First</SelectItem>
            <SelectItem value="created_at_asc" className="cursor-pointer">Oldest First</SelectItem>
            <SelectItem value="sku_asc" className="cursor-pointer">SKU (A-Z)</SelectItem>
            <SelectItem value="sku_desc" className="cursor-pointer">SKU (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
