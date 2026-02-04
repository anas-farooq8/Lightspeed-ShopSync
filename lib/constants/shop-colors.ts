/**
 * Shop Color Constants
 * Consistent color scheme for shops across the application
 */

export const SHOP_COLORS = {
  nl: {
    badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700',
    name: 'VerpakkingenXL',
    flag: '🇳🇱',
  },
  de: {
    badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700',
    name: 'VerpackungenXL',
    flag: '🇩🇪',
  },
  be: {
    badge: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700',
    name: 'VerpakkingenXL-BE',
    flag: '🇧🇪',
  },
} as const

export type ShopTLD = keyof typeof SHOP_COLORS

/**
 * Get shop color classes for badge
 */
export function getShopColorClasses(tld: string): string {
  const shopTld = tld.toLowerCase() as ShopTLD
  return SHOP_COLORS[shopTld]?.badge || 'bg-gray-100 text-gray-800 border-gray-300'
}

/**
 * Get shop flag emoji
 */
export function getShopFlag(tld: string): string {
  const shopTld = tld.toLowerCase() as ShopTLD
  return SHOP_COLORS[shopTld]?.flag || '🏳️'
}
