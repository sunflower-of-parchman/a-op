import { getRouterParam, readValidatedBody } from 'h3'
import { commerceProductUpdateSchema } from '#shared/schemas/commerce'
import { getAdminSupabase, requireAnyRole } from '../../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'An offering identifier is required.' })
  const input = await readValidatedBody(event, (body) => commerceProductUpdateSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: price, error: priceError } = await admin
    .from('prices')
    .select('id')
    .eq('product_id', id)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (priceError)
    throw createError({ statusCode: 503, statusMessage: 'Offering price could not load.' })

  const { error } = await admin.rpc('update_commerce_offer', {
    p_actor_id: identity.user.id,
    p_product_id: id,
    p_price_id: price?.id ?? id,
    p_name: input.name,
    p_description: input.description,
    p_state: input.state,
    p_purchase_mode: input.purchaseMode,
    p_external_url: input.externalUrl,
    p_currency: input.currency,
    p_amount_minor: input.amountMinor,
    p_billing_interval: input.billingInterval,
    p_external_product_id: input.externalProductId,
    p_external_price_id: input.externalPriceId,
  })
  if (error) throw createError({ statusCode: 400, statusMessage: 'Offering could not be updated.' })
  return { productId: id, updated: true }
})
