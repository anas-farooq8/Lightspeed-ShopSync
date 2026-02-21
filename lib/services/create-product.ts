/**
 * Create Product Service
 * 
 * Orchestrates the complete product creation flow from source to target shop
 * Based on CREATE_SYNC_ARCHITECTURE.md specification
 *
 * Notes on multi-language:
 * - Product details (title, description, etc.) are created in default language first,
 *   then updated for all additional languages after base product creation.
 * - Variant titles are initially created per the default language, then
 *   updated for each language (if available in content_by_language) right after product/variant creation. 
 */

import { LightspeedAPIClient } from './lightspeed-api'
import { downloadImage, clearImageCache } from './image-handler'
import { sortBySortOrder } from '@/lib/utils'

export interface ImageInfo {
  src: string
  thumb?: string
  title?: string
  sort_order: number
  id?: string
}

export interface VariantInfo {
  sku: string
  is_default: boolean
  sort_order: number
  price_excl: number
  image: ImageInfo | null
  /**
   * Per-language titles for this variant.
   * E.g. { "en": {title: ...}, "fr": {title: ... } }
   */
  content_by_language: Record<string, { title?: string }>
}

export interface CreateProductInput {
  // Target shop client
  targetClient: LightspeedAPIClient
  defaultLanguage: string // Default language code for the target shop
  targetLanguages: string[] // All active language codes
  
  // Product data
  visibility: string
  content_by_language: Record<string, {
    title: string
    fulltitle?: string
    description?: string
    content?: string
  }>
  
  // Variants and images
  variants: VariantInfo[]
  images: ImageInfo[] // ordered product images
}

/** Product/variant image for DB: { src, thumb, title } from Lightspeed API response */
export type ProductImageForDb = { src: string; thumb?: string; title?: string } | null

export interface CreateProductResult {
  success: boolean
  productId?: number
  createdVariants?: Array<{ variantId: number; sku: string }>
  /** For DB sync - variant index mapping */
  createdVariantsForDb?: Array<{ variantId: number; sku: string; index: number }>
  /** First image created (product or variant) - use for product.image in DB */
  productImageForDb?: ProductImageForDb
  /** Variant images from Lightspeed API - index -> { src, thumb, title } */
  variantImagesForDb?: Record<number, { src: string; thumb?: string; title?: string }>
  error?: string
  details?: any
}

/**
 * Sanitize variant title for Lightspeed API.
 * API returns "Invalid variant title" for empty/invalid titles - use SKU as fallback.
 */
function sanitizeVariantTitle(title: string | undefined | null, sku: string): string {
  const trimmed = (title ?? '').toString().trim()
  if (trimmed.length > 0) {
    return trimmed
  }
  return sku || 'Variant'
}

/** Extract { src, thumb, title } from API response. Lightspeed can return image: false or image: { src, thumb, title }. */
function toImageForDb(res: unknown): { src: string; thumb?: string; title?: string } | null {
  if (res === null || res === undefined || res === false) return null
  if (typeof res !== 'object' || !('src' in res) || typeof (res as { src?: unknown }).src !== 'string') return null
  const obj = res as { src: string; thumb?: string; title?: string }
  return { src: obj.src, thumb: obj.thumb, title: obj.title }
}

/**
 * Main create product orchestrator
 * Follows the 6-step process from CREATE_SYNC_ARCHITECTURE.md
 * 
 * Variant titles in all supported languages are set after initial creation.
 * Product details are also updated post-creation for all target languages.
 */
export async function createProduct(
  input: CreateProductInput
): Promise<CreateProductResult> {
  const { 
    targetClient, 
    defaultLanguage,
    targetLanguages,
    visibility, 
    content_by_language, 
    variants, 
    images 
  } = input

  try {
    const defaultContent = content_by_language[defaultLanguage]
    
    if (!defaultContent) {
      throw new Error(`No content found for default language: ${defaultLanguage}`)
    }

    console.log(`[CREATE] Starting product creation`)
    console.log(`[CREATE] Default language: ${defaultLanguage}`)
    console.log(`[CREATE] Target languages: ${targetLanguages.join(', ')}`)
    console.log(`[CREATE] Total variants: ${variants.length}`)
    console.log(`[CREATE] Total images: ${images.length}`)

    // ============================================================
    // STEP 1: Create product in default language
    // ============================================================
    console.log('[STEP 1] Creating product...')
    const createProductResponse = await targetClient.createProduct({
      product: {
        visibility,
        title: defaultContent.title,
        fulltitle: defaultContent.fulltitle,
        description: defaultContent.description,
        content: defaultContent.content,
      }
    }, defaultLanguage)

    const productId = createProductResponse.product.id
    console.log(`[STEP 1] ✓ Product created with ID: ${productId}`)

    // ============================================================
    // STEP 2: Get auto-created default variant
    // ============================================================
    console.log('[STEP 2] Getting auto-created default variant...')
    const variantsResponse = await targetClient.getVariants(productId, defaultLanguage)
    
    if (!variantsResponse.variants || variantsResponse.variants.length === 0) {
      throw new Error('No auto-created default variant found')
    }

    const autoDefaultVariantId = variantsResponse.variants[0].id
    console.log(`[STEP 2] ✓ Auto default variant ID: ${autoDefaultVariantId}`)

    // ============================================================
    // STEP 3: Process images and create variants with images
    // ============================================================
    console.log('[STEP 3] Processing images and variants...')
    
    const createdVariants = new Set<number>()
    const variantIdMap = new Map<number, number>() // source variant index -> created variant id
    let autoDefaultUsed = false
    /** Product image and variant images - filled from fetch after creation */
    let productImageForDb: ProductImageForDb = null
    const variantImagesForDb: Record<number, { src: string; thumb?: string; title?: string }> = {}

    const sortedImages = sortBySortOrder(images)
    console.log(`[CREATE] Sorted images (first created = product image):`, sortedImages.map((img, i) => `#${i + 1} sort_order=${img.sort_order} "${img.title}"`).join(', '))

    for (let imgIdx = 0; imgIdx < sortedImages.length; imgIdx++) {
      const image = sortedImages[imgIdx]
      const variantsForImage = variants
        .filter(v => v.image?.src === image.src)
        .sort((a, b) => (a.is_default ? 0 : 1) - (b.is_default ? 0 : 1)) // default first

      if (variantsForImage.length > 0) {
        console.log(`[STEP 3] Image #${imgIdx + 1} "${image.title}" (sort_order=${image.sort_order}) used by ${variantsForImage.length} variant(s)`)
        
        const imageData = await downloadImage(image.src)

        for (const variant of variantsForImage) {
          const variantIndex = variants.indexOf(variant)
          
          // Skip if already created
          if (createdVariants.has(variantIndex)) {
            continue
          }

          // Only set title in default language at this stage
          const defaultLangTitle = sanitizeVariantTitle(
            variant.content_by_language[defaultLanguage]?.title,
            variant.sku
          )

          if (variant.is_default && !autoDefaultUsed) {
            // Update auto-created default variant
            console.log(`[STEP 3]   → Updating auto default variant with SKU: ${variant.sku}`)
            await targetClient.updateVariant(autoDefaultVariantId, {
              variant: {
                product: productId,
                isDefault: true,
                sortOrder: variant.sort_order,
                sku: variant.sku,
                articleCode: variant.sku,
                priceExcl: variant.price_excl,
                title: defaultLangTitle,
                image: {
                  attachment: imageData.base64,
                  filename: (image.title?.trim() || 'image') + '.' + imageData.extension,
                }
              }
            }, defaultLanguage)
            variantIdMap.set(variantIndex, autoDefaultVariantId)
            createdVariants.add(variantIndex)
            autoDefaultUsed = true
            console.log(`[STEP 3]   ✓ Updated auto default variant`)
          } else {
            // Create new variant with image
            console.log(`[STEP 3]   → Creating variant with SKU: ${variant.sku}`)
            const createResponse = await targetClient.createVariant({
              variant: {
                product: productId,
                isDefault: variant.is_default,
                sortOrder: variant.sort_order,
                sku: variant.sku,
                articleCode: variant.sku,
                priceExcl: variant.price_excl,
                title: defaultLangTitle,
                image: {
                  attachment: imageData.base64,
                  filename: (image.title?.trim() || 'image') + '.' + imageData.extension,
                }
              }
            }, defaultLanguage)
            const newVariantId = createResponse.variant.id
            variantIdMap.set(variantIndex, newVariantId)
            createdVariants.add(variantIndex)
            console.log(`[STEP 3]   ✓ Created variant ID: ${newVariantId}`)
          }
        }
      } else {
        // ============================================================
        // STEP 4: Upload product-only images (no variants use this image)
        // ============================================================
        console.log(`[STEP 4] Uploading product-only image: "${image.title}"`)
        const imageData = await downloadImage(image.src)
        
        await targetClient.createProductImage(productId, {
          productImage: {
            attachment: imageData.base64,
            filename: (image.title?.trim() || 'image') + '.' + imageData.extension
          }
        }, defaultLanguage)
        console.log(`[STEP 4] ✓ Uploaded product image`)
      }
    }

    // ============================================================
    // STEP 5: Create remaining variants (no images or already created)
    // ============================================================
    console.log('[STEP 5] Creating remaining variants without images...')
    
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i]
      
      if (createdVariants.has(i)) {
        continue
      }

      const defaultLangTitle = sanitizeVariantTitle(
        variant.content_by_language[defaultLanguage]?.title,
        variant.sku
      )

      if (variant.is_default && !autoDefaultUsed) {
        // Update auto-created default variant (no image)
        console.log(`[STEP 5]   → Updating auto default variant with SKU: ${variant.sku}`)
        await targetClient.updateVariant(autoDefaultVariantId, {
          variant: {
            product: productId,
            isDefault: true,
            sortOrder: variant.sort_order,
            sku: variant.sku,
            articleCode: variant.sku,
            priceExcl: variant.price_excl,
            title: defaultLangTitle,
          }
        }, defaultLanguage)
        
        variantIdMap.set(i, autoDefaultVariantId)
        createdVariants.add(i)
        autoDefaultUsed = true
        console.log(`[STEP 5]   ✓ Updated auto default variant`)
      } else {
        // Create new variant (no image)
        console.log(`[STEP 5]   → Creating variant with SKU: ${variant.sku}`)
        const createResponse = await targetClient.createVariant({
          variant: {
            product: productId,
            isDefault: variant.is_default,
            sortOrder: variant.sort_order,
            sku: variant.sku,
            articleCode: variant.sku,
            priceExcl: variant.price_excl,
            title: defaultLangTitle,
          }
        }, defaultLanguage)
        
        const newVariantId = createResponse.variant.id
        variantIdMap.set(i, newVariantId)
        createdVariants.add(i)
        console.log(`[STEP 5]   ✓ Created variant ID: ${newVariantId}`)
      }
    }

    // ============================================================
    // MULTI-LANGUAGE: Update product details and variant titles for all additional languages
    // ============================================================
    const additionalLanguages = targetLanguages.filter(lang => lang !== defaultLanguage)
    
    if (additionalLanguages.length > 0) {
      console.log('[MULTI-LANG] Updating additional languages:', additionalLanguages)
      
      for (const lang of additionalLanguages) {
        const langContent = content_by_language[lang]
        
        if (!langContent) {
          console.warn(`[MULTI-LANG] Warning: No content for language ${lang}, skipping`)
          continue
        }

        // Update product content in this language
        console.log(`[MULTI-LANG] Updating product content for language: ${lang}`)
        await targetClient.updateProduct(productId, {
          product: {
            title: langContent.title,
            fulltitle: langContent.fulltitle,
            description: langContent.description,
            content: langContent.content,
          }
        }, lang)
        console.log(`[MULTI-LANG] ✓ Updated product for ${lang}`)

        // Now update each variant for this language, if a title is provided
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i]
          const variantId = variantIdMap.get(i)
          
          if (!variantId) {
            console.warn(`[MULTI-LANG] Warning: No variant ID found for index ${i}`)
            continue
          }

          // For each language, look for the localized title (optional per variant)
          const variantLangTitle = sanitizeVariantTitle(
            variant.content_by_language[lang]?.title,
            variant.sku
          )
          
          // Always make the update for this language for the variant, even if fallback to sku.
          await targetClient.updateVariant(variantId, {
            variant: {
              title: variantLangTitle,
            }
          }, lang)
          console.log(`[MULTI-LANG] ✓ Updated variant ${variantId} for ${lang}`)
        }
      }
    }

    // Clear image cache
    clearImageCache()

    // ============================================================
    // FETCH: Get product image and variant images from target
    // ============================================================
    const [productImagesRes, variantsRes] = await Promise.all([
      targetClient.getProductImages(productId, defaultLanguage),
      targetClient.getVariants(productId, defaultLanguage),
    ])

    // Variant images: from fetched variants by variantId (compute first - needed for product image)
    const fetchedVariants = variantsRes.variants ?? []
    for (const [index, variantId] of variantIdMap) {
      const fv = fetchedVariants.find((v) => v.id === variantId)
      const img = toImageForDb(fv?.image)
      if (img) {
        variantImagesForDb[index] = img
      }
    }

    // Product image: our first image = sortedImages[0]. When both product-only and variant
    // image get sortOrder=1, title matching can fail. Prefer variant image when first
    // image is variant-attached (we have it from getVariants). Otherwise use product images.
    const firstImage = sortedImages[0]
    const variantsUsingFirst = firstImage
      ? variants.filter((v) => v.image?.src === firstImage.src).sort((a, b) => (a.is_default ? 0 : 1) - (b.is_default ? 0 : 1))
      : []
    if (variantsUsingFirst.length > 0) {
      const firstVariantIndex = variants.indexOf(variantsUsingFirst[0])
      productImageForDb = variantImagesForDb[firstVariantIndex] ?? null
      if (productImageForDb) {
        console.log(`[DEBUG] productImageForDb from variant (${variantsUsingFirst[0].sku}) - avoids sortOrder=1 ambiguity`)
      }
    }
    if (!productImageForDb) {
      const firstImageTitle = (firstImage?.title ?? '').trim().toLowerCase()
      const sortOrder1Images = productImagesRes.filter((img) => img.sortOrder === 1)
      const productImg =
        sortOrder1Images.find((img) => (img.title ?? '').trim().toLowerCase() === firstImageTitle) ??
        sortOrder1Images[0] ??
        productImagesRes[0]
      productImageForDb = toImageForDb(productImg)
      if (productImagesRes.length > 0) {
        console.log(`[DEBUG] productImageForDb from product images: sortOrder=1 count=${sortOrder1Images.length}, title="${firstImageTitle}", matched:`, productImg ? 'yes' : 'no')
      }
    }

    console.log('[CREATE] ✓✓✓ Product creation complete!')
    console.log(`[CREATE] Product ID: ${productId}`)
    console.log(`[CREATE] Variants created: ${createdVariants.size}`)
    console.log(`[DEBUG] productImageForDb final:`, productImageForDb ? JSON.stringify(productImageForDb) : 'null')
    console.log(`[DEBUG] variantImagesForDb:`, JSON.stringify(variantImagesForDb))

    // Return createdVariants with index for DB sync mapping
    const createdVariantsList = Array.from(variantIdMap.entries()).map(([index, variantId]) => ({
      variantId,
      sku: variants[index].sku,
      index,
    }))

    return {
      success: true,
      productId,
      createdVariants: createdVariantsList.map(({ variantId, sku }) => ({ variantId, sku })),
      createdVariantsForDb: createdVariantsList,
      productImageForDb,
      variantImagesForDb: Object.keys(variantImagesForDb).length > 0 ? variantImagesForDb : undefined,
    }
  } catch (error) {
    console.error('[CREATE] ✗✗✗ Product creation failed:', error)
    
    // Clear image cache on error
    clearImageCache()
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error,
    }
  }
}
