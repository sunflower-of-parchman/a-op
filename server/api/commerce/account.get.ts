import { getAdminSupabase, getAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await getAuthIdentity(event)
  if (!identity) return { authenticated: false as const }
  const admin = getAdminSupabase(event)
  const [
    { data: orders, error: orderError },
    { data: entitlements, error: entitlementError },
    { data: subscriptions, error: subscriptionError },
    { data: downloads, error: downloadError },
    { data: paymentCustomer, error: customerError },
  ] = await Promise.all([
    admin
      .from('orders')
      .select('id, status, currency, total_minor, refunded_minor, completed_at, created_at')
      .eq('customer_id', identity.user.id)
      .order('created_at', { ascending: false }),
    admin
      .from('entitlement_grants')
      .select('id, resource_type, resource_id, source_type, status, expires_at, revoked_at')
      .eq('subject_id', identity.user.id)
      .order('created_at', { ascending: false }),
    admin
      .from('subscriptions')
      .select('id, product_id, status, current_period_end, cancel_at_period_end')
      .eq('subject_id', identity.user.id)
      .order('updated_at', { ascending: false }),
    admin
      .from('download_records')
      .select('id, media_object_id, delivered_at')
      .eq('subject_id', identity.user.id)
      .order('delivered_at', { ascending: false })
      .limit(20),
    admin
      .from('payment_customers')
      .select('id')
      .eq('subject_id', identity.user.id)
      .eq('provider', 'stripe')
      .maybeSingle(),
  ])
  if (orderError || entitlementError || subscriptionError || downloadError || customerError) {
    throw createError({ statusCode: 503, statusMessage: 'Commerce history could not load.' })
  }

  const orderIds = orders.map(({ id }) => id)
  const productIds = [
    ...new Set([
      ...subscriptions.map(({ product_id }) => product_id),
      ...(orderIds.length
        ? ((
            await admin.from('order_items').select('product_id').in('order_id', orderIds)
          ).data?.map(({ product_id }) => product_id) ?? [])
        : []),
    ]),
  ]
  const [{ data: items, error: itemError }, { data: products, error: productError }] =
    await Promise.all([
      orderIds.length
        ? admin
            .from('order_items')
            .select('order_id, product_id, resource_type, resource_id')
            .in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? admin.from('products').select('id, name, product_type').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ])
  if (itemError || productError) {
    throw createError({ statusCode: 503, statusMessage: 'Commerce history could not load.' })
  }
  const productById = new Map(products.map((product) => [product.id, product]))
  const releaseIds = [
    ...new Set(
      items
        .filter(({ resource_type }) => resource_type === 'release')
        .map(({ resource_id }) => resource_id),
    ),
  ]
  const { data: downloadMedia, error: downloadMediaError } = releaseIds.length
    ? await admin
        .from('media_objects')
        .select('id, release_id')
        .eq('kind', 'download')
        .eq('status', 'ready')
        .in('release_id', releaseIds)
    : { data: [], error: null }
  if (downloadMediaError) {
    throw createError({ statusCode: 503, statusMessage: 'Protected downloads could not load.' })
  }

  return {
    authenticated: true as const,
    portalAvailable: Boolean(paymentCustomer),
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      currency: order.currency,
      totalMinor: order.total_minor,
      refundedMinor: order.refunded_minor,
      completedAt: order.completed_at,
      createdAt: order.created_at,
      items: items
        .filter(({ order_id }) => order_id === order.id)
        .map((item) => ({
          name: productById.get(item.product_id)?.name ?? 'Artist offering',
          productType: productById.get(item.product_id)?.product_type ?? 'offering',
          resourceType: item.resource_type,
          resourceId: item.resource_id,
          downloadMediaId:
            downloadMedia.find(({ release_id }) => release_id === item.resource_id)?.id ?? null,
        })),
    })),
    entitlements: entitlements.map((entry) => ({
      id: entry.id,
      resourceType: entry.resource_type,
      resourceId: entry.resource_id,
      sourceType: entry.source_type,
      status: entry.status,
      expiresAt: entry.expires_at,
      revokedAt: entry.revoked_at,
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      productName: productById.get(subscription.product_id)?.name ?? 'Artist membership',
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    })),
    downloads: downloads.map((download) => ({
      id: download.id,
      mediaObjectId: download.media_object_id,
      deliveredAt: download.delivered_at,
    })),
  }
})
