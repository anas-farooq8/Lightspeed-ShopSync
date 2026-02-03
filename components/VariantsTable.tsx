'use client'

import { VariantSyncStatus } from '@/types/variant'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { AlertCircle, CheckCircle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VariantsTableProps {
  variants: VariantSyncStatus[]
  isLoading: boolean
}

function StatusBadge({ status }: { status: 'not_exists' | 'exists_single' | 'exists_multiple' }) {
  if (status === 'not_exists') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Missing
      </Badge>
    )
  }

  if (status === 'exists_single') {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
        <CheckCircle className="h-3 w-3" />
        OK (1)
      </Badge>
    )
  }

  return (
    <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
      <AlertCircle className="h-3 w-3" />
      Multiple ({status === 'exists_multiple' ? '3' : '0'})
    </Badge>
  )
}

export function VariantsTable({ variants, isLoading }: VariantsTableProps) {
  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">Loading variants...</div>
  }

  if (variants.length === 0) {
    return <div className="text-center py-8 text-slate-500">No variants found</div>
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="font-semibold text-slate-900">SKU</TableHead>
            <TableHead className="font-semibold text-slate-900">Product / Variant</TableHead>
            <TableHead className="font-semibold text-slate-900">Price</TableHead>
            <TableHead className="font-semibold text-slate-900">.de Status</TableHead>
            <TableHead className="font-semibold text-slate-900">.be Status</TableHead>
            <TableHead className="font-semibold text-slate-900">Updated</TableHead>
            <TableHead className="font-semibold text-slate-900">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant) => (
            <TableRow key={variant.nl_variant_id} className="hover:bg-slate-50">
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{variant.sku}</span>
                  {variant.has_nl_duplicates && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {variant.nl_duplicate_count}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900">{variant.product_title}</span>
                  <span className="text-sm text-slate-500">{variant.variant_title}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-medium text-slate-900">€{variant.price_excl.toFixed(2)}</span>
              </TableCell>
              <TableCell>
                <StatusBadge status={variant.de_status} />
              </TableCell>
              <TableCell>
                <StatusBadge status={variant.be_status} />
              </TableCell>
              <TableCell className="text-sm text-slate-600">
                {formatDistanceToNow(new Date(variant.updated_at), { addSuffix: true })}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="gap-1">
                  <Eye className="h-4 w-4" />
                  Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
