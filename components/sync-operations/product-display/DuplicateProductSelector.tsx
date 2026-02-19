import { Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProductData } from '@/types/product'

interface DuplicateProductSelectorProps {
  products: ProductData[]
  selectedProductId: number | null
  onProductSelect: (productId: number) => void
  defaultLanguage: string
  isSource?: boolean
  /** When true (preview-create source switching), disable select and show spinner. */
  loading?: boolean
}

export function DuplicateProductSelector({
  products,
  selectedProductId,
  onProductSelect,
  defaultLanguage,
  isSource = false,
  loading = false
}: DuplicateProductSelectorProps) {
  if (products.length <= 1) return null

  return (
    <div className="mt-2 sm:mt-3 min-w-0 overflow-hidden">
      <div className="relative">
        <Select
          value={selectedProductId?.toString() || ''}
          onValueChange={(val) => onProductSelect(parseInt(val))}
          disabled={loading}
        >
          <SelectTrigger className="w-full max-w-full cursor-pointer h-9 sm:h-10 min-h-[40px] sm:min-h-0 touch-manipulation min-w-0 pr-10">
            <SelectValue placeholder="Select product..." />
          </SelectTrigger>
          <SelectContent align="start" className="max-w-[calc(100vw-2rem)]" sideOffset={4} collisionPadding={16}>
            {products.map((p) => {
              const content = p.content_by_language?.[defaultLanguage] || p.content?.[defaultLanguage]
              const isDefault = p.variants.find(v => v.is_default) !== undefined
              return (
                <SelectItem key={p.product_id} value={p.product_id.toString()} className="cursor-pointer">
                  <div className="flex items-center gap-2 text-sm min-w-0 overflow-hidden">
                    <span className="font-mono text-xs shrink-0">{p.product_id}</span>
                    <span className="text-xs shrink-0">-</span>
                    <span className={`text-xs shrink-0 ${isDefault ? 'text-green-600 font-medium' : 'text-orange-600'}`}>
                      {isDefault ? 'default' : 'non-default'}
                    </span>
                    <span className="text-xs shrink-0">-</span>
                    <span className="truncate min-w-0">{content?.title || 'Untitled'}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {loading && (
          <div className="pointer-events-none absolute inset-y-0 right-8 flex items-center pr-1">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {loading
          ? 'Loading product data…'
          : `${products.length} duplicate ${isSource ? 'source' : 'target'} products with this SKU`}
      </p>
    </div>
  )
}
