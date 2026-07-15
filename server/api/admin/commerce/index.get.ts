import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const admin = getAdminSupabase(event)
  const [
    { data: products, error: productError },
    { data: prices, error: priceError },
    { data: events, error: eventError },
    { data: orders, error: orderError },
    { data: subscriptions, error: subscriptionError },
    { data: failures, error: failureError },
  ] = await Promise.all([
    admin.from('products').select('*').order('sort_order').order('name'),
    admin.from('prices').select('*').order('created_at'),
    admin
      .from('payment_events')
      .select('id, provider, provider_event_id, status, amount_minor, currency, received_at')
      .order('received_at', { ascending: false })
      .limit(20),
    admin
      .from('orders')
      .select('id, status, total_minor, refunded_minor, currency, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('subscriptions')
      .select('id, product_id, status, current_period_end, cancel_at_period_end, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),
    admin
      .from('webhook_failures')
      .select(
        'id, provider_event_id, event_type, object_id, error_code, attempts, status, last_failed_at',
      )
      .order('last_failed_at', { ascending: false })
      .limit(20),
  ])
  if (productError || priceError || eventError || orderError || subscriptionError || failureError) {
    throw createError({ statusCode: 503, statusMessage: 'Commerce administration could not load.' })
  }

  return {
    owner: identity.user.email,
    products: products.map((product) => ({
      ...product,
      price: prices.find(({ product_id }) => product_id === product.id) ?? null,
    })),
    events,
    orders,
    subscriptions,
    failures,
  }
})
