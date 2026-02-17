import { NextRequest, NextResponse } from 'next/server'
import { FORCE_DYNAMIC, HTTP_STATUS } from '@/lib/api/constants'
import { handleRouteError } from '@/lib/api/errors'

export const dynamic = FORCE_DYNAMIC

const FIELDS = 'id,sortOrder,title,thumb,src'

/**
 * Product Images API
 *
 * Method: GET
 * Path: /api/product-images
 *
 * Description:
 * - Fetches product images from the Lightspeed API using the product's `images_link` URL.
 * - Uses Basic Auth credentials per shop TLD.
 *
 * Auth:
 * - Not required (uses shop-level API credentials).
 *
 * Query parameters:
 * - link: Images API URL (product `images_link`).
 * - shopTld: Shop TLD (e.g. "nl", "de", "be") to select credentials.
 *
 * Responses:
 * - 200: Array of product image records.
 * - 400: Missing or invalid query parameters.
 * - 500: Internal server error or Lightspeed API failure.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const link = searchParams.get('link')
    const shopTld = searchParams.get('shopTld')

    if (!link || !shopTld) {
      return NextResponse.json(
        { error: 'Missing link or shopTld parameter' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    let url: URL
    try {
      url = new URL(link)
    } catch {
      return NextResponse.json(
        { error: 'Invalid link URL' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    const tld = shopTld.toUpperCase()
    const apiKey = process.env[`LIGHTSPEED_API_KEY_${tld}`]
    const apiSecret = process.env[`LIGHTSPEED_API_SECRET_${tld}`]

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: `Missing API credentials for shop TLD=${shopTld}` },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    url.searchParams.set('fields', FIELDS)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Lightspeed images API error:', response.status, text)
      return NextResponse.json(
        { error: 'Failed to fetch product images', details: text },
        { status: response.status }
      )
    }

    const json = await response.json()
    const productImages = json.productImages ?? []

    return NextResponse.json(productImages)
  } catch (error) {
    return handleRouteError(error, {
      logMessage: 'Product images fetch error:',
    })
  }
}
