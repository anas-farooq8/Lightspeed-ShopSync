"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TargetShop {
  tld: string
  name: string
  status: 'not_exists' | 'exists' | 'unknown'
}

interface TargetShopSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetShops: TargetShop[]
  onConfirm: (selectedShops: string[]) => void
  productSku: string
  isLoading?: boolean
}

export function TargetShopSelectionDialog({
  open,
  onOpenChange,
  targetShops,
  onConfirm,
  productSku,
  isLoading = false,
}: TargetShopSelectionDialogProps) {
  const defaultSelection = useMemo(
    () => targetShops.filter(shop => shop.status === 'not_exists').map(shop => shop.tld),
    [targetShops]
  )
  const [selectedShops, setSelectedShops] = useState<Set<string>>(() => new Set(defaultSelection))

  useEffect(() => {
    if (open) setSelectedShops(new Set(defaultSelection))
  }, [open, defaultSelection])

  const handleToggle = useCallback((tld: string, canSelect: boolean) => {
    if (!canSelect) return
    
    const newSelection = new Set(selectedShops)
    if (newSelection.has(tld)) {
      newSelection.delete(tld)
    } else {
      newSelection.add(tld)
    }
    setSelectedShops(newSelection)
  }, [])

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedShops))
  }, [onConfirm, selectedShops])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Select Target Shops</DialogTitle>
          <DialogDescription>
            Choose which shops to create this product in. Product SKU: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{productSku}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {targetShops.map((shop) => {
            const exists = shop.status === 'exists'
            const canSelect = !exists
            
            return (
              <div
                key={shop.tld}
                role="button"
                tabIndex={canSelect ? 0 : -1}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border',
                  exists
                    ? 'bg-muted/30 border-muted cursor-not-allowed opacity-60'
                    : 'bg-background border-border hover:bg-muted/50 cursor-pointer transition-colors'
                )}
                onClick={() => handleToggle(shop.tld, canSelect)}
                onKeyDown={(e) => canSelect && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleToggle(shop.tld, true))}
              >
                <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                  <Checkbox
                    id={`shop-${shop.tld}`}
                    checked={selectedShops.has(shop.tld)}
                    disabled={!canSelect}
                    onCheckedChange={() => handleToggle(shop.tld, canSelect)}
                    className="cursor-pointer"
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`shop-${shop.tld}`}
                    className={`font-medium ${canSelect ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    {shop.name}
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      .{shop.tld}
                    </Badge>
                    {exists ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        Already exists
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        Not exists
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedShops.size === 0 || isLoading}
            className="cursor-pointer bg-red-600 hover:bg-red-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Continue ({selectedShops.size} {selectedShops.size === 1 ? 'shop' : 'shops'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
