/**
 * Lightspeed eCom API Client
 *
 * Handles all API requests to Lightspeed eCom API
 * Base URL: https://api.webshopapp.com/{language}/
 * Authentication: HTTP Basic Auth (API key + secret)
 */

export const LIGHTSPEED_API_BASE = 'https://api.webshopapp.com'

import type {
  LightspeedConfig,
  CreateProductPayload,
  UpdateProductPayload,
  CreateVariantPayload,
  UpdateVariantPayload,
  CreateProductImagePayload,
  UpdateProductImagePayload,
  LightspeedProduct,
  LightspeedVariant,
  LightspeedProductImage
} from '@/types/lightspeed-api'

export class LightspeedAPIClient {
  private config: LightspeedConfig
  private baseUrl = LIGHTSPEED_API_BASE

  constructor(config: LightspeedConfig) {
    this.config = config
  }

  /**
   * Get Basic Auth header
   */
  private getAuthHeader(): string {
    const credentials = `${this.config.apiKey}:${this.config.apiSecret}`
    return `Basic ${Buffer.from(credentials).toString('base64')}`
  }

  /**
   * Make authenticated request to Lightspeed API
   */
  private async request<T>(
    endpoint: string,
    method: 'POST' | 'PUT',
    body?: any,
    language?: string
  ): Promise<T> {
    if (!language) {
      throw new Error('Language code is required for API requests')
    }

    const url = `${this.baseUrl}/${language}${endpoint}`

    const headers: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Lightspeed API error (${response.status}): ${errorText}`
        )
      }

      return await response.json()
    } catch (error) {
      console.error(`Lightspeed API request failed: ${method} ${url}`, error)
      throw error
    }
  }

  /**
   * Make authenticated DELETE request (returns void, 204 No Content)
   */
  private async requestDelete(
    endpoint: string,
    language: string
  ): Promise<void> {
    if (!language) {
      throw new Error('Language code is required for API requests')
    }

    const url = `${this.baseUrl}/${language}${endpoint}`

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Lightspeed API error (${response.status}): ${errorText}`
      )
    }
  }

  /**
   * Create a new product
   */
  async createProduct(
    payload: CreateProductPayload,
    language: string
  ): Promise<{ product: LightspeedProduct }> {
    return this.request<{ product: LightspeedProduct }>(
      '/products.json',
      'POST',
      payload,
      language
    )
  }

  /**
   * Update an existing product
   */
  async updateProduct(
    productId: number,
    payload: UpdateProductPayload,
    language: string
  ): Promise<{ product: LightspeedProduct }> {
    return this.request<{ product: LightspeedProduct }>(
      `/products/${productId}.json`,
      'PUT',
      payload,
      language
    )
  }

  /**
   * Get a single product by ID (includes product.image for main product image)
   */
  async getProduct(productId: number, language: string): Promise<{ product: LightspeedProduct }> {
    const response = await fetch(
      `${this.baseUrl}/${language}/products/${productId}.json`,
      {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Lightspeed API error (${response.status}): ${errorText}`)
    }

    const json = await response.json()
    // API may return { product: {...} } or [{ product: {...} }]
    const product = Array.isArray(json) ? json[0]?.product : json?.product
    if (!product) {
      throw new Error(`Invalid product response for id ${productId}`)
    }
    return { product }
  }

  /**
   * Get variants for a product
   */
  async getVariants(productId: number, language: string): Promise<{ variants: LightspeedVariant[] }> {
    const url = `${this.baseUrl}/${language}/variants.json?product=${productId}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Lightspeed API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  /**
   * Create a new variant
   */
  async createVariant(
    payload: CreateVariantPayload,
    language: string
  ): Promise<{ variant: LightspeedVariant }> {
    return this.request<{ variant: LightspeedVariant }>(
      '/variants.json',
      'POST',
      payload,
      language
    )
  }

  /**
   * Update an existing variant
   */
  async updateVariant(
    variantId: number,
    payload: UpdateVariantPayload,
    language: string
  ): Promise<{ variant: LightspeedVariant }> {
    return this.request<{ variant: LightspeedVariant }>(
      `/variants/${variantId}.json`,
      'PUT',
      payload,
      language
    )
  }

  /**
   * Create a product image
   */
  async createProductImage(
    productId: number,
    payload: CreateProductImagePayload,
    language: string
  ): Promise<{ productImage: LightspeedProductImage }> {
    return this.request<{ productImage: LightspeedProductImage }>(
      `/products/${productId}/images.json`,
      'POST',
      payload,
      language
    )
  }

  /**
   * Update product image sortOrder
   */
  async updateProductImage(
    productId: number,
    imageId: number,
    payload: UpdateProductImagePayload,
    language: string
  ): Promise<{ productImage: LightspeedProductImage }> {
    return this.request<{ productImage: LightspeedProductImage }>(
      `/products/${productId}/images/${imageId}.json`,
      'PUT',
      payload,
      language
    )
  }

  /**
   * Delete a product image
   */
  async deleteProductImage(
    productId: number,
    imageId: number,
    language: string
  ): Promise<void> {
    return this.requestDelete(
      `/products/${productId}/images/${imageId}.json`,
      language
    )
  }

  /**
   * Delete a variant
   */
  async deleteVariant(variantId: number, language: string): Promise<void> {
    return this.requestDelete(`/variants/${variantId}.json`, language)
  }

  /**
   * Get product images from Lightspeed
   */
  async getProductImages(
    productId: number,
    language: string
  ): Promise<LightspeedProductImage[]> {
    const response = await fetch(
      `${this.baseUrl}/${language}/products/${productId}/images.json?fields=id,sortOrder,title,thumb,src`,
      {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Lightspeed API error (${response.status}): ${errorText}`)
    }

    const json = await response.json()
    return json.productImages ?? []
  }
}

/**
 * Get Lightspeed API client for a specific shop
 */
export function getLightspeedClient(shopTld: string): LightspeedAPIClient {
  const apiKey = process.env[`LIGHTSPEED_API_KEY_${shopTld.toUpperCase()}`]
  const apiSecret = process.env[`LIGHTSPEED_API_SECRET_${shopTld.toUpperCase()}`]

  if (!apiKey || !apiSecret) {
    throw new Error(
      `Missing Lightspeed API credentials for shop: ${shopTld}. ` +
      `Please set LIGHTSPEED_API_KEY_${shopTld.toUpperCase()} and LIGHTSPEED_API_SECRET_${shopTld.toUpperCase()}`
    )
  }

  return new LightspeedAPIClient({
    apiKey,
    apiSecret,
    shopTld,
  })
}
