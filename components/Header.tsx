'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Header() {
  const [userEmail, setUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email || '')
    }
    getUser()
  }, [])

  async function handleLogout() {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img 
              src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32" 
              alt="Lightspeed Logo" 
              className="h-8 w-8"
            />
            <div>
              <h1 className="text-xl font-bold">Lightspeed ShopSync</h1>
              <p className="text-xs text-muted-foreground">Product Sync Tool</p>
            </div>
          </div>
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          {userEmail && (
            <div className="text-sm">
              <div className="text-muted-foreground text-xs">Signed in as</div>
              <div className="font-medium">{userEmail}</div>
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout} 
            disabled={loading}
            className="gap-2 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            {loading ? 'Logging out...' : 'Logout'}
          </Button>
        </div>
      </div>
    </header>
  )
}
