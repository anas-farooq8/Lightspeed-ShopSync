import { NextResponse } from 'next/server'
import { HTTP_STATUS } from './constants'

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

  const body: Record<string, unknown> = {
    error: publicMessage,
  }

  if (includeErrorMessage) {
    body.message = error instanceof Error ? error.message : 'Unknown error'
  }

  return NextResponse.json(body, {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  })
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json(
    { error: message },
    { status: HTTP_STATUS.UNAUTHORIZED }
  )
}

