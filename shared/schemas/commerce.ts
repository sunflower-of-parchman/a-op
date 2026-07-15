import { z } from 'zod'

const returnPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^\/(?!\/)/, 'The return path must be local to this site.')

export const createCheckoutSchema = z.object({
  productId: z.uuid(),
  returnPath: returnPathSchema.default('/account'),
})

export const confirmSimulationSchema = z.object({
  intentId: z.uuid(),
})

export const commerceProductSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  productType: z.enum(['album_download', 'track_download', 'membership', 'license', 'learning']),
  purchaseMode: z.enum(['free', 'stripe', 'external']),
  name: z.string(),
  description: z.string(),
  resourceType: z.string(),
  resourceId: z.uuid(),
  externalUrl: z.url({ protocol: /^https$/ }).nullable(),
  price: z
    .object({
      id: z.uuid(),
      currency: z.string().length(3),
      amountMinor: z.number().int().min(0),
      billingInterval: z.enum(['one_time', 'month', 'year']),
      mapped: z.boolean(),
    })
    .nullable(),
})

export const commerceProductUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  state: z.enum(['draft', 'published', 'archived']),
  purchaseMode: z.enum(['free', 'stripe', 'external']),
  externalUrl: z.union([z.url({ protocol: /^https$/ }), z.literal('')]).default(''),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  amountMinor: z.number().int().min(0).max(100_000_000),
  billingInterval: z.enum(['one_time', 'month', 'year']),
  externalProductId: z.string().trim().max(255).default(''),
  externalPriceId: z.string().trim().max(255).default(''),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>
