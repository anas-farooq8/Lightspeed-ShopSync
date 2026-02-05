import { SyncLog } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, getShopRoleLabel } from '@/lib/utils'
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
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
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusBadge = () => {
    switch (log.status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'running':
        return <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Running</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getTldBadge = (tld: string, role?: string) => {
    const roleLabel = getShopRoleLabel(role)
    return (
      <Badge variant="secondary" className="font-medium">
        .{tld.toLowerCase()} {roleLabel && `· ${roleLabel}`}
      </Badge>
    )
  }

  return (
    <Card className="p-3 hover:shadow-md transition-shadow">
      {/* Header: Shop, Status, Time */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{log.shop_name}</h3>
              {getTldBadge(log.shop_tld || 'unknown', log.shop_role)}
              {getStatusBadge()}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
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
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{log.error_message}</span>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {/* Products Fetched */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            <span>Fetched</span>
          </div>
          <div className="text-lg font-semibold">{log.products_fetched.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">products</div>
        </div>

        {/* Variants Fetched */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            <span>Fetched</span>
          </div>
          <div className="text-lg font-semibold">{log.variants_fetched.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">variants</div>
        </div>

        {/* Products Synced */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" />
            <span>Synced</span>
          </div>
          <div className="text-lg font-semibold">{log.products_synced.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">products</div>
        </div>

        {/* Variants Synced */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" />
            <span>Synced</span>
          </div>
          <div className="text-lg font-semibold">{log.variants_synced.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">variants</div>
        </div>

        {/* Products Deleted */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Trash2 className="h-3 w-3" />
            <span>Deleted</span>
          </div>
          <div className="text-lg font-semibold">{log.products_deleted.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">products</div>
        </div>

        {/* Variants Deleted */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Trash2 className="h-3 w-3" />
            <span>Deleted</span>
          </div>
          <div className="text-lg font-semibold">{log.variants_deleted.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">variants</div>
        </div>

        {/* Variants Filtered */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="h-3 w-3" />
            <span>Filtered</span>
          </div>
          <div className="text-lg font-semibold">{log.variants_filtered.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">orphaned</div>
        </div>
      </div>
    </Card>
  )
}
