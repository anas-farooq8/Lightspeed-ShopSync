import { StatsCards } from '@/components/dashboard/StatsCards'
import { LastSync } from '@/components/dashboard/LastSync'
import { ArrowLeftRight } from 'lucide-react'

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

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Product Sync Operations */}
          <div>
            <div className="mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
                Product Sync Operations
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quick overview of sync operations
              </p>
            </div>
            <div className="border border-border rounded-lg p-6 bg-muted/20">
              <p className="text-sm text-muted-foreground text-center">
                Coming soon - Product sync operations will be displayed here
              </p>
            </div>
          </div>

          {/* Right Column - Last Sync Status */}
          <div>
            <LastSync />
          </div>
        </div>
      </div>
    </div>
  )
}
