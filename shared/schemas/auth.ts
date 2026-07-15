import { z } from 'zod'

export const signInSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
})

export const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(1).max(100),
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
