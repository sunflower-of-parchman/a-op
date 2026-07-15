import type { H3Event } from 'h3'
import type { Database } from '#shared/types/database'
import { getAdminSupabase } from './supabase'

type CommerceProductRow = Database['public']['Tables']['products']['Row']
type CommercePriceRow = Database['public']['Tables']['prices']['Row']

export function presentCommerceProduct(
  product: CommerceProductRow,
  price: CommercePriceRow | null,
) {
  return {
    id: product.id,
    slug: product.slug,
    productType: product.product_type,
    purchaseMode: product.purchase_mode,
    name: product.name,
    description: product.description,
    resourceType: product.resource_type,
    resourceId: product.resource_id,
    externalUrl: product.external_url,
    price: price
      ? {
          id: price.id,
          currency: price.currency,
          amountMinor: price.amount_minor,
          billingInterval: price.billing_interval,
          mapped: Boolean(price.external_price_id),
        }
      : null,
  }
}

export async function loadPublishedCommerce(event: H3Event) {
  const admin = getAdminSupabase(event)
  const [{ data: products, error: productError }, { data: prices, error: priceError }] =
    await Promise.all([
      admin
        .from('products')
        .select('*')
        .eq('state', 'published')
        .neq('product_type', 'license')
        .order('sort_order')
        .order('name'),
      admin.from('prices').select('*').eq('active', true).order('created_at'),
    ])
  if (productError || priceError) {
    throw createError({ statusCode: 503, statusMessage: 'The artist offerings could not load.' })
  }
  return products.map((product) =>
    presentCommerceProduct(
      product,
      prices.find((price) => price.product_id === product.id) ?? null,
    ),
  )
}

export async function requirePublishedProduct(event: H3Event, productId: string) {
  const products = await loadPublishedCommerce(event)
  const product = products.find(({ id }) => id === productId)
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Offering not found.' })
  return product
}

export function publicSiteOrigin(event: H3Event) {
  const config = useRuntimeConfig(event)
  const configured = config.public.siteUrl
  if (configured) return configured.replace(/\/$/, '')
  const requestUrl = getRequestURL(event)
  return `${requestUrl.protocol}//${requestUrl.host}`
}
