import { StatsCards } from '@/components/dashboard/StatsCards'
import { ProductList } from '@/components/dashboard/ProductList'

export default function DashboardPage() {
  return (
    <div className="w-full h-full p-6">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor product sync status across all shops
          </p>
        </div>

        {/* KPI Cards */}
        <StatsCards />

        {/* Product List */}
        <ProductList />
      </div>
    </div>
  )
}
