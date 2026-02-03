"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'not_admin') {
      setError('Access denied: You are not authorized to access this dashboard. Please contact an administrator.')
      setLoading(false) // Reset loading state to allow user to try again
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Client-side validation
    if (!email.trim()) {
      setError("Please enter your email address")
      return
    }
    
    if (!password) {
      setError("Please enter your password")
      return
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        // Provide user-friendly error messages
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please try again.")
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please verify your email address before logging in.")
        } else {
          setError(signInError.message)
        }
        setLoading(false)
        return
      }

      if (data.session) {
        // Success - user is authenticated AND authorized
        router.push("/dashboard")
        router.refresh()
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
      console.error("Login error:", err)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 py-4 sm:px-4 sm:py-6 bg-gradient-to-br from-rose-50 via-pink-50 to-red-50">
      <Card className="w-full max-w-[380px] sm:max-w-[480px] shadow-lg border-border/50 backdrop-blur-sm">
        <CardHeader className="space-y-2 sm:space-y-3 pb-3 sm:pb-5 px-4 sm:px-7 pt-4 sm:pt-7">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 mb-0.5 sm:mb-2">
            <img 
              src="https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=64" 
              alt="Lightspeed Logo" 
              className="h-7 w-7 sm:h-10 sm:w-10"
            />
            <span className="text-base sm:text-xl font-bold leading-tight">Lightspeed ShopSync</span>
          </div>
          <CardTitle className="text-lg sm:text-2xl text-center font-semibold">Welcome Back</CardTitle>
          <CardDescription className="text-center text-xs sm:text-base leading-relaxed px-1">
            Sign in to your Lightspeed dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4 sm:pb-6 px-4 sm:px-7">
          <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-5">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in-50 text-xs sm:text-sm py-2">
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <AlertDescription className="text-xs sm:text-sm leading-relaxed">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="email" className="text-xs sm:text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null) // Clear error on input change
                }}
                required
                disabled={loading}
                autoComplete="email"
                className="h-9 sm:h-11 text-sm px-3 focus-visible:ring-1 focus-visible:ring-red-400 focus-visible:border-red-300"
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="password" className="text-xs sm:text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError(null) // Clear error on input change
                  }}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className="h-9 sm:h-11 pr-10 text-sm px-3 focus-visible:ring-1 focus-visible:ring-red-400 focus-visible:border-red-300"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer p-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-9 sm:h-11 text-sm font-medium cursor-pointer mt-4 sm:mt-6 touch-manipulation bg-red-500 hover:bg-red-600 text-white" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center px-3 py-4 sm:px-4 sm:py-6 bg-gradient-to-br from-rose-50 via-pink-50 to-red-50">
        <Card className="w-full max-w-[380px] sm:max-w-[480px] shadow-lg border-border/50 backdrop-blur-sm">
          <CardContent className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
