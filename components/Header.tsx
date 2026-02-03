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
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-900">Lightspeed Sync Tool</h1>

      <div className="flex items-center gap-4">
        {userEmail && (
          <span className="text-sm text-slate-700">{userEmail}</span>
        )}
        <Button variant="outline" size="sm" onClick={handleLogout} disabled={loading}>
          <LogOut className="h-4 w-4 mr-2" />
          {loading ? 'Logging out...' : 'Logout'}
        </Button>
      </div>
    </header>
  )
}
