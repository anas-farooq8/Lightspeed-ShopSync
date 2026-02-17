import Link from 'next/link'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { LastSync } from '@/components/dashboard/LastSync'
import { ArrowLeftRight, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
                Create, edit, and manage products across shops
              </p>
            </div>
            <Link href="/dashboard/sync-operations" className="block">
              <Card className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md cursor-pointer h-full">
                <CardContent className="flex items-center justify-between p-4 sm:p-5 md:p-6">
                  <p className="text-sm sm:text-base text-muted-foreground flex-1">
                    Create products missing in target shops, edit existing products, or fix items with no SKU.
                  </p>
                  <Button variant="ghost" size="icon" className="shrink-0 ml-2">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
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
