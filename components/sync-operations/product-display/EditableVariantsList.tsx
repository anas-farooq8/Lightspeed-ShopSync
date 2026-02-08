import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Package, GripVertical, Plus, Trash2, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditableVariant } from '@/types/product'

interface EditableVariantsListProps {
  variants: EditableVariant[]
  activeLanguage: string
  dirtyVariants: Set<string | number>
  orderChanged: boolean
  onUpdateVariant: (idx: number, field: 'sku' | 'price_excl', value: string | number) => void
  onUpdateVariantTitle: (idx: number, lang: string, title: string) => void
  onAddVariant: () => void
  onRemoveVariant: (idx: number) => void
  onMoveVariant: (fromIdx: number, toIdx: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
}

function getVariantKey(v: EditableVariant): string | number {
  return v.temp_id ?? v.variant_id
}

export function EditableVariantsList({
  variants,
  activeLanguage,
  dirtyVariants,
  orderChanged,
  onUpdateVariant,
  onUpdateVariantTitle,
  onAddVariant,
  onRemoveVariant,
  onMoveVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage
}: EditableVariantsListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const lastDropTargetRef = useRef<number | null>(null)
  const dragPreviewRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    lastDropTargetRef.current = null
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.dropEffect = 'move'
    const row = e.currentTarget as HTMLElement
    const rect = row.getBoundingClientRect()
    const preview = dragPreviewRef.current
    if (preview && typeof document !== 'undefined') {
      const clone = row.cloneNode(true) as HTMLElement
      clone.style.width = `${rect.width}px`
      clone.style.opacity = '1'
      clone.style.pointerEvents = 'none'
      clone.style.boxShadow = '0 10px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.15)'
      clone.style.borderRadius = '0.5rem'
      clone.style.background = 'hsl(var(--background))'
      clone.style.border = '1px solid hsl(var(--border))'
      preview.innerHTML = ''
      preview.appendChild(clone)
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top
      e.dataTransfer.setDragImage(preview.firstChild as HTMLElement, offsetX, offsetY)
    }
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex === null || draggedIndex === index) return
    if (lastDropTargetRef.current === index) return
    lastDropTargetRef.current = index
    onMoveVariant(draggedIndex, index)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    lastDropTargetRef.current = null
    if (dragPreviewRef.current) dragPreviewRef.current.innerHTML = ''
  }

  return (
    <div className="space-y-3">
      <div
        ref={dragPreviewRef}
        className="fixed left-[-9999px] top-0 z-[9999] pointer-events-none"
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <h4 className="text-xs sm:text-sm font-bold uppercase">Variants ({variants.length})</h4>
        <div className="flex gap-2">
          {(dirtyVariants.size > 0 || orderChanged) && (
            <Button
              size="sm"
              variant="outline"
              onClick={onResetAllVariants}
              className="text-xs cursor-pointer"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset All
            </Button>
          )}
          <Button
            size="sm"
            onClick={onAddVariant}
            className="text-xs bg-red-600 hover:bg-red-700 cursor-pointer"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {variants.map((variant, idx) => {
          const isChanged = dirtyVariants.has(getVariantKey(variant))
          const variantImageUrl = variant.image?.src || variant.image?.thumb
          return (
            <div
              key={variant.variant_id || variant.temp_id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-start gap-2 p-2 sm:p-3 rounded-lg border bg-muted/30 transition-all duration-200 ease-out cursor-move select-none",
                draggedIndex === idx && "opacity-100 scale-[1.02] border-primary shadow-lg ring-2 ring-primary/20",
                draggedIndex !== null && draggedIndex !== idx && "border-primary/50 bg-primary/5",
                isChanged && "border-amber-500"
              )}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 mt-1 touch-none" />
              {isChanged && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onResetVariant(idx) }}
                  className="h-7 w-7 p-0 cursor-pointer shrink-0 mt-0.5"
                  title="Reset variant"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              <button
                type="button"
                onClick={() => onSelectVariantImage(idx)}
                className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center cursor-pointer border-2 border-dashed border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                {variantImageUrl ? (
                  <img src={variantImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
                )}
              </button>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={variant.sku ?? ''}
                    onChange={(e) => onUpdateVariant(idx, 'sku', e.target.value)}
                    placeholder="SKU"
                    className="h-8 text-xs flex-1 cursor-text"
                  />
                  <div className="relative flex items-center h-8 rounded-md border border-input bg-transparent dark:bg-input/30 overflow-hidden min-w-[120px] transition-[color,box-shadow] focus-within:ring-1 focus-within:ring-red-400 focus-within:border-red-300">
                    <span className="pl-2 text-xs text-muted-foreground shrink-0">€</span>
                    <input
                      type="number"
                      value={variant.price_excl}
                      onChange={(e) => onUpdateVariant(idx, 'price_excl', e.target.value)}
                      step="1"
                      placeholder="0.00"
                      className="flex-1 h-full px-1 text-xs bg-transparent border-0 outline-none cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="flex flex-col border-l border-input">
                      <button
                        type="button"
                        onClick={() => {
                          const currentPrice = parseFloat(String(variant.price_excl)) || 0
                          onUpdateVariant(idx, 'price_excl', (currentPrice + 1).toFixed(2))
                        }}
                        className="h-4 px-1 hover:bg-accent transition-colors cursor-pointer flex items-center justify-center"
                        title="Increase price"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentPrice = parseFloat(String(variant.price_excl)) || 0
                          onUpdateVariant(idx, 'price_excl', Math.max(0, currentPrice - 1).toFixed(2))
                        }}
                        className="h-4 px-1 hover:bg-accent transition-colors cursor-pointer flex items-center justify-center border-t border-input"
                        title="Decrease price"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
                <Input
                  value={variant.content_by_language[activeLanguage]?.title || ''}
                  onChange={(e) => onUpdateVariantTitle(idx, activeLanguage, e.target.value)}
                  placeholder="Variant title"
                  className="h-8 text-xs cursor-text"
                />
                {variant.is_default && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400">
                    Default
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveVariant(idx)}
                  className="h-7 w-7 p-0 cursor-pointer hover:bg-destructive/10"
                  title="Remove variant"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
