import { SyncLog } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, getShopRoleLabel } from '@/lib/utils'
import { 
  CheckCircle2, 
  XCircle, 
  Download, 
  Upload, 
  Trash2, 
  Filter,
  Clock,
  AlertCircle
} from 'lucide-react'

interface SyncLogCardProps {
  log: SyncLog
}

export function SyncLogCard({ log }: SyncLogCardProps) {
  const getStatusIcon = () => {
    switch (log.status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 shrink-0" />
      case 'error':
        return <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 shrink-0" />
      default:
        return <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 shrink-0" />
    }
  }

  const getStatusBadge = () => {
    switch (log.status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Success</Badge>
      case 'error':
        return <Badge variant="destructive" className="text-xs">Error</Badge>
      default:
        return <Badge variant="outline" className="text-xs">Unknown</Badge>
    }
  }

  const getTldBadge = (tld: string, role?: string) => {
    const roleLabel = getShopRoleLabel(role)
    return (
      <Badge variant="secondary" className="font-medium text-xs">
        .{tld.toLowerCase()} {roleLabel && `· ${roleLabel}`}
      </Badge>
    )
  }

  return (
    <Card className="p-2.5 sm:p-3 hover:shadow-md transition-shadow min-w-0">
      {/* Header: Shop, Status, Time */}
      <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-2">
        <div className="flex items-start gap-2 min-w-0">
          {getStatusIcon()}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="font-semibold text-xs sm:text-sm truncate">{log.shop_name}</h3>
              {getTldBadge(log.shop_tld || 'unknown', log.shop_role)}
              {getStatusBadge()}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-xs text-muted-foreground mt-0.5">
              <span>Started: {formatDateTime(log.started_at)}</span>
              {log.completed_at && (
                <span>Completed: {formatDateTime(log.completed_at)}</span>
              )}
              {log.duration_seconds != null && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{log.duration_seconds.toFixed(1)}s</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {log.error_message && (
        <div className="mb-1.5 sm:mb-2 p-1.5 sm:p-2 bg-red-50 border border-red-200 rounded text-[10px] sm:text-xs text-red-800">
          <div className="flex items-start gap-1.5 sm:gap-2">
            <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2 break-words">{log.error_message}</span>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2 sm:gap-3">
        {/* Products Fetched */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Download className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Fetched</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.products_fetched.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">products</span>
          </div>
        </div>

        {/* Variants Fetched */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Download className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Fetched</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.variants_fetched.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">variants</span>
          </div>
        </div>

        {/* Products Synced */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Upload className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Synced</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.products_synced.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">products</span>
          </div>
        </div>

        {/* Variants Synced */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Upload className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Synced</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.variants_synced.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">variants</span>
          </div>
        </div>

        {/* Products Deleted */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Deleted</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.products_deleted.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">products</span>
          </div>
        </div>

        {/* Variants Deleted */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Deleted</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.variants_deleted.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">variants</span>
          </div>
        </div>

        {/* Variants Filtered */}
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Filter className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span>Filtered</span>
          </div>
          <div className="sm:block flex items-baseline gap-1">
            <span className="text-sm sm:text-lg font-semibold">{log.variants_filtered.toLocaleString()}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground sm:block">orphaned</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
