import type { IssuedLicenseSummary } from './licensing'

export type CommercePrice = {
  id: string
  currency: string
  amountMinor: number
  billingInterval: 'one_time' | 'month' | 'year'
  mapped: boolean
}

export type CommerceProduct = {
  id: string
  slug: string
  productType: 'album_download' | 'track_download' | 'membership' | 'license' | 'learning'
  purchaseMode: 'free' | 'stripe' | 'external'
  name: string
  description: string
  resourceType: string
  resourceId: string
  externalUrl: string | null
  price: CommercePrice | null
}

export type CommerceCatalogResponse = {
  stripeConfigured: boolean
  simulationAvailable: boolean
  products: CommerceProduct[]
}

export type CheckoutIntentResponse = {
  intent: {
    id: string
    product_id: string
    provider: string
    status: string
    return_path: string
    completed_at: string | null
    created_at: string
  }
  product: {
    name: string
    description: string
    product_type: string
  }
}

export type AccountCommerceResponse =
  | { authenticated: false }
  | {
      authenticated: true
      portalAvailable: boolean
      orders: Array<{
        id: string
        status: string
        currency: string
        totalMinor: number
        refundedMinor: number
        completedAt: string | null
        createdAt: string
        items: Array<{
          name: string
          productType: string
          resourceType: string
          resourceId: string
          downloadMediaId: string | null
        }>
      }>
      entitlements: Array<{
        id: string
        resourceType: string
        resourceId: string
        sourceType: string
        status: string
        expiresAt: string | null
        revokedAt: string | null
      }>
      subscriptions: Array<{
        id: string
        productName: string
        status: string
        currentPeriodEnd: string
        cancelAtPeriodEnd: boolean
      }>
      downloads: Array<{
        id: string
        mediaObjectId: string
        deliveredAt: string
      }>
      licenses: IssuedLicenseSummary[]
    }
