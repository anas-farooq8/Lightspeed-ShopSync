"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Package, Loader2 } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { SourcePanel } from '@/components/sync-operations/product-display/SourcePanel'
import { TargetPanel } from '@/components/sync-operations/product-display/TargetPanel'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import type { ProductDetails, ProductData, ProductImage, ImageInfo, EditableVariant, EditableTargetData, ProductContent } from '@/types/product'

function getVariantKey(v: EditableVariant): string | number {
  return v.temp_id ?? v.variant_id
}

function isSameImageInfo(a: ImageInfo | null, b: ImageInfo | null): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (a.src || '') === (b.src || '')
}

export default function PreviewCreatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sku = decodeURIComponent((params.sku as string) || '')
  const { navigating, navigateBack } = useProductNavigation()

  const targetShopsParam = searchParams.get('targetShops') || ''
  const selectedTargetShops = targetShopsParam.split(',').filter(Boolean)

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [productImages, setProductImages] = useState<Record<string, ProductImage[]>>({})
  
  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [activeTargetTld, setActiveTargetTld] = useState<string>('')
  const [targetData, setTargetData] = useState<Record<string, EditableTargetData>>({})
  const [activeLanguages, setActiveLanguages] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false)
  const initialContentRef = useRef<Record<string, Record<string, string>>>({})
  
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [selectingImageForVariant, setSelectingImageForVariant] = useState<number | null>(null)
  const [selectingProductImage, setSelectingProductImage] = useState(false)

  const sortedTargetShops = useMemo(() => 
    selectedTargetShops.sort((a, b) => a.localeCompare(b)), 
    [selectedTargetShops]
  )

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirmation(true)
    } else {
      navigateBack()
    }
  }, [isDirty, navigateBack])

  const handleCreateProduct = useCallback(() => {
    console.log('Create product in shop:', activeTargetTld)
    console.log('Data:', targetData[activeTargetTld])
  }, [activeTargetTld, targetData])

  // Compute values after data is loaded (using useMemo with dependencies)
  const sourceProduct = useMemo(() => 
    details?.source.find(p => p.product_id === selectedSourceProductId) || details?.source[0],
    [details, selectedSourceProductId]
  )
  const hasSourceDuplicates = useMemo(() => 
    (details?.source.length || 0) > 1,
    [details]
  )
  const hasMultipleTargets = sortedTargetShops.length > 1

  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        const productId = searchParams.get('productId')
        
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productId ? `&productId=${productId}` : ''}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
        
        if (data.source.length > 0) {
          const initialSourceId = productId ? parseInt(productId) : data.source[0].product_id
          setSelectedSourceProductId(initialSourceId)
          
          // Fetch images for source product so target can use them
          const sourceProduct = data.source.find((p: ProductData) => p.product_id === initialSourceId)
          let sourceImages: ProductImage[] = []
          if (sourceProduct?.images_link) {
            sourceImages = await fetchProductImages(sourceProduct.images_link, sourceProduct.shop_tld)
          }
          initializeTargetData(data, initialSourceId, selectedTargetShops, sourceImages)
        }
        
        const sortedTargets = selectedTargetShops.sort((a, b) => a.localeCompare(b))
        if (sortedTargets.length > 0) {
          setActiveTargetTld(sortedTargets[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
      } finally {
        setLoading(false)
      }
    }

    if (selectedTargetShops.length === 0) {
      setError('No target shops selected')
      setLoading(false)
      return
    }

    fetchProductDetails()
  }, [sku, searchParams])

  const fetchProductImages = async (imagesLink: string, shopTld: string): Promise<ProductImage[]> => {
    try {
      const response = await fetch(`/api/product-images?link=${encodeURIComponent(imagesLink)}&shopTld=${shopTld}`)
      if (!response.ok) return []
      
      const images = await response.json()
      const productImages: ProductImage[] = (images || []).map((img: any, idx: number) => ({
        id: img.id || `img-${idx}`,
        src: img.src,
        thumb: img.thumb,
        title: img.title,
        sort_order: img.sortOrder || idx
      }))
      
      setProductImages(prev => ({ ...prev, [shopTld]: productImages }))
      return productImages
    } catch (err) {
      console.error('Failed to fetch images:', err)
      return []
    }
  }

  const initializeTargetData = (data: ProductDetails, sourceProductId: number, targetShopTlds: string[], sourceImagesOverride?: ProductImage[]) => {
    const sourceProduct = data.source.find(p => p.product_id === sourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = data.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    const sourceImages = sourceImagesOverride ?? productImages[sourceProduct.shop_tld] ?? []
    
    const newTargetData: Record<string, EditableTargetData> = {}
    const newActiveLanguages: Record<string, string> = {}

    targetShopTlds.forEach(tld => {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const defaultLang = targetLanguages.find(l => l.is_default)?.code || targetLanguages[0]?.code || 'nl'
      
      const content_by_language: Record<string, ProductContent> = {}
      targetLanguages.forEach(lang => {
        const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang]
        content_by_language[lang.code] = {
          title: sourceContent?.title || '',
          fulltitle: sourceContent?.fulltitle || '',
          description: sourceContent?.description || '',
          content: sourceContent?.content || ''
        }
      })

      const variants: EditableVariant[] = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language?.[sourceDefaultLang]?.title || '' }
          ])
        )
      }))

      const firstImage = sourceImages[0]
      const initialProductImage: ImageInfo | null = sourceProduct.product_image
        ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
        : firstImage
          ? { src: firstImage.src, thumb: firstImage.thumb, title: firstImage.title }
          : null

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: [...sourceImages],
        originalImageOrder: sourceImages.map((_, idx) => idx),
        removedImageIds: new Set(),
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set(),
        originalVariantOrder: variants.map((_, idx) => idx),
        visibility: sourceProduct.visibility || 'visible',
        originalVisibility: sourceProduct.visibility || 'visible',
        productImage: initialProductImage,
        originalProductImage: initialProductImage,
        orderChanged: false,
        imageOrderChanged: false
      }

      newActiveLanguages[tld] = defaultLang
    })

    setTargetData(newTargetData)
    setActiveLanguages(newActiveLanguages)
    setIsDirty(false)
    
    // Store initial content for comparison
    const initialContent: Record<string, Record<string, string>> = {}
    targetShopTlds.forEach(tld => {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang]
      initialContent[tld] = {}
      targetLanguages.forEach(lang => {
        initialContent[tld][lang.code] = sourceContent?.content || ''
      })
    })
    initialContentRef.current = initialContent
  }

  const updateField = (tld: string, langCode: string, field: keyof ProductContent, value: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      let sourceValue: string
      if (field === 'content') {
        // For HTML content, compare with initial content from source
        sourceValue = initialContentRef.current[tld]?.[langCode] || ''
      } else {
        const sourceProduct = details?.source.find(p => p.product_id === selectedSourceProductId)
        const sourceDefaultLang = details?.shops[sourceProduct?.shop_tld || 'nl']?.languages?.find(l => l.is_default)?.code || 'nl'
        sourceValue = sourceProduct?.content_by_language?.[sourceDefaultLang]?.[field] || ''
      }
      
      const isChanged = value !== sourceValue
      const fieldKey = `${langCode}.${field}`
      
      const newDirtyFields = new Set(updated[tld].dirtyFields)
      if (isChanged) {
        newDirtyFields.add(fieldKey)
      } else {
        newDirtyFields.delete(fieldKey)
      }
      
      const visibilityChanged = updated[tld].visibility !== updated[tld].originalVisibility
      const productImageChanged = !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: {
            ...updated[tld].content_by_language[langCode],
            [field]: value
          }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || visibilityChanged || productImageChanged,
        dirtyFields: newDirtyFields
      }
      
      return updated
    })
    
    const anyDirty = Object.values(targetData).some(td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0)
    setIsDirty(anyDirty)
  }

  const updateVariant = (tld: string, variantIndex: number, field: 'sku' | 'price_excl', value: string | number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const variant = newVariants[variantIndex]
      const newValue = field === 'price_excl' ? parseFloat(value as string) || 0 : value
      
      newVariants[variantIndex] = { ...variant, [field]: newValue }
      
      const isChanged = field === 'sku' 
        ? newValue !== variant.originalSku
        : newValue !== variant.originalPrice
      
      const key = getVariantKey(variant)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(key)
      } else {
        const variantTitle = variant.content_by_language[activeLanguages[tld] || 'nl']?.title || ''
        const originalTitle = variant.originalTitle?.[activeLanguages[tld] || 'nl'] || ''
        if (variantTitle === originalTitle && variant.sku === variant.originalSku && variant.price_excl === variant.originalPrice) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const updateVariantTitle = (tld: string, variantIndex: number, langCode: string, title: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const variant = newVariants[variantIndex]
      
      newVariants[variantIndex] = {
        ...variant,
        content_by_language: {
          ...variant.content_by_language,
          [langCode]: { title }
        }
      }
      
      const originalTitle = variant.originalTitle?.[langCode] || ''
      const isChanged = title !== originalTitle
      
      const key = getVariantKey(variant)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(key)
      } else {
        if (variant.sku === variant.originalSku && variant.price_excl === variant.originalPrice && title === originalTitle) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const addVariant = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const targetLanguages = details.shops[tld]?.languages ?? []
      const newVariant: EditableVariant = {
        variant_id: Date.now(),
        temp_id: `new-${Date.now()}`,
        sku: '',
        is_default: false,
        sort_order: updated[tld].variants.length,
        price_excl: 0,
        image: null,
        originalSku: '',
        originalPrice: 0,
        originalTitle: {},
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [lang.code, { title: '' }])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.add(getVariantKey(newVariant))
      
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const orderChanged = updated[tld].variants.length + 1 !== originalVariants.length
      
      updated[tld] = {
        ...updated[tld],
        variants: [...updated[tld].variants, newVariant],
        orderChanged,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const removeVariant = (tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      const removedKey = getVariantKey(variants[variantIndex])
      const newVariants = variants.filter((_, idx) => idx !== variantIndex)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(removedKey)
      
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const orderChanged = newVariants.length !== originalVariants.length || !newVariants.every((v, i) => originalVariants[i]?.variant_id === v.variant_id)
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        orderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const moveVariant = (tld: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (fromIndex < 0 || fromIndex >= variants.length || toIndex < 0 || toIndex >= variants.length) return prev
      const newVariants = [...variants]
      const [movedVariant] = newVariants.splice(fromIndex, 1)
      newVariants.splice(toIndex, 0, movedVariant)
      
      newVariants.forEach((v, idx) => {
        v.sort_order = idx
      })
      
      // Check if order has changed from original by comparing variant IDs in order
      const currentOrder = newVariants.map(v => v.variant_id)
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const originalOrder = originalVariants.map(v => v.variant_id)
      const orderChanged = currentOrder.length !== originalOrder.length || !currentOrder.every((id, idx) => id === originalOrder[idx])
      
      const visibilityChanged = updated[tld].visibility !== updated[tld].originalVisibility
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        orderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || orderChanged || visibilityChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const updateVisibility = (tld: string, visibility: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const isChanged = visibility !== updated[tld].originalVisibility
      
      // Check if order has changed from original by comparing variant IDs in order
      const currentOrder = updated[tld].variants.map(v => v.variant_id)
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const originalOrder = originalVariants.map(v => v.variant_id)
      const orderChanged = !currentOrder.every((id, idx) => id === originalOrder[idx])
      
      updated[tld] = {
        ...updated[tld],
        visibility,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || isChanged || orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const resetVisibility = (tld: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      updated[tld] = {
        ...updated[tld],
        visibility: updated[tld].originalVisibility,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      return updated
    })
  }

  const selectVariantImage = (tld: string, variantIndex: number, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...newVariants[variantIndex],
        image: image ? { src: image.src, thumb: image.thumb, title: image.title } : null
      }
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.add(getVariantKey(newVariants[variantIndex]))
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
    setShowImageDialog(false)
    setSelectingImageForVariant(null)
  }

  const selectProductImage = (tld: string, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const productImage: ImageInfo | null = image
        ? { src: image.src, thumb: image.thumb, title: image.title }
        : null
      updated[tld] = {
        ...updated[tld],
        productImage,
        dirty: true
      }
      return updated
    })
    setIsDirty(true)
    setShowImageDialog(false)
    setSelectingProductImage(false)
  }

  const resetProductImage = (tld: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      updated[tld] = {
        ...updated[tld],
        productImage: updated[tld].originalProductImage,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
      }
      return updated
    })
  }

  const removeImage = (tld: string, imageId: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newRemovedIds = new Set(updated[tld].removedImageIds)
      newRemovedIds.add(imageId)
      
      updated[tld] = {
        ...updated[tld],
        removedImageIds: newRemovedIds,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const restoreImage = (tld: string, imageId: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newRemovedIds = new Set(updated[tld].removedImageIds)
      newRemovedIds.delete(imageId)
      
      updated[tld] = {
        ...updated[tld],
        removedImageIds: newRemovedIds,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
  }

  const moveImage = (tld: string, fromIdx: number, toIdx: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newImages = [...updated[tld].images]
      const [movedImage] = newImages.splice(fromIdx, 1)
      newImages.splice(toIdx, 0, movedImage)
      
      // Update sort_order for all images
      newImages.forEach((img, idx) => {
        img.sort_order = idx
      })
      
      const imageOrderChanged = newImages.some((img, idx) => updated[tld].originalImageOrder[idx] !== idx)
      
      updated[tld] = {
        ...updated[tld],
        images: newImages,
        imageOrderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || imageOrderChanged || updated[tld].orderChanged
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const resetImageOrder = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct || !sourceProduct.images) return
    
    const sourceImages: ProductImage[] = sourceProduct.images.map((img: any) => ({
      ...img,
      id: String(img.id)
    }))
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      updated[tld] = {
        ...updated[tld],
        images: [...sourceImages],
        imageOrderChanged: false,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged
      }
      
      return updated
    })
  }

  const resetField = (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    const sourceValue = sourceProduct.content_by_language?.[sourceDefaultLang]?.[field]
    
    updateField(tld, langCode, field, sourceValue || '')
  }

  const resetLanguage = (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newDirtyFields = new Set(
        Array.from(updated[tld].dirtyFields).filter(f => !f.startsWith(`${langCode}.`))
      )
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: { ...sourceProduct.content_by_language?.[sourceDefaultLang] }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
        dirtyFields: newDirtyFields
      }
      
      return updated
    })
  }

  const resetVariant = (tld: string, variantIndex: number) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const variant = updated[tld].variants[variantIndex]
      if (!variant) return prev
      
      const key = getVariantKey(variant)
      // New variant: remove it
      if (variant.temp_id) {
        const newVariants = updated[tld].variants.filter((_, idx) => idx !== variantIndex)
        const newDirtyVariants = new Set(updated[tld].dirtyVariants)
        newDirtyVariants.delete(key)
        const sourceProductForOrder = details.source.find(p => p.product_id === selectedSourceProductId)
        const originalVariants = sourceProductForOrder?.variants || []
        const orderChanged = newVariants.length !== originalVariants.length || !newVariants.every((v, i) => originalVariants[i]?.variant_id === v.variant_id)
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          orderChanged,
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || orderChanged,
          dirtyVariants: newDirtyVariants
        }
        return updated
      }
      
      const sourceVariant = sourceProduct.variants.find(v => v.variant_id === variant.variant_id)
      if (!sourceVariant) return prev
      
      const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
      const targetLanguages = details.shops[tld]?.languages ?? []
      
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...sourceVariant,
        sku: sourceVariant.sku || '',
        originalSku: sourceVariant.sku || '',
        originalPrice: sourceVariant.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            sourceVariant.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceVariant.content_by_language?.[sourceDefaultLang]?.title || '' }
          ])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(key)
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
  }

  const resetAllVariants = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    const targetLanguages = details.shops[tld]?.languages ?? []
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language?.[sourceDefaultLang]?.title || '' }
          ])
        )
      }))
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        orderChanged: false,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: new Set()
      }
      
      return updated
    })
  }

  const resetShop = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    initializeTargetData(details, selectedSourceProductId, [tld])
    setIsDirty(false)
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details || !sourceProduct) {
    return (
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <ProductHeader
            onBack={handleBack}
            identifier={{ label: 'Preview Create - SKU', value: sku }}
          />
          <div className="border border-destructive/50 rounded-lg p-8 sm:p-12 text-destructive text-sm sm:text-base text-center">
            {error || 'Product not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-w-0 pb-20">
      <LoadingShimmer show={navigating} position="top" />
      
      <AlertDialog open={showCloseConfirmation} onOpenChange={setShowCloseConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? All changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigateBack()} className="bg-destructive hover:bg-destructive/90">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasMultipleTargets ? (
        <Tabs value={activeTargetTld} onValueChange={setActiveTargetTld} className="w-full min-w-0">
          <div className="w-full p-4 sm:p-6">
            <ProductHeader
              onBack={handleBack}
              identifier={{ label: 'Preview Create - SKU', value: sku }}
              targetTabs={{ tlds: sortedTargetShops, activeTab: activeTargetTld }}
            />

            <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
              <div>
                <SourcePanel
                  product={sourceProduct}
                  languages={details.shops[sourceProduct.shop_tld]?.languages ?? []}
                  hasDuplicates={hasSourceDuplicates}
                  allProducts={details.source}
                  selectedProductId={selectedSourceProductId}
                  onProductSelect={setSelectedSourceProductId}
                />
              </div>

              {sortedTargetShops.map(tld => (
                <TabsContent key={tld} value={tld} className="mt-0">
                  <TargetPanel
                    shopTld={tld}
                    shopName={details.shops?.[tld]?.name ?? details.targets[tld]?.[0]?.shop_name ?? tld}
                    baseUrl={details.shops?.[tld]?.base_url ?? details.targets[tld]?.[0]?.base_url ?? ''}
                    languages={details.shops[tld]?.languages ?? []}
                    data={targetData[tld]}
                    activeLanguage={activeLanguages[tld] || ''}
                    imagesLink={sourceProduct.images_link}
                    sourceShopTld={sourceProduct.shop_tld}
                    onLanguageChange={(lang) => setActiveLanguages(prev => ({ ...prev, [tld]: lang }))}
                    onUpdateField={(lang, field, value) => updateField(tld, lang, field, value)}
                    onResetField={(lang, field) => resetField(tld, lang, field)}
                    onResetLanguage={(lang) => resetLanguage(tld, lang)}
                    onResetShop={() => resetShop(tld)}
                    onUpdateVariant={(idx, field, val) => updateVariant(tld, idx, field, val)}
                    onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(tld, idx, lang, title)}
                    onAddVariant={() => addVariant(tld)}
                    onRemoveVariant={(idx) => removeVariant(tld, idx)}
                    onMoveVariant={(from, to) => moveVariant(tld, from, to)}
                    onResetVariant={(idx) => resetVariant(tld, idx)}
                    onResetAllVariants={() => resetAllVariants(tld)}
                    onSelectVariantImage={(idx) => {
                      setSelectingImageForVariant(idx)
                      setSelectingProductImage(false)
                      setShowImageDialog(true)
                    }}
                    onSelectProductImage={() => {
                      setSelectingProductImage(true)
                      setSelectingImageForVariant(null)
                      setShowImageDialog(true)
                    }}
                    onUpdateVisibility={(visibility) => updateVisibility(tld, visibility)}
                    onResetVisibility={() => resetVisibility(tld)}
                    onResetProductImage={() => resetProductImage(tld)}
                  />
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      ) : (
        <div className="w-full p-4 sm:p-6">
          <ProductHeader
            onBack={handleBack}
            identifier={{ label: 'Preview Create - SKU', value: sku }}
          />
          <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
            <SourcePanel
              product={sourceProduct}
              languages={details.shops[sourceProduct.shop_tld]?.languages ?? []}
              hasDuplicates={hasSourceDuplicates}
              allProducts={details.source}
              selectedProductId={selectedSourceProductId}
              onProductSelect={setSelectedSourceProductId}
            />
            <TargetPanel
              shopTld={sortedTargetShops[0]}
              shopName={details.shops?.[sortedTargetShops[0]]?.name ?? details.targets[sortedTargetShops[0]]?.[0]?.shop_name ?? sortedTargetShops[0]}
              baseUrl={details.shops?.[sortedTargetShops[0]]?.base_url ?? details.targets[sortedTargetShops[0]]?.[0]?.base_url ?? ''}
              languages={details.shops[sortedTargetShops[0]]?.languages ?? []}
              data={targetData[sortedTargetShops[0]]}
              activeLanguage={activeLanguages[sortedTargetShops[0]] || ''}
              imagesLink={sourceProduct?.images_link}
              sourceShopTld={sourceProduct?.shop_tld}
              onLanguageChange={(lang) => setActiveLanguages(prev => ({ ...prev, [sortedTargetShops[0]]: lang }))}
              onUpdateField={(lang, field, value) => updateField(sortedTargetShops[0], lang, field, value)}
              onResetField={(lang, field) => resetField(sortedTargetShops[0], lang, field)}
              onResetLanguage={(lang) => resetLanguage(sortedTargetShops[0], lang)}
              onResetShop={() => resetShop(sortedTargetShops[0])}
              onUpdateVariant={(idx, field, val) => updateVariant(sortedTargetShops[0], idx, field, val)}
              onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(sortedTargetShops[0], idx, lang, title)}
              onAddVariant={() => addVariant(sortedTargetShops[0])}
              onRemoveVariant={(idx) => removeVariant(sortedTargetShops[0], idx)}
              onMoveVariant={(from, to) => moveVariant(sortedTargetShops[0], from, to)}
              onResetVariant={(idx) => resetVariant(sortedTargetShops[0], idx)}
              onResetAllVariants={() => resetAllVariants(sortedTargetShops[0])}
              onSelectVariantImage={(idx) => {
                setSelectingImageForVariant(idx)
                setSelectingProductImage(false)
                setShowImageDialog(true)
              }}
              onSelectProductImage={() => {
                setSelectingProductImage(true)
                setSelectingImageForVariant(null)
                setShowImageDialog(true)
              }}
              onUpdateVisibility={(visibility) => updateVisibility(sortedTargetShops[0], visibility)}
              onResetVisibility={() => resetVisibility(sortedTargetShops[0])}
              onResetProductImage={() => resetProductImage(sortedTargetShops[0])}
            />
          </div>
        </div>
      )}

      {/* Image Selection Dialog (variant or product image) */}
      <Dialog open={showImageDialog} onOpenChange={(open) => {
        if (!open) {
          setShowImageDialog(false)
          setSelectingImageForVariant(null)
          setSelectingProductImage(false)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectingProductImage ? 'Select Product Image' : 'Select Variant Image'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
            <div
              onClick={() => {
                if (selectingProductImage) selectProductImage(activeTargetTld, null)
                else if (selectingImageForVariant !== null) selectVariantImage(activeTargetTld, selectingImageForVariant, null)
              }}
              className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary flex items-center justify-center cursor-pointer transition-colors"
            >
              <div className="text-center text-muted-foreground text-sm">
                <Package className="h-8 w-8 mx-auto mb-2" />
                <p>No Image</p>
              </div>
            </div>
            {(productImages[sourceProduct.shop_tld] || []).map(img => (
              <div
                key={img.id}
                onClick={() => {
                  if (selectingProductImage) selectProductImage(activeTargetTld, img)
                  else if (selectingImageForVariant !== null) selectVariantImage(activeTargetTld, selectingImageForVariant, img)
                }}
                className="aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary cursor-pointer transition-colors"
              >
                <img src={img.src || img.thumb} alt={img.title || ''} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)} className="cursor-pointer">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            className="min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProduct}
            className="bg-red-600 hover:bg-red-700 min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer"
          >
            Create Product in .{activeTargetTld}
          </Button>
        </div>
      </div>
    </div>
  )
}

