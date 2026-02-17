import { createClient } from '@/lib/supabase/server'
import { unauthorized } from './errors'

export type RequireUserResult =
  | {
      supabase: any
      user: any
    }
  | {
      response: Response
    }

export function isRequireUserFailure(
  result: RequireUserResult
): result is { response: Response } {
  return 'response' in result
}

/**
 * Ensures the request has an authenticated Supabase user.
 * Returns either `{ supabase, user }` or `{ response }` (an unauthorized response).
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { response: unauthorized() }
  }

  return { supabase, user }
}

