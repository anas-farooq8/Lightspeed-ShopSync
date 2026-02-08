import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function useProductNavigation() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [navigating, setNavigating] = useState(false)

  const navigateBack = (defaultTab: string = 'create') => {
    setNavigating(true)
    const params = new URLSearchParams()
    
    const tab = searchParams.get('tab') || defaultTab
    const search = searchParams.get('search')
    const page = searchParams.get('page')
    const missingIn = searchParams.get('missingIn')
    const existsIn = searchParams.get('existsIn')
    const onlyDuplicates = searchParams.get('onlyDuplicates')
    const shopFilter = searchParams.get('shopFilter')
    const sortBy = searchParams.get('sortBy')
    const sortOrder = searchParams.get('sortOrder')
    
    params.set('tab', tab)
    if (search) params.set('search', search)
    if (page) params.set('page', page)
    if (missingIn) params.set('missingIn', missingIn)
    if (existsIn) params.set('existsIn', existsIn)
    if (onlyDuplicates) params.set('onlyDuplicates', onlyDuplicates)
    if (shopFilter) params.set('shopFilter', shopFilter)
    if (sortBy) params.set('sortBy', sortBy)
    if (sortOrder) params.set('sortOrder', sortOrder)
    
    const queryString = params.toString()
    router.push(`/dashboard/sync-operations${queryString ? `?${queryString}` : ''}`, { scroll: false })
  }

  return {
    navigating,
    navigateBack
  }
}
