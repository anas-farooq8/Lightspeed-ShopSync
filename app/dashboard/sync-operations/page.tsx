"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductListTab } from '@/components/sync-operations/ProductListTab'
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
  const shopsLoadedRef = useRef(false)
  
  // Get activeTab directly from URL, default to 'create' without redirect
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
        shopsLoadedRef.current = false // Reset on error so it can retry
      }
    }
    
    fetchShops()
  }, [])

  // Handle tab change - reset all filters when switching tabs
  const handleTabChange = (newTab: string) => {
    router.push(`/dashboard/sync-operations?tab=${newTab}`, { scroll: false })
  }

  return (
    <div className="w-full h-full p-6">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1">Sync Operations</h1>
          <p className="text-sm text-muted-foreground">
            Manage product synchronization between shops
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full max-w-[600px] grid-cols-3 mb-6">
            <TabsTrigger value="create" className="cursor-pointer">
              Create
            </TabsTrigger>
            <TabsTrigger value="edit" className="cursor-pointer" disabled>
              Edit
            </TabsTrigger>
            <TabsTrigger value="null_sku" className="cursor-pointer">
              Null SKU
            </TabsTrigger>
          </TabsList>

          {activeTab === 'create' && (
            <TabsContent value="create" className="mt-0">
              <ProductListTab operation="create" shops={shops} />
            </TabsContent>
          )}

          {activeTab === 'edit' && (
            <TabsContent value="edit" className="mt-0">
              <div className="text-center py-12 text-muted-foreground">
                Edit tab - Coming soon
              </div>
            </TabsContent>
          )}

          {activeTab === 'null_sku' && (
            <TabsContent value="null_sku" className="mt-0">
              <ProductListTab operation="null_sku" shops={shops} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
