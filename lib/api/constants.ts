import { type NextRequest } from 'next/server'

/**
 * Shared API constants and common request types.
 */
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]

// Shared value for Next.js dynamic route config to avoid magic strings
export const FORCE_DYNAMIC = 'force-dynamic' as const

export type ApiRequest = NextRequest

