'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, LayoutDashboard, RefreshCw, LogOut, User, ArrowLeftRight, Menu, X, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed-state'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
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
  }, [])

  // Get user email separately to avoid triggering re-renders during initial mount
  useEffect(() => {
    if (!mounted) return

    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email || '')
    }
    getUser()
  }, [mounted, supabase.auth])

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

  // Close mobile drawer on route change (navigation)
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

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
    { href: '/dashboard/sync-operations', icon: ArrowLeftRight, label: 'Sync Operations' },
    { href: '/dashboard/product-sync-logs', icon: FileText, label: 'Product Sync Logs' },
    { href: '/dashboard/sync-logs', icon: RefreshCw, label: 'Shop Sync Logs' },
  ]

  const showLabels = !isCollapsed

  return (
    <div className="flex flex-col w-full md:contents md:w-auto shrink-0">
      {/* Mobile: Top header bar - integrated, not floating */}
      <header
        className={cn(
          'md:hidden flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4',
          'pt-[env(safe-area-inset-top,0px)]'
        )}
      >
        <button
          onClick={() => setIsMobileOpen(true)}
          className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer touch-manipulation -ml-1"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/dashboard"
          prefetch={false}
          className="flex items-center gap-2 font-semibold min-w-0 flex-1"
        >
          <img
            src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32"
            alt=""
            className="h-6 w-6 shrink-0"
          />
          <span className="text-sm font-medium truncate">Lightspeed ShopSync</span>
        </Link>
      </header>

      {/* Mobile: Overlay when drawer is open */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out',
          // Mobile: fixed drawer, slides in from left
          'fixed left-0 top-0 z-50 h-full w-[260px] max-w-[80vw]',
          'md:relative md:z-auto md:h-screen md:max-w-none',
          'md:sticky md:top-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
          // Desktop width
          isCollapsed ? 'md:w-[64px]' : 'md:w-[250px]'
        )}
      >
        {/* Header with Logo + Mobile close button */}
        <div className="flex h-14 sm:h-16 items-center justify-between border-b border-border px-3 gap-2">
          <Link
            href="/dashboard"
            prefetch={false}
            className="flex items-center gap-2 font-semibold min-w-0 flex-1"
            onClick={() => setIsMobileOpen(false)}
          >
            <img
              src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32"
              alt="Lightspeed Logo"
              className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
            />
            {showLabels && (
              <span className="text-sm sm:text-base whitespace-nowrap truncate">
                Lightspeed ShopSync
              </span>
            )}
          </Link>
          {/* Mobile: Close button */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="md:hidden h-9 w-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer touch-manipulation shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 px-2 sm:px-3 py-3 sm:py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-sm sm:text-[15px] font-medium transition-colors cursor-pointer min-h-[44px] touch-manipulation',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  isCollapsed && 'md:justify-center md:px-2'
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {showLabels && (
                  <div className="flex items-center justify-between flex-1 whitespace-nowrap min-w-0">
                    <span className="truncate">{item.label}</span>
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-border p-2 sm:p-3 shrink-0">
          {showLabels && userEmail && (
            <div className="px-3 py-2 mb-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <User className="h-3 w-3 shrink-0" />
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
              'cursor-pointer w-full hover:bg-red-50 hover:text-red-600 hover:border-red-200 min-h-[44px] touch-manipulation',
              isCollapsed ? 'h-10 w-10 p-0 md:h-10 md:w-10' : 'justify-start gap-2 h-11'
            )}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {showLabels && <span className="truncate">{loading ? 'Logging out...' : 'Logout'}</span>}
          </Button>
        </div>
      </aside>

      {/* Desktop: Collapse/Expand toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex fixed top-1/2 -translate-y-1/2 z-[100] h-7 w-7 items-center justify-center rounded-full border bg-card shadow-md transition-all duration-300 hover:bg-primary hover:text-primary-foreground cursor-pointer"
        style={{
          left: isCollapsed ? 'calc(60px - 14px)' : 'calc(250px - 14px)',
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
