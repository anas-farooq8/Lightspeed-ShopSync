'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X } from 'lucide-react'

export interface FilterValues {
  search: string
  status: 'all' | 'missing_de' | 'missing_be' | 'missing_both' | 'exists_both'
  dateRange: 'all' | 'last_7' | 'last_30' | 'last_90'
}

interface FiltersPanelProps {
  filters: FilterValues
  onFiltersChange: (filters: FilterValues) => void
}

export function FiltersPanel({ filters, onFiltersChange }: FiltersPanelProps) {
  const handleReset = () => {
    onFiltersChange({
      search: '',
      status: 'all',
      dateRange: 'all',
    })
  }

  const hasActiveFilters = filters.search !== '' || filters.status !== 'all' || filters.dateRange !== 'all'

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search SKU or product title..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="h-10"
          />
        </div>

        <Select value={filters.status} onValueChange={(value) =>
          onFiltersChange({ ...filters, status: value as FilterValues['status'] })
        }>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="missing_de">Missing in .de</SelectItem>
            <SelectItem value="missing_be">Missing in .be</SelectItem>
            <SelectItem value="missing_both">Missing in Both</SelectItem>
            <SelectItem value="exists_both">Exists in Both</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.dateRange} onValueChange={(value) =>
          onFiltersChange({ ...filters, dateRange: value as FilterValues['dateRange'] })
        }>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="last_7">Last 7 days</SelectItem>
            <SelectItem value="last_30">Last 30 days</SelectItem>
            <SelectItem value="last_90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-2 whitespace-nowrap bg-transparent"
          >
            <X className="h-4 w-4" />
            Reset
          </Button>
        )}
      </div>
    </div>
  )
}
