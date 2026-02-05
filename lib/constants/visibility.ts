import type { LucideIcon } from 'lucide-react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'

export const VISIBILITY_VALUES = ['auto', 'visible', 'hidden'] as const
export type VisibilityValue = (typeof VISIBILITY_VALUES)[number]

export interface VisibilityOption {
  value: VisibilityValue
  label: string
  Icon: LucideIcon
  /** Tailwind classes for the icon/text (e.g. color) */
  iconClassName: string
  labelClassName?: string
}

export const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    Icon: RefreshCw,
    iconClassName: 'text-amber-600 dark:text-amber-500',
    labelClassName: 'text-amber-700 dark:text-amber-400',
  },
  {
    value: 'visible',
    label: 'Visible',
    Icon: Eye,
    iconClassName: 'text-green-600 dark:text-green-500',
    labelClassName: 'text-green-700 dark:text-green-400',
  },
  {
    value: 'hidden',
    label: 'Hidden',
    Icon: EyeOff,
    iconClassName: 'text-muted-foreground',
    labelClassName: '',
  },
]

/** Get visibility option by value, or default to hidden for unknown values */
export function getVisibilityOption(value: string | null | undefined): VisibilityOption {
  const normalized = (value ?? '').toLowerCase()
  return VISIBILITY_OPTIONS.find((o) => o.value === normalized) ?? VISIBILITY_OPTIONS[2] // hidden
}
