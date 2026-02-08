"use client"

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductListTab } from '@/components/sync-operations/product-list/ProductListTab'
import { sortShopsSourceFirstThenByTld } from '@/lib/utils'

interface Shop {
  shop_id: string
  shop_name: string
  tld: string
  role: string
}

export default function SyncOperationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const shopsLoadedRef = useRef(false)
  const navigationInProgressRef = useRef(false)
  
  // Get activeTab directly from URL, default to 'create'
  const activeTab = searchParams.get('tab') || 'create'
  const [shops, setShops] = useState<Shop[]>([])

  // Fetch shops once on mount - use ref to prevent duplicates
  useEffect(() => {
    if (shopsLoadedRef.current) return
    shopsLoadedRef.current = true
    
    async function fetchShops() {
      try {
        const response = await fetch('/api/shops')
        if (!response.ok) throw new Error('Failed to fetch shops')
        
        const data = await response.json()
        setShops(sortShopsSourceFirstThenByTld(data.shops))
      } catch (err) {
        console.error('Failed to load shops:', err)
        shopsLoadedRef.current = false
      }
    }
    
    fetchShops()
  }, [])

  // Handle tab change with deduplication
  const handleTabChange = (newTab: string) => {
    // Prevent duplicate navigations
    if (navigationInProgressRef.current || newTab === activeTab) return
    
    navigationInProgressRef.current = true
    
    startTransition(() => {
      router.push(`/dashboard/sync-operations?tab=${newTab}`, { scroll: false })
      // Reset flag after navigation completes
      setTimeout(() => {
        navigationInProgressRef.current = false
      }, 100)
    })
  }

  return (
    <div className="w-full h-full p-4 sm:p-5 md:p-6">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Sync Operations</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage product synchronization between shops
          </p>
        </div>

        {/* Tabs - Compact on mobile, spacious on web */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full min-w-0">
          <TabsList className="flex w-full sm:max-w-[550px] md:max-w-[700px] lg:max-w-[900px] gap-0.5 sm:gap-1 border border-border rounded-md p-0.5 sm:p-1.5 md:p-2 mb-4 sm:mb-6 bg-muted/50">
            <TabsTrigger
              value="create"
              className="flex-1 cursor-pointer rounded-md px-2 py-1.5 sm:px-5 sm:py-2.5 md:px-10 md:py-4 text-xs sm:text-sm md:text-base font-medium transition-all duration-200 ease-out min-h-[36px] sm:min-h-[40px] md:min-h-0 touch-manipulation data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm hover:data-[state=active]:bg-red-700 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground/80"
            >
              Create
            </TabsTrigger>
            <TabsTrigger
              value="edit"
              className="flex-1 cursor-pointer rounded-md px-2 py-1.5 sm:px-5 sm:py-2.5 md:px-10 md:py-4 text-xs sm:text-sm md:text-base font-medium transition-all duration-200 ease-out min-h-[36px] sm:min-h-[40px] md:min-h-0 touch-manipulation data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm hover:data-[state=active]:bg-red-700 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground/80"
            >
              Edit
            </TabsTrigger>
            <TabsTrigger
              value="null_sku"
              className="flex-1 cursor-pointer rounded-md px-2 py-1.5 sm:px-5 sm:py-2.5 md:px-10 md:py-4 text-xs sm:text-sm md:text-base font-medium transition-all duration-200 ease-out min-h-[36px] sm:min-h-[40px] md:min-h-0 touch-manipulation data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm hover:data-[state=active]:bg-red-700 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground/80"
            >
              Null SKU
            </TabsTrigger>
          </TabsList>

          <div className="mt-0 overflow-hidden">
            {activeTab === 'create' && (
              <div key="create" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ease-out">
                <ProductListTab operation="create" shops={shops} />
              </div>
            )}
            {activeTab === 'edit' && (
              <div key="edit" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ease-out">
                <ProductListTab operation="edit" shops={shops} />
              </div>
            )}
            {activeTab === 'null_sku' && (
              <div key="null_sku" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ease-out">
                <ProductListTab operation="null_sku" shops={shops} />
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  )
}
