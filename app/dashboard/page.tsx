import { DashboardData } from '@/components/dashboard/DashboardData'

export default function DashboardPage() {
  return (
    <div className="w-full h-full p-4 sm:p-5 md:p-6">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor product sync status across all shops
          </p>
        </div>

        {/* Fetches stats, last-sync, product-operation-logs in parallel */}
        <DashboardData />
      </div>
    </div>
  )
}
