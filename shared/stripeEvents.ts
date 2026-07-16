export const requiredStripeEventTypes = [
  'checkout.session.completed',
  'checkout.session.expired',
  'invoice.paid',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'refund.created',
  'refund.updated',
] as const

export type RequiredStripeEventType = (typeof requiredStripeEventTypes)[number]
