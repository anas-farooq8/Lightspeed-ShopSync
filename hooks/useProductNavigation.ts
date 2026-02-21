import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function useProductNavigation() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [navigating, setNavigating] = useState(false)

  const navigateBack = useCallback((defaultTab: string = 'create') => {
    setNavigating(true)

    // Read from actual URL at navigation time to avoid stale params
    const currentSearch = typeof window !== 'undefined' ? window.location.search : ''
    const urlParams = new URLSearchParams(currentSearch || searchParams.toString())

    const params = new URLSearchParams()
    const tab = urlParams.get('tab') || defaultTab
    const search = urlParams.get('search')
    const page = urlParams.get('page')
    const missingIn = urlParams.get('missingIn')
    const existsIn = urlParams.get('existsIn')
    const onlyDuplicates = urlParams.get('onlyDuplicates')
    const shopFilter = urlParams.get('shopFilter')
    const sortBy = urlParams.get('sortBy')
    const sortOrder = urlParams.get('sortOrder')

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
  }, [searchParams, router])

  return {
    navigating,
    navigateBack
  }
}
