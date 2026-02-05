"use client"

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductListTab } from '@/components/sync-operations/ProductListTab'

interface Shop {
  shop_id: string
  shop_name: string
  tld: string
  role: string
}

export default function SyncOperationsPage() {
  const [activeTab, setActiveTab] = useState('create')
  const [shops, setShops] = useState<Shop[]>([])

  // Fetch shops once on mount - shared across all tabs
  useEffect(() => {
    async function fetchShops() {
      try {
        const response = await fetch('/api/shops')
        if (!response.ok) throw new Error('Failed to fetch shops')
        
        const data = await response.json()
        
        // Sort shops: source first, then targets alphabetically by tld
        const sortedShops = (data.shops || []).sort((a: Shop, b: Shop) => {
          if (a.role === 'source' && b.role !== 'source') return -1
          if (a.role !== 'source' && b.role === 'source') return 1
          return a.tld.localeCompare(b.tld)
        })
        
        setShops(sortedShops)
      } catch (err) {
        console.error('Failed to load shops:', err)
      }
    }
    
    fetchShops()
  }, [])

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

          <TabsContent value="create" className="mt-0">
            <ProductListTab operation="create" shops={shops} />
          </TabsContent>

          <TabsContent value="edit" className="mt-0">
            <div className="text-center py-12 text-muted-foreground">
              Edit tab - Coming soon
            </div>
          </TabsContent>

          <TabsContent value="null_sku" className="mt-0">
            <ProductListTab operation="null_sku" shops={shops} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
