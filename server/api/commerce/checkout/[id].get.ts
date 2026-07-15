import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'A checkout identifier is required.' })
  const admin = getAdminSupabase(event)
  const { data: intent, error } = await admin
    .from('checkout_intents')
    .select('id, product_id, provider, status, return_path, completed_at, created_at')
    .eq('id', id)
    .eq('subject_id', identity.user.id)
    .maybeSingle()
  if (error || !intent) throw createError({ statusCode: 404, statusMessage: 'Checkout not found.' })
  const { data: product, error: productError } = await admin
    .from('products')
    .select('name, description, product_type')
    .eq('id', intent.product_id)
    .single()
  if (productError || !product)
    throw createError({ statusCode: 404, statusMessage: 'Offering not found.' })
  return { intent, product }
})
