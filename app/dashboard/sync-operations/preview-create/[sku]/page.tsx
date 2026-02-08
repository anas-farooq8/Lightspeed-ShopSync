"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { 
  ArrowLeft, 
  Loader2, 
  Package, 
  RotateCcw, 
  GripVertical,
  Plus,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  X
} from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, cn } from '@/lib/utils'
import { getVisibilityOption } from '@/lib/constants/visibility'
import { ProductImagesGrid } from '@/components/sync-operations/ProductImagesGrid'
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
import dynamic from 'next/dynamic'
import type { default as ReactQuillType } from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(
  () => import('react-quill-new'),
  { ssr: false }
) as React.ComponentType<React.ComponentProps<typeof ReactQuillType>>

// Types
interface Language {
  code: string
  is_default: boolean
}

interface ProductContent {
  url?: string
  title?: string
  fulltitle?: string
  description?: string
  content?: string
}

interface VariantContent {
  title?: string
}

interface ImageInfo {
  src?: string
  thumb?: string
  title?: string
}

interface ProductImage {
  src: string
  thumb?: string
  title?: string
  sort_order: number
  id: string
}

interface Variant {
  variant_id: number
  sku: string
  is_default: boolean
  sort_order?: number
  price_excl: number
  image: ImageInfo | null
  content_by_language: Record<string, VariantContent>
}

interface ProductData {
  shop_id: string
  shop_name: string
  shop_tld: string
  shop_role: string
  base_url: string
  product_id: number
  default_variant_id: number
  sku: string
  visibility: string
  product_image: ImageInfo | null
  ls_created_at: string
  images_link?: string | null
  content_by_language: Record<string, ProductContent>
  variants: Variant[]
  variant_count: number
}

interface ProductDetails {
  source: ProductData[]
  targets: Record<string, ProductData[]>
  shop_languages: Record<string, Language[]>
}

interface EditableVariant extends Variant {
  temp_id?: string
  removed?: boolean
  originalSku?: string
  originalPrice?: number
  originalTitle?: Record<string, string>
}

interface EditableTargetData {
  content_by_language: Record<string, ProductContent>
  variants: EditableVariant[]
  images: ProductImage[]
  removedImageIds: Set<string>
  dirty: boolean
  dirtyFields: Set<string>
  dirtyVariants: Set<number>
}

export default function PreviewCreatePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sku = decodeURIComponent((params.sku as string) || '')

  const targetShopsParam = searchParams.get('targetShops') || ''
  const selectedTargetShops = targetShopsParam.split(',').filter(Boolean)

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productImages, setProductImages] = useState<Record<string, ProductImage[]>>({})
  
  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [activeTargetTld, setActiveTargetTld] = useState<string>('')
  const [targetData, setTargetData] = useState<Record<string, EditableTargetData>>({})
  const [activeLanguages, setActiveLanguages] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false)
  
  // Image selection dialog
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [selectingImageForVariant, setSelectingImageForVariant] = useState<number | null>(null)

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
          
          // Fetch images for source product
          const sourceProduct = data.source.find((p: ProductData) => p.product_id === initialSourceId)
          if (sourceProduct?.images_link) {
            await fetchProductImages(sourceProduct.images_link, sourceProduct.shop_tld)
          }
          
          initializeTargetData(data, initialSourceId, selectedTargetShops)
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

  const fetchProductImages = async (imagesLink: string, shopTld: string) => {
    try {
      const response = await fetch(imagesLink)
      if (!response.ok) return
      
      const data = await response.json()
      const images: ProductImage[] = (data.productImage || []).map((img: any, idx: number) => ({
        id: img.id || `img-${idx}`,
        src: img.src,
        thumb: img.thumb,
        title: img.title,
        sort_order: img.sortOrder || idx
      }))
      
      setProductImages(prev => ({ ...prev, [shopTld]: images }))
    } catch (err) {
      console.error('Failed to fetch images:', err)
    }
  }

  const initializeTargetData = (data: ProductDetails, sourceProductId: number, targetShopTlds: string[]) => {
    const sourceProduct = data.source.find(p => p.product_id === sourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = data.shop_languages[sourceProduct.shop_tld]?.find(l => l.is_default)?.code || 'nl'
    const sourceImages = productImages[sourceProduct.shop_tld] || []
    
    const newTargetData: Record<string, EditableTargetData> = {}
    const newActiveLanguages: Record<string, string> = {}

    targetShopTlds.forEach(tld => {
      const targetLanguages = data.shop_languages[tld] || []
      const defaultLang = targetLanguages.find(l => l.is_default)?.code || targetLanguages[0]?.code || 'nl'
      
      const content_by_language: Record<string, ProductContent> = {}
      targetLanguages.forEach(lang => {
        const sourceContent = sourceProduct.content_by_language[sourceDefaultLang]
        content_by_language[lang.code] = {
          title: sourceContent?.title || '',
          fulltitle: sourceContent?.fulltitle || '',
          description: sourceContent?.description || '',
          content: sourceContent?.content || ''
        }
      })

      const variants: EditableVariant[] = sourceProduct.variants.map(v => ({
        ...v,
        originalSku: v.sku,
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language[sourceDefaultLang]?.title || '' }
          ])
        )
      }))

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: [...sourceImages],
        removedImageIds: new Set(),
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set()
      }

      newActiveLanguages[tld] = defaultLang
    })

    setTargetData(newTargetData)
    setActiveLanguages(newActiveLanguages)
    setIsDirty(false)
  }

  const handleBack = () => {
    if (isDirty) {
      setShowCloseConfirmation(true)
    } else {
      navigateBack()
    }
  }

  const navigateBack = () => {
    setNavigating(true)
    const params = new URLSearchParams()
    const tab = searchParams.get('tab') || 'create'
    const search = searchParams.get('search')
    const page = searchParams.get('page')
    const missingIn = searchParams.get('missingIn')
    const onlyDuplicates = searchParams.get('onlyDuplicates')
    const sortBy = searchParams.get('sortBy')
    const sortOrder = searchParams.get('sortOrder')
    
    params.set('tab', tab)
    if (search) params.set('search', search)
    if (page) params.set('page', page)
    if (missingIn) params.set('missingIn', missingIn)
    if (onlyDuplicates) params.set('onlyDuplicates', onlyDuplicates)
    if (sortBy) params.set('sortBy', sortBy)
    if (sortOrder) params.set('sortOrder', sortOrder)
    
    const queryString = params.toString()
    router.push(`/dashboard/sync-operations${queryString ? `?${queryString}` : ''}`)
  }

  const updateField = (tld: string, langCode: string, field: keyof ProductContent, value: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const sourceProduct = details?.source.find(p => p.product_id === selectedSourceProductId)
      const sourceDefaultLang = details?.shop_languages[sourceProduct?.shop_tld || 'nl']?.find(l => l.is_default)?.code || 'nl'
      const sourceValue = sourceProduct?.content_by_language[sourceDefaultLang]?.[field] || ''
      
      const isChanged = value !== sourceValue
      const fieldKey = `${langCode}.${field}`
      
      const newDirtyFields = new Set(updated[tld].dirtyFields)
      if (isChanged) {
        newDirtyFields.add(fieldKey)
      } else {
        newDirtyFields.delete(fieldKey)
      }
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: {
            ...updated[tld].content_by_language[langCode],
            [field]: value
          }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
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
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(variantIndex)
      } else {
        const variantTitle = variant.content_by_language[activeLanguages[tld] || 'nl']?.title || ''
        const originalTitle = variant.originalTitle?.[activeLanguages[tld] || 'nl'] || ''
        if (variantTitle === originalTitle && variant.sku === variant.originalSku && variant.price_excl === variant.originalPrice) {
          newDirtyVariants.delete(variantIndex)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
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
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(variantIndex)
      } else {
        if (variant.sku === variant.originalSku && variant.price_excl === variant.originalPrice && title === originalTitle) {
          newDirtyVariants.delete(variantIndex)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
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
      
      const targetLanguages = details.shop_languages[tld] || []
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
      newDirtyVariants.add(updated[tld].variants.length)
      
      updated[tld] = {
        ...updated[tld],
        variants: [...updated[tld].variants, newVariant],
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
      
      const newVariants = updated[tld].variants.filter((_, idx) => idx !== variantIndex)
      const newDirtyVariants = new Set(
        Array.from(updated[tld].dirtyVariants)
          .filter(idx => idx < variantIndex)
          .concat(
            Array.from(updated[tld].dirtyVariants)
              .filter(idx => idx > variantIndex)
              .map(idx => idx - 1)
          )
      )
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const moveVariant = (tld: string, fromIndex: number, toIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const [movedVariant] = newVariants.splice(fromIndex, 1)
      newVariants.splice(toIndex, 0, movedVariant)
      
      newVariants.forEach((v, idx) => {
        v.sort_order = idx
      })
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: true
      }
      
      return updated
    })
    setIsDirty(true)
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
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: true
      }
      
      return updated
    })
    setIsDirty(true)
    setShowImageDialog(false)
    setSelectingImageForVariant(null)
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
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0
      }
      
      return updated
    })
  }

  const resetField = (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shop_languages[sourceProduct.shop_tld]?.find(l => l.is_default)?.code || 'nl'
    const sourceValue = sourceProduct.content_by_language[sourceDefaultLang]?.[field]
    
    updateField(tld, langCode, field, sourceValue || '')
  }

  const resetLanguage = (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shop_languages[sourceProduct.shop_tld]?.find(l => l.is_default)?.code || 'nl'
    
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
          [langCode]: { ...sourceProduct.content_by_language[sourceDefaultLang] }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
        dirtyFields: newDirtyFields
      }
      
      return updated
    })
  }

  const resetVariant = (tld: string, variantIndex: number) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shop_languages[sourceProduct.shop_tld]?.find(l => l.is_default)?.code || 'nl'
    const targetLanguages = details.shop_languages[tld] || []
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const sourceVariant = sourceProduct.variants[variantIndex]
      if (!sourceVariant) return prev
      
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...sourceVariant,
        originalSku: sourceVariant.sku,
        originalPrice: sourceVariant.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            sourceVariant.content_by_language[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceVariant.content_by_language[sourceDefaultLang]?.title || '' }
          ])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(variantIndex)
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0,
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
  }

  const resetAllVariants = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shop_languages[sourceProduct.shop_tld]?.find(l => l.is_default)?.code || 'nl'
    const targetLanguages = details.shop_languages[tld] || []
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = sourceProduct.variants.map(v => ({
        ...v,
        originalSku: v.sku,
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language[sourceDefaultLang]?.title || '' }
          ])
        )
      }))
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageIds.size > 0,
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

  const handleCreateProduct = () => {
    console.log('Create product in shop:', activeTargetTld)
    console.log('Data:', targetData[activeTargetTld])
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Button variant="outline" onClick={navigateBack} className="cursor-pointer min-h-[44px] sm:min-h-0 touch-manipulation">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <Card className="border-destructive/50">
            <CardContent className="flex items-center justify-center py-8 sm:py-12 px-4 text-destructive text-sm sm:text-base">
              {error || 'Product not found'}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId) || details.source[0]
  const hasSourceDuplicates = details.source.length > 1
  const sortedTargetTlds = selectedTargetShops.sort((a, b) => a.localeCompare(b))
  const hasMultipleTargets = sortedTargetTlds.length > 1

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
            <AlertDialogAction onClick={navigateBack} className="bg-destructive hover:bg-destructive/90">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasMultipleTargets ? (
        <Tabs value={activeTargetTld} onValueChange={setActiveTargetTld} className="w-full min-w-0">
          <div className="w-full p-4 sm:p-6">
            <div className="flex flex-row items-center flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
              <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[40px] sm:min-h-0 touch-manipulation shrink-0">
                <ArrowLeft className="h-4 w-4 mr-1.5 sm:mr-2" />
                <span className="hidden sm:inline">Back to List</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
                Preview Create - SKU: <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono">{sku}</code>
              </div>
              {hasMultipleTargets && (
                <div className="ml-auto shrink-0">
                  <TabsList className="flex gap-0.5 sm:gap-1 border border-border rounded-md p-0.5 sm:p-1.5 md:p-2 bg-muted/50 h-auto">
                    {sortedTargetTlds.map(tld => (
                      <TabsTrigger
                        key={tld}
                        value={tld}
                        className="cursor-pointer rounded-md px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-xs sm:text-sm md:text-base font-medium transition-all duration-200 ease-out min-h-[36px] sm:min-h-[40px] md:min-h-[44px] touch-manipulation data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm hover:data-[state=active]:bg-red-700 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground/80"
                      >
                        .{tld}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
              <div>
                <SourcePanel
                  product={sourceProduct}
                  languages={details.shop_languages[sourceProduct.shop_tld] || []}
                  hasDuplicates={hasSourceDuplicates}
                  allProducts={details.source}
                  selectedProductId={selectedSourceProductId}
                  onProductSelect={setSelectedSourceProductId}
                  productImages={productImages[sourceProduct.shop_tld] || []}
                />
              </div>

              {sortedTargetTlds.map(tld => (
                <TabsContent key={tld} value={tld} className="mt-0">
                  <TargetPanel
                    shopTld={tld}
                    shopName={details.targets[tld]?.[0]?.shop_name || tld}
                    baseUrl={details.targets[tld]?.[0]?.base_url || ''}
                    languages={details.shop_languages[tld] || []}
                    data={targetData[tld]}
                    productImages={productImages[sourceProduct.shop_tld] || []}
                    activeLanguage={activeLanguages[tld] || ''}
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
                      setShowImageDialog(true)
                    }}
                    onRemoveImage={(imgId) => removeImage(tld, imgId)}
                    onRestoreImage={(imgId) => restoreImage(tld, imgId)}
                  />
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      ) : (
        <div className="w-full p-4 sm:p-6">
          <div className="flex flex-row items-center flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
            <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[40px] sm:min-h-0 touch-manipulation shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Back to List</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
              Preview Create - SKU: <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono">{sku}</code>
            </div>
          </div>
          <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
            <SourcePanel
              product={sourceProduct}
              languages={details.shop_languages[sourceProduct.shop_tld] || []}
              hasDuplicates={hasSourceDuplicates}
              allProducts={details.source}
              selectedProductId={selectedSourceProductId}
              onProductSelect={setSelectedSourceProductId}
              productImages={productImages[sourceProduct.shop_tld] || []}
            />
            <TargetPanel
              shopTld={sortedTargetTlds[0]}
              shopName={details.targets[sortedTargetTlds[0]]?.[0]?.shop_name || sortedTargetTlds[0]}
              baseUrl={details.targets[sortedTargetTlds[0]]?.[0]?.base_url || ''}
              languages={details.shop_languages[sortedTargetTlds[0]] || []}
              data={targetData[sortedTargetTlds[0]]}
              productImages={productImages[sourceProduct.shop_tld] || []}
              activeLanguage={activeLanguages[sortedTargetTlds[0]] || ''}
              onLanguageChange={(lang) => setActiveLanguages(prev => ({ ...prev, [sortedTargetTlds[0]]: lang }))}
              onUpdateField={(lang, field, value) => updateField(sortedTargetTlds[0], lang, field, value)}
              onResetField={(lang, field) => resetField(sortedTargetTlds[0], lang, field)}
              onResetLanguage={(lang) => resetLanguage(sortedTargetTlds[0], lang)}
              onResetShop={() => resetShop(sortedTargetTlds[0])}
              onUpdateVariant={(idx, field, val) => updateVariant(sortedTargetTlds[0], idx, field, val)}
              onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(sortedTargetTlds[0], idx, lang, title)}
              onAddVariant={() => addVariant(sortedTargetTlds[0])}
              onRemoveVariant={(idx) => removeVariant(sortedTargetTlds[0], idx)}
              onMoveVariant={(from, to) => moveVariant(sortedTargetTlds[0], from, to)}
              onResetVariant={(idx) => resetVariant(sortedTargetTlds[0], idx)}
              onResetAllVariants={() => resetAllVariants(sortedTargetTlds[0])}
              onSelectVariantImage={(idx) => {
                setSelectingImageForVariant(idx)
                setShowImageDialog(true)
              }}
              onRemoveImage={(imgId) => removeImage(sortedTargetTlds[0], imgId)}
              onRestoreImage={(imgId) => restoreImage(sortedTargetTlds[0], imgId)}
            />
          </div>
        </div>
      )}

      {/* Image Selection Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Variant Image</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
            <div
              onClick={() => selectVariantImage(activeTargetTld, selectingImageForVariant!, null)}
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
                onClick={() => selectVariantImage(activeTargetTld, selectingImageForVariant!, img)}
                className="aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary cursor-pointer transition-colors"
              >
                <img src={img.thumb || img.src} alt={img.title || ''} className="w-full h-full object-cover" />
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

// Source Panel Component (Read-only matching SKU page multi-panel layout)
function SourcePanel({ 
  product, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect,
  productImages
}: {
  product: ProductData
  languages: Language[]
  hasDuplicates: boolean
  allProducts: ProductData[]
  selectedProductId: number | null
  onProductSelect: (id: number) => void
  productImages: ProductImage[]
}) {
  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  const imageUrl = product.product_image?.src || product.product_image?.thumb
  const defaultVariant = product.variants.find(v => v.is_default) || product.variants[0]
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  const duplicateSelector = hasDuplicates && (
    <div className="mt-2 sm:mt-3 min-w-0 overflow-hidden">
      <Select value={selectedProductId?.toString() || ''} onValueChange={(val) => onProductSelect(parseInt(val))}>
        <SelectTrigger className="w-full max-w-full cursor-pointer h-9 sm:h-10 min-h-[40px] sm:min-h-0 touch-manipulation min-w-0">
          <SelectValue placeholder="Select product..." />
        </SelectTrigger>
        <SelectContent align="start" className="max-w-[calc(100vw-2rem)]" sideOffset={4} collisionPadding={16}>
          {allProducts.map((p) => {
            const content = p.content_by_language[defaultLanguage]
            return (
              <SelectItem key={p.product_id} value={p.product_id.toString()} className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm min-w-0 overflow-hidden">
                  <span className="font-mono text-xs shrink-0">{p.product_id}</span>
                  <span className="text-xs shrink-0">-</span>
                  <span className="truncate min-w-0">{content?.title || 'Untitled'}</span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        {allProducts.length} duplicate source products with this SKU
      </p>
    </div>
  )

  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                  {product.shop_name}
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{product.shop_tld}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Source</Badge>
              {productAdminUrl && (
                <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium cursor-pointer">
                  <ExternalLink className="h-3 w-3" />
                  Product #{product.product_id}
                </a>
              )}
            </div>
          </div>
        </div>
        {duplicateSelector}
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt={product.content_by_language[defaultLanguage]?.title || 'Product'} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Visibility</span>
              <div className="flex items-center gap-1 sm:gap-1.5">
                {(() => {
                  const vis = getVisibilityOption(product.visibility)
                  return <><vis.Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${vis.iconClassName}`} /><span className={`font-medium ${vis.labelClassName || vis.iconClassName}`}>{vis.label}</span></>
                })()}
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Price</span>
              <div className="font-medium">€{defaultVariant?.price_excl?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Variants</span>
              <div className="font-medium">{product.variant_count}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Created</span>
              <div className="font-medium">
                {new Date(product.ls_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {sortedLanguages.length > 0 && (
          <div className="border-t border-border/50 pt-3 sm:pt-4">
            <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
              <TabsList className="flex w-full mb-2 sm:mb-3 h-9 sm:h-10 p-0.5 sm:p-1 items-stretch gap-0">
                {sortedLanguages.map(lang => (
                  <TabsTrigger 
                    key={lang.code} 
                    value={lang.code}
                    className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 py-2 px-2 sm:px-3 touch-manipulation flex items-center justify-center gap-1 h-full"
                  >
                    <span className="inline-flex items-center gap-1">
                      {lang.code}
                      {lang.is_default && <span className="leading-none">★</span>}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {sortedLanguages.map(lang => {
                const content = product.content_by_language[lang.code] || {}
                return (
                  <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                    {content.url && (
                      <div className="min-w-0 overflow-hidden">
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Slug:</label>
                        <div className="text-sm font-semibold font-mono truncate" title={content.url}>
                          {shopUrl ? (
                            <a
                              href={`${shopUrl.replace(/\/$/, '')}${!lang.is_default ? `/${lang.code}` : ''}/${content.url}.html`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 hover:underline truncate block cursor-pointer"
                            >
                              {content.url}
                            </a>
                          ) : (
                            <span className="truncate block">{content.url}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {content.title && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Title:</label>
                        <div className="text-sm leading-snug break-words">{content.title}</div>
                      </div>
                    )}

                    {content.fulltitle && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Full Title:</label>
                        <div className="text-sm break-words">{content.fulltitle}</div>
                      </div>
                    )}

                    {content.description && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Description:</label>
                        <div className="text-sm text-muted-foreground break-words whitespace-pre-wrap">{content.description}</div>
                      </div>
                    )}

                    {content.content && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Content:</label>
                        <div className="text-sm sm:text-base break-words max-h-[20rem] sm:max-h-[28rem] overflow-y-auto border border-border/40 rounded-lg p-3 sm:p-4 bg-muted/30">
                          <div 
                            dangerouslySetInnerHTML={{ __html: content.content }} 
                            className="prose prose-base max-w-none [&>:first-child]:mt-0 prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-2 prose-p:text-muted-foreground prose-p:my-2 prose-li:text-muted-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2"
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>
                )
              })}
            </Tabs>
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Variants ({product.variants.length})</h4>
          <div className="space-y-2 sm:space-y-3">
            {[...product.variants].sort((a, b) => {
              const sa = a.sort_order ?? 999999
              const sb = b.sort_order ?? 999999
              if (sa !== sb) return sa - sb
              if (a.is_default && !b.is_default) return -1
              if (!a.is_default && b.is_default) return 1
              return a.variant_id - b.variant_id
            }).map(variant => {
              const variantTitle = variant.content_by_language[activeLanguage]?.title || 'No title'
              const variantImageUrl = variant.image?.thumb || variant.image?.src
              
              return (
                <div key={variant.variant_id} className="flex items-center gap-3 sm:gap-4 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors min-w-0">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    {variantImageUrl ? (
                      <img src={variantImageUrl} alt={variant.sku} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 rounded font-mono truncate max-w-full">{variant.sku}</code>
                      {variant.is_default && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400 shrink-0">
                          Default
                        </Badge>
                      )}
                      <span className="text-xs sm:text-sm font-semibold ml-auto shrink-0">€{variant.price_excl?.toFixed(2)}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-none">{variantTitle}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {productImages.length > 0 && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {productImages.map(img => (
                  <div key={img.id} className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                    <img src={img.thumb || img.src} alt={img.title || ''} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Target Panel Component (Editable - matching SKU page layout)
function TargetPanel({
  shopTld,
  shopName,
  baseUrl,
  languages,
  data,
  productImages,
  activeLanguage,
  onLanguageChange,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onResetShop,
  onUpdateVariant,
  onUpdateVariantTitle,
  onAddVariant,
  onRemoveVariant,
  onMoveVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage,
  onRemoveImage,
  onRestoreImage
}: {
  shopTld: string
  shopName: string
  baseUrl: string
  languages: Language[]
  data: EditableTargetData | undefined
  productImages: ProductImage[]
  activeLanguage: string
  onLanguageChange: (lang: string) => void
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onResetShop: () => void
  onUpdateVariant: (idx: number, field: 'sku' | 'price_excl', value: string | number) => void
  onUpdateVariantTitle: (idx: number, lang: string, title: string) => void
  onAddVariant: () => void
  onRemoveVariant: (idx: number) => void
  onMoveVariant: (fromIdx: number, toIdx: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
  onRemoveImage: (imgId: string) => void
  onRestoreImage: (imgId: string) => void
}) {
  if (!data) return null

  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const content = data.content_by_language[activeLanguage] || {}
  const hasLanguageChanges = Array.from(data.dirtyFields).some(f => f.startsWith(`${activeLanguage}.`))
  const shopUrl = toSafeExternalHref(baseUrl)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    
    onMoveVariant(draggedIndex, index)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const availableImages = productImages.filter(img => !data.removedImageIds.has(img.id))

  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                  {shopName}
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{shopName}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{shopTld}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Target</Badge>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onResetShop}
          className="text-xs w-fit cursor-pointer"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset Shop
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Variants</span>
              <div className="font-medium">{data.variants.length}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Images</span>
              <div className="font-medium">{availableImages.length}</div>
            </div>
          </div>
        </div>

        {sortedLanguages.length > 0 && (
          <div className="border-t border-border/50 pt-3 sm:pt-4">
            <Tabs value={activeLanguage} onValueChange={onLanguageChange} className="w-full min-w-0">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <TabsList className="flex-1 h-9 sm:h-10 flex p-0.5 sm:p-1 items-stretch gap-0">
                  {sortedLanguages.map(lang => (
                    <TabsTrigger
                      key={lang.code}
                      value={lang.code}
                      className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 py-2 px-2 sm:px-3 touch-manipulation flex items-center justify-center gap-1 h-full"
                    >
                      <span className="inline-flex items-center gap-1">
                        {lang.code}
                        {lang.is_default && <span className="leading-none">★</span>}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {hasLanguageChanges && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetLanguage(activeLanguage)}
                    className="text-xs ml-2 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
              
              {sortedLanguages.map(lang => (
                <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-bold uppercase">Title</Label>
                      {data.dirtyFields.has(`${lang.code}.title`) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onResetField(lang.code, 'title')}
                          className="h-6 text-xs px-2 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={content.title || ''}
                      onChange={(e) => onUpdateField(lang.code, 'title', e.target.value)}
                      placeholder="Enter product title..."
                      className={cn(
                        "cursor-text",
                        data.dirtyFields.has(`${lang.code}.title`) && 'border-amber-500'
                      )}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-bold uppercase">Full Title</Label>
                      {data.dirtyFields.has(`${lang.code}.fulltitle`) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onResetField(lang.code, 'fulltitle')}
                          className="h-6 text-xs px-2 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={content.fulltitle || ''}
                      onChange={(e) => onUpdateField(lang.code, 'fulltitle', e.target.value)}
                      placeholder="Enter full title..."
                      className={cn(
                        "cursor-text",
                        data.dirtyFields.has(`${lang.code}.fulltitle`) && 'border-amber-500'
                      )}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-bold uppercase">Description</Label>
                      {data.dirtyFields.has(`${lang.code}.description`) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onResetField(lang.code, 'description')}
                          className="h-6 text-xs px-2 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={content.description || ''}
                      onChange={(e) => onUpdateField(lang.code, 'description', e.target.value)}
                      placeholder="Enter description..."
                      className={cn(
                        "cursor-text",
                        data.dirtyFields.has(`${lang.code}.description`) && 'border-amber-500'
                      )}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-bold uppercase">Content (HTML Editor)</Label>
                      {data.dirtyFields.has(`${lang.code}.content`) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onResetField(lang.code, 'content')}
                          className="h-6 text-xs px-2 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className={cn(
                      "rounded-md overflow-hidden border",
                      data.dirtyFields.has(`${lang.code}.content`) ? 'border-amber-500' : 'border-border'
                    )}>
                      <ReactQuill
                        value={content.content || ''}
                        onChange={(value) => onUpdateField(lang.code, 'content', value)}
                        theme="snow"
                        modules={{
                          toolbar: [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            [{ 'color': [] }, { 'background': [] }],
                            ['link', 'image'],
                            ['clean']
                          ],
                        }}
                        className="bg-background [&_.ql-editor]:min-h-[150px] [&_.ql-editor]:max-h-[300px] [&_.ql-editor]:cursor-text"
                      />
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h4 className="text-xs sm:text-sm font-bold uppercase">Variants ({data.variants.length})</h4>
            <div className="flex gap-2">
              {data.dirtyVariants.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onResetAllVariants}
                  className="text-xs cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset All
                </Button>
              )}
              <Button
                size="sm"
                onClick={onAddVariant}
                className="text-xs bg-red-600 hover:bg-red-700 cursor-pointer"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {data.variants.map((variant, idx) => {
              const isChanged = data.dirtyVariants.has(idx)
              return (
                <div
                  key={variant.variant_id || variant.temp_id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-start gap-2 p-2 sm:p-3 rounded-lg border bg-muted/30 transition-all",
                    draggedIndex === idx && "opacity-50",
                    isChanged && "border-amber-500"
                  )}
                >
                  <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 mt-1" />
                  <div
                    onClick={() => onSelectVariantImage(idx)}
                    className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center cursor-pointer border-2 border-dashed border-border hover:border-primary transition-colors"
                  >
                    {variant.image?.thumb || variant.image?.src ? (
                      <img src={variant.image.thumb || variant.image.src} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={variant.sku}
                        onChange={(e) => onUpdateVariant(idx, 'sku', e.target.value)}
                        placeholder="SKU"
                        className="h-8 text-xs flex-1 cursor-text"
                      />
                      <div className="flex items-center gap-1 border rounded-md px-2 bg-background">
                        <span className="text-xs text-muted-foreground">€</span>
                        <Input
                          type="number"
                          value={variant.price_excl}
                          onChange={(e) => onUpdateVariant(idx, 'price_excl', e.target.value)}
                          step="1"
                          placeholder="0"
                          className="w-16 h-6 text-xs border-0 p-0 cursor-text"
                        />
                      </div>
                    </div>
                    <Input
                      value={variant.content_by_language[activeLanguage]?.title || ''}
                      onChange={(e) => onUpdateVariantTitle(idx, activeLanguage, e.target.value)}
                      placeholder="Variant title"
                      className="h-8 text-xs cursor-text"
                    />
                    {variant.is_default && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {isChanged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onResetVariant(idx)}
                        className="h-7 w-7 p-0 cursor-pointer"
                        title="Reset variant"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveVariant(idx)}
                      className="h-7 w-7 p-0 cursor-pointer hover:bg-destructive/10"
                      title="Remove variant"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          {availableImages.length > 0 && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images ({availableImages.length})</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableImages.map(img => (
                  <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
                    <img src={img.thumb || img.src} alt={img.title || ''} className="w-full h-full object-cover" />
                    <button
                      onClick={() => onRemoveImage(img.id)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>
              {data.removedImageIds.size > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">{data.removedImageIds.size} image(s) removed</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      data.removedImageIds.forEach(imgId => onRestoreImage(imgId))
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore All
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
