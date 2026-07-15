import { z } from 'zod'

export const simulatedFulfillmentSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  customerId: z.uuid(),
  productId: z.uuid(),
  amountMinor: z.int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/),
})

export type SimulatedFulfillmentInput = z.infer<typeof simulatedFulfillmentSchema>
