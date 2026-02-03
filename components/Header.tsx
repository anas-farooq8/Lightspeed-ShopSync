'use client'

import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UserInterface {
  email?: string
}

export function Header() {
  const [user, setUser] = useState<UserInterface | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user || null)
    }
    getUser()
  }, [])

  async function handleLogout() {
    setLoading(true)
    const { error } = await signOut()
    if (!error) {
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-900">Lightspeed Sync Tool</h1>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-slate-700">
            <LogOut className="h-4 w-4" />
            <span className="text-sm">{user.email}</span>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={handleLogout} disabled={loading}>
          <LogOut className="h-4 w-4 mr-2" />
          {loading ? 'Logging out...' : 'Logout'}
        </Button>
      </div>
    </header>
  )
}
