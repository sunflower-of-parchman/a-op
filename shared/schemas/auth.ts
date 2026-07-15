import { z } from 'zod'

export const oauthProviderSchema = z.enum(['google', 'apple', 'github', 'spotify'])

export const oauthStartSchema = z
  .object({
    provider: oauthProviderSchema,
    redirect: z.string().trim().max(500).optional(),
  })
  .strict()

export const signInSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
})

export const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(1).max(100),
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type OAuthProvider = z.infer<typeof oauthProviderSchema>
export type OAuthStartInput = z.infer<typeof oauthStartSchema>
