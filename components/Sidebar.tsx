'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, LayoutDashboard, RefreshCw, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed')
      setIsCollapsed(saved === 'true')
    }

    // Get user email
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email || '')
    }
    getUser()
  }, [])

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', String(isCollapsed))
    }
  }, [isCollapsed, mounted])

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
    <aside
      className={cn(
        'bg-card border-r border-border transition-all duration-300 ease-in-out flex flex-col h-screen sticky top-0',
        isCollapsed ? 'w-[60px]' : 'w-[250px]'
      )}
    >
      {/* Header with Logo */}
      <div className="flex items-center gap-2 p-4 border-b border-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2 flex-1">
            <img 
              src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32" 
              alt="Lightspeed Logo" 
              className="h-6 w-6"
            />
            <div className="flex-1">
              <h1 className="text-sm font-bold text-foreground">Lightspeed ShopSync</h1>
              <p className="text-[10px] text-muted-foreground">Sync Tool</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 p-0 cursor-pointer hover:bg-accent"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer',
                isActive 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              title={isCollapsed ? item.label : ''}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-3 border-t border-border space-y-2">
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
            'cursor-pointer w-full',
            isCollapsed ? 'h-10 w-10 p-0' : 'justify-start gap-2 h-11'
          )}
          title={isCollapsed ? 'Logout' : ''}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span>{loading ? 'Logging out...' : 'Logout'}</span>}
        </Button>
      </div>
    </aside>
  )
}
