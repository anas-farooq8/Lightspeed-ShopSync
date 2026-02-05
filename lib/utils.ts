import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sort shops: source first, then targets alphabetically by TLD */
export function sortShopsSourceFirstThenByTld<T extends { role?: string; tld: string }>(
  items: T[] | null | undefined
): T[] {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => {
    if (a.role === 'source' && b.role !== 'source') return -1
    if (a.role !== 'source' && b.role === 'source') return 1
    return a.tld.localeCompare(b.tld)
  })
}

/** Format ISO date string for display (e.g. "Feb 5, 2025, 14:30:00") */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/** Get display label for shop role */
export function getShopRoleLabel(role?: string): string {
  return role === 'source' ? 'Source' : role === 'target' ? 'Target' : ''
}

/** Normalize base URL to safe external href (adds https if missing) */
export function toSafeExternalHref(baseUrl: string | null | undefined): string | null {
  const raw = (baseUrl ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}
