import { oauthProviderSchema, type OAuthProvider } from '../schemas/auth'

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  spotify: 'Spotify',
}

export function parseOAuthProviders(value: unknown): OAuthProvider[] {
  if (typeof value !== 'string') return []

  const providers = new Set<OAuthProvider>()
  for (const candidate of value.split(',')) {
    const parsed = oauthProviderSchema.safeParse(candidate.trim().toLowerCase())
    if (parsed.success) providers.add(parsed.data)
  }
  return [...providers]
}
