/**
 * Lightspeed eCom API types.
 *
 * These interfaces describe request payloads and responses for the Lightspeed
 * REST API and are consumed by `LightspeedAPIClient` in `lib/services`.
 */

export interface LightspeedConfig {
  apiKey: string
  apiSecret: string
  shopTld: string
}

export interface CreateProductPayload {
  product: {
    visibility: string
    title: string
    fulltitle?: string
    description?: string
    content?: string
  }
}

export interface UpdateProductPayload {
  product: {
    visibility?: string
    title?: string
    fulltitle?: string
    description?: string
    content?: string
  }
}

export interface CreateVariantPayload {
  variant: {
    product: number // target product id
    isDefault: boolean
    sortOrder: number
    sku: string
    articleCode: string // same as sku
    priceExcl: number
    title?: string
    image?: {
      attachment: string // base64 encoded image
      filename: string
    }
  }
}

export interface UpdateVariantPayload {
  variant: {
    product?: number
    isDefault?: boolean
    sortOrder?: number
    sku?: string
    articleCode?: string // same as sku
    priceExcl?: number
    title?: string
    /** Pass { attachment, filename } to set; pass null to clear */
    image?: {
      attachment: string
      filename: string
    } | null
  }
}

export interface CreateProductImagePayload {
  productImage: {
    attachment: string // base64 encoded image
    filename: string // use image title as filename (e.g. "blauw thermic.jpg")
  }
}

export interface UpdateProductImagePayload {
  productImage: {
    sortOrder: number
  }
}

export interface LightspeedProduct {
  id: number
  visibility: string
  title: string
  fulltitle?: string
  description?: string
  content?: string
  createdAt: string
  updatedAt: string
  /** Main product image. API returns false when no image (→ null for DB). */
  image?: { src?: string; thumb?: string; title?: string } | false
}

export interface LightspeedVariant {
  id: number
  product: number
  isDefault: boolean
  sortOrder: number
  sku: string
  priceExcl: string
  title?: string
  image?: {
    src?: string
    thumb?: string
    title?: string
  }
}

export interface LightspeedProductImage {
  id: number
  sortOrder: number
  src: string
  thumb?: string
  title?: string
}
