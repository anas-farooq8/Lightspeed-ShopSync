/**
 * Product Operation Log
 *
 * Inserts create/edit operation records into product_operation_logs.
 * Called after create-product or update-product completes (success or error).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface InsertProductOperationLogInput {
  supabase: SupabaseClient
  shopId: string
  lightspeedProductId: number
  operationType: 'create' | 'edit'
  status: 'success' | 'error'
  errorMessage?: string
  details: { changes: string[] }
  sourceShopId?: string | null
  sourceLightspeedProductId?: number | null
}

/**
 * Insert a product operation log row.
 * Call after create/edit completes.
 */
export async function insertProductOperationLog(input: InsertProductOperationLogInput): Promise<void> {
  const {
    supabase,
    shopId,
    lightspeedProductId,
    operationType,
    status,
    errorMessage,
    details,
    sourceShopId = null,
    sourceLightspeedProductId = null,
  } = input

  const { error } = await supabase.from('product_operation_logs').insert({
    shop_id: shopId,
    lightspeed_product_id: lightspeedProductId,
    operation_type: operationType,
    status,
    error_message: status === 'error' ? errorMessage ?? null : null,
    details,
    source_shop_id: sourceShopId ?? null,
    source_lightspeed_product_id: sourceLightspeedProductId ?? null,
  })

  if (error) {
    console.error('[product-operation-log] Failed to insert:', error)
    // Don't throw - log insertion failure shouldn't fail the main operation
  }
}
