import { getEnabledOAuthProviders } from '../../utils/supabase'

export default defineEventHandler((event) => ({
  email: true,
  oauthProviders: getEnabledOAuthProviders(event),
}))
