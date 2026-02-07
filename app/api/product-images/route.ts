import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const FIELDS = 'id,sortOrder,title,thumb,src'

/**
 * Fetches product images from Lightspeed API using images_link.
 * Uses Basic Auth with LIGHTSPEED_API_KEY_{TLD} and LIGHTSPEED_API_SECRET_{TLD}.
 *
 * Query Parameters:
 * - link: The images API URL (images_link from product)
 * - shopTld: Shop TLD for credentials (nl, de, be)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const link = searchParams.get('link')
    const shopTld = searchParams.get('shopTld')

    if (!link || !shopTld) {
      return NextResponse.json(
        { error: 'Missing link or shopTld parameter' },
        { status: 400 }
      )
    }

    const tld = shopTld.toUpperCase()
    const apiKey = process.env[`LIGHTSPEED_API_KEY_${tld}`]
    const apiSecret = process.env[`LIGHTSPEED_API_SECRET_${tld}`]

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: `Missing API credentials for shop TLD=${shopTld}` },
        { status: 500 }
      )
    }

    const url = new URL(link)
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
    console.error('Product images fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
