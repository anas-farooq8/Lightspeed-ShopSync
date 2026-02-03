import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

type StatusBadgeProps = {
  status: 'not_exists' | 'exists_single' | 'exists_multiple'
  count: number
  variant?: 'de' | 'be'
}

export function StatusBadge({ status, count, variant = 'de' }: StatusBadgeProps) {
  const label = variant === 'de' ? '.de' : '.be'
  
  if (status === 'not_exists') {
    return (
      <Badge variant="destructive" className="gap-1 font-normal">
        <XCircle className="h-3 w-3" />
        {label}: Missing
      </Badge>
    )
  }
  
  if (status === 'exists_single') {
    return (
      <Badge variant="default" className="gap-1 font-normal bg-green-600 hover:bg-green-700">
        <CheckCircle2 className="h-3 w-3" />
        {label}: {count} match
      </Badge>
    )
  }
  
  // exists_multiple
  return (
    <Badge variant="secondary" className="gap-1 font-normal bg-yellow-100 text-yellow-900 hover:bg-yellow-200">
      <AlertCircle className="h-3 w-3" />
      {label}: {count} matches
    </Badge>
  )
}
