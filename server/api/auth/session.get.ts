import { getAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await getAuthIdentity(event)
  if (!identity) return { authenticated: false as const }

  return {
    authenticated: true as const,
    user: { id: identity.user.id, email: identity.user.email },
    roles: identity.roles,
  }
})
