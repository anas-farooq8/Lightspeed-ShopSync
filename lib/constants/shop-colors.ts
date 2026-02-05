/**
 * Dynamic Shop Color Generation
 * Truly dynamic color generation based on number of shops
 * Colors are calculated using HSL color space for maximum distinction
 */

// Shop color cache to ensure consistency across calls
const shopColorCache = new Map<string, string>()
const shopIndexCache = new Map<string, number>()
let totalShopsCount = 0

/**
 * Generate a color class string for a given index and total count
 * Uses HSL color space for even distribution across the color wheel
 */
function generateColorClasses(index: number, total: number): string {
  // Source shop (index 0) always gets blue
  if (index === 0) {
    return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700'
  }
  
  // Calculate hue evenly distributed across color wheel
  // Skip blue range (200-240) as it's reserved for source
  const targetIndex = index - 1
  const targetTotal = Math.max(1, total - 1)
  
  // Distribute hues across 0-360, skipping blue range
  const hueStep = 360 / targetTotal
  let hue = (targetIndex * hueStep) % 360
  
  // Skip blue range (200-240 degrees)
  if (hue >= 180 && hue <= 260) {
    hue = (hue + 80) % 360
  }
  
  // Convert hue to color name approximation for Tailwind
  const colorName = getColorNameFromHue(hue)
  
  return `bg-${colorName}-100 text-${colorName}-800 border-${colorName}-300 dark:bg-${colorName}-950 dark:text-${colorName}-300 dark:border-${colorName}-700`
}

/**
 * Map hue to Tailwind color name
 */
function getColorNameFromHue(hue: number): string {
  // Normalize hue to 0-360
  hue = ((hue % 360) + 360) % 360
  
  if (hue >= 0 && hue < 30) return 'red'
  if (hue >= 30 && hue < 60) return 'orange'
  if (hue >= 60 && hue < 90) return 'amber'
  if (hue >= 90 && hue < 150) return 'lime'
  if (hue >= 150 && hue < 180) return 'emerald'
  if (hue >= 260 && hue < 280) return 'purple'
  if (hue >= 280 && hue < 300) return 'fuchsia'
  if (hue >= 300 && hue < 330) return 'pink'
  if (hue >= 330 && hue < 360) return 'rose'
  
  // Fallback colors
  return 'gray'
}

/**
 * Initialize shop colors based on a list of shop TLDs
 * Call this with the list of shops (source first, then targets) to set up consistent colors
 */
export function initializeShopColors(shopTlds: string[], sourceShopTld?: string): void {
  shopColorCache.clear()
  shopIndexCache.clear()
  
  // If source shop is specified, ensure it's first
  const orderedTlds = sourceShopTld 
    ? [sourceShopTld, ...shopTlds.filter(tld => tld !== sourceShopTld)]
    : shopTlds
  
  totalShopsCount = orderedTlds.length
  
  orderedTlds.forEach((tld, index) => {
    shopIndexCache.set(tld.toLowerCase(), index)
    const color = generateColorClasses(index, totalShopsCount)
    shopColorCache.set(tld.toLowerCase(), color)
  })
}

/**
 * Get shop color classes for badge
 * Colors must be initialized first via initializeShopColors()
 */
export function getShopColorClasses(tld: string): string {
  const lowerTld = tld.toLowerCase()
  
  // Return cached color (should always be initialized via /shops endpoint)
  return shopColorCache.get(lowerTld) || 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-700'
}

/**
 * Clear shop color cache (useful for testing or when shop list changes)
 */
export function clearShopColorCache(): void {
  shopColorCache.clear()
  shopIndexCache.clear()
  totalShopsCount = 0
}
