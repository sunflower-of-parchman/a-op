import { z } from 'zod'

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  message: z.string().trim().min(10).max(5000),
  consent: z.boolean(),
  company: z.string().max(0).optional(),
})

export type ContactMessageInput = z.infer<typeof contactMessageSchema>
