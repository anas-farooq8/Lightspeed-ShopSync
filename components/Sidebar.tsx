'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed')
      setIsCollapsed(saved === 'true')
    }
  }, [])

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', String(isCollapsed))
    }
  }, [isCollapsed, mounted])

  if (!mounted) return null

  return (
    <aside
      className={cn(
        'bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col border-r border-slate-800',
        isCollapsed ? 'w-[60px]' : 'w-[250px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        {!isCollapsed && <h1 className="font-semibold text-sm">Navigation</h1>}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 p-0 hover:bg-slate-800"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-2">
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-600 text-white transition-colors cursor-pointer"
          title={isCollapsed ? 'Variants' : ''}
        >
          <Package className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Variants</span>}
        </div>
      </nav>

      {/* Future items (disabled) */}
      <div className="p-3 space-y-2 border-t border-slate-800 pb-4">
        <div className="text-xs text-slate-400 px-3 py-1">
          {!isCollapsed && <span>Coming Soon</span>}
        </div>
        {['Dashboard', 'Sync Logs', 'Settings'].map((item) => (
          <div
            key={item}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 text-sm opacity-50 cursor-not-allowed"
            title={isCollapsed ? item : ''}
          >
            <div className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span>{item}</span>}
          </div>
        ))}
      </div>
    </aside>
  )
}
