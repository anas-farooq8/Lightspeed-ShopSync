/**
 * Create Product Service
 * 
 * Orchestrates the complete product creation flow from source to target shop
 * Based on CREATE_SYNC_ARCHITECTURE.md specification
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

export interface CreateProductResult {
  success: boolean
  productId?: number
  createdVariants?: Array<{ variantId: number; sku: string }>
  /** For DB sync - variant index mapping */
  createdVariantsForDb?: Array<{ variantId: number; sku: string; index: number }>
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

/**
 * Main create product orchestrator
 * Follows the 6-step process from CREATE_SYNC_ARCHITECTURE.md
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
    
    // Track which variants have been created
    const createdVariants = new Set<number>()
    const variantIdMap = new Map<number, number>() // source variant index -> created variant id
    let autoDefaultUsed = false

    const sortedImages = sortBySortOrder(images)

    for (const image of sortedImages) {
      // Find variants that use this image. Match by src (unique per image).
      const variantsForImage = variants.filter(v => v.image?.src === image.src)

      if (variantsForImage.length > 0) {
        console.log(`[STEP 3] Image "${image.title}" used by ${variantsForImage.length} variant(s)`)
        
        // Download and encode image once
        const imageData = await downloadImage(image.src)

        for (const variant of variantsForImage) {
          const variantIndex = variants.indexOf(variant)
          
          // Skip if already created
          if (createdVariants.has(variantIndex)) {
            continue
          }

          const variantTitle = sanitizeVariantTitle(
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
                title: variantTitle,
                image: {
                  attachment: imageData.base64,
                  filename: imageData.filename,
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
                title: variantTitle,
                image: {
                  attachment: imageData.base64,
                  filename: imageData.filename,
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
            filename: imageData.filename,
            title: image.title,
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
      
      // Skip if already created
      if (createdVariants.has(i)) {
        continue
      }

      const variantTitle = sanitizeVariantTitle(
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
            title: variantTitle,
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
            title: variantTitle,
          }
        }, defaultLanguage)
        
        const newVariantId = createResponse.variant.id
        variantIdMap.set(i, newVariantId)
        createdVariants.add(i)
        console.log(`[STEP 5]   ✓ Created variant ID: ${newVariantId}`)
      }
    }

    // ============================================================
    // STEP 6: (Optional) Normalize product image ordering
    // ============================================================
    console.log('[STEP 6] Skipping image order normalization (display uses sortOrder=1 from images)')

    // ============================================================
    // MULTI-LANGUAGE: Update product and variants for additional languages
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

        // Update product content
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

        // Update variant titles
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i]
          const variantId = variantIdMap.get(i)
          
          if (!variantId) {
            console.warn(`[MULTI-LANG] Warning: No variant ID found for index ${i}`)
            continue
          }

          const variantTitle = sanitizeVariantTitle(
            variant.content_by_language[lang]?.title,
            variant.sku
          )
          
          if (variantTitle) {
            await targetClient.updateVariant(variantId, {
              variant: {
                title: variantTitle,
              }
            }, lang)
            console.log(`[MULTI-LANG] ✓ Updated variant ${variantId} for ${lang}`)
          }
        }
      }
    }

    // Clear image cache
    clearImageCache()

    console.log('[CREATE] ✓✓✓ Product creation complete!')
    console.log(`[CREATE] Product ID: ${productId}`)
    console.log(`[CREATE] Variants created: ${createdVariants.size}`)

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

