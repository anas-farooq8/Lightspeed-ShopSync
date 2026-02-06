import { StatsCards } from '@/components/dashboard/StatsCards'
import { LastSync } from '@/components/dashboard/LastSync'
import { ArrowLeftRight } from 'lucide-react'

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

        {/* KPI Cards */}
        <StatsCards />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
          {/* Left Column - Product Sync Operations */}
          <div className="min-w-0">
            <div className="mb-2 sm:mb-3">
              <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                Product Sync Operations
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Quick overview of sync operations
              </p>
            </div>
            <div className="border border-border rounded-lg p-4 sm:p-5 md:p-6 bg-muted/20">
              <p className="text-xs sm:text-sm text-muted-foreground text-center">
                Coming soon - Product sync operations will be displayed here
              </p>
            </div>
          </div>

          {/* Right Column - Last Sync Status */}
          <div className="min-w-0">
            <LastSync />
          </div>
        </div>
      </div>
    </div>
  )
}
