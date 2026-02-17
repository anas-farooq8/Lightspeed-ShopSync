/**
 * Lightspeed eCom API Types
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
    image?: {
      attachment: string
      filename: string
    }
  }
}

export interface CreateProductImagePayload {
  productImage: {
    attachment: string // base64 encoded image
    filename: string
    title?: string
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
