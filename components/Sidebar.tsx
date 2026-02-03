'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, LayoutDashboard, RefreshCw, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed-state'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved !== null) {
        setIsCollapsed(saved === 'true')
      }
    }

    // Get user email
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email || '')
    }
    getUser()
  }, [])

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed))
    }
  }, [isCollapsed, mounted])

  // Sync sidebar state across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SIDEBAR_STORAGE_KEY && e.newValue !== null) {
        setIsCollapsed(e.newValue === 'true')
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  async function handleLogout() {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/login')
    }
    setLoading(false)
  }

  if (!mounted) return null

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/dashboard/sync', icon: RefreshCw, label: 'Sync Status' },
  ]

  return (
    <div className="relative">
      <aside
        className={cn(
          'bg-card border-r border-border transition-all duration-300 ease-in-out flex flex-col h-screen sticky top-0',
          isCollapsed ? 'w-[64px]' : 'w-[250px]'
        )}
      >
        {/* Header with Logo */}
        <div className="flex h-16 items-center justify-center border-b border-border px-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <img 
              src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32" 
              alt="Lightspeed Logo" 
              className="h-8 w-8"
            />
            {!isCollapsed && (
              <span className="text-base whitespace-nowrap">Lightspeed ShopSync</span>
            )}
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            // Exact match for /dashboard, prefix match for others
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
            const Icon = item.icon
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors cursor-pointer',
                  isActive 
                    ? 'bg-primary text-primary-foreground' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  isCollapsed && 'justify-center px-2'
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && (
                  <div className="flex items-center justify-between flex-1 whitespace-nowrap">
                    <span>{item.label}</span>
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-border p-3">
          {!isCollapsed && userEmail && (
            <div className="px-3 py-2 mb-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <User className="h-3 w-3" />
                <span>Signed in as</span>
              </div>
              <div className="text-sm font-medium text-foreground truncate">{userEmail}</div>
            </div>
          )}
          
          <Button
            variant="outline"
            size={isCollapsed ? 'icon' : 'default'}
            onClick={handleLogout}
            disabled={loading}
            className={cn(
              'cursor-pointer w-full hover:bg-red-50 hover:text-red-600 hover:border-red-200',
              isCollapsed ? 'h-10 w-10 p-0' : 'justify-start gap-2 h-11'
            )}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span>{loading ? 'Logging out...' : 'Logout'}</span>}
          </Button>
        </div>
      </aside>

      {/* Desktop Toggle Button - positioned absolutely on the right side */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex fixed top-1/2 -translate-y-1/2 z-[100] h-7 w-7 items-center justify-center rounded-full border bg-card shadow-md transition-all duration-300 hover:bg-primary hover:text-primary-foreground cursor-pointer"
        style={{
          left: isCollapsed ? 'calc(60px - 14px)' : 'calc(250px - 14px)'
        }}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
