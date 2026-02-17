/**
 * Shared API helpers: constants, error handling, auth.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Constants ──────────────────────────────────────────────────────────────

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const

// ─── Error helpers ──────────────────────────────────────────────────────────

interface HandleRouteErrorOptions {
  logMessage?: string
  includeErrorMessage?: boolean
  publicMessage?: string
}

export function handleRouteError(
  error: unknown,
  {
    logMessage = '[API] Unexpected error:',
    includeErrorMessage = false,
    publicMessage = 'Internal server error',
  }: HandleRouteErrorOptions = {}
) {
  console.error(logMessage, error)

  const body: Record<string, unknown> = { error: publicMessage }
  if (includeErrorMessage) {
    body.message = error instanceof Error ? error.message : 'Unknown error'
  }

  return NextResponse.json(body, { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: HTTP_STATUS.UNAUTHORIZED })
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export type RequireUserResult =
  | { supabase: any; user: any }
  | { response: Response }

export function isRequireUserFailure(result: RequireUserResult): result is { response: Response } {
  return 'response' in result
}

export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { response: unauthorized() }
  }

  return { supabase, user }
}
