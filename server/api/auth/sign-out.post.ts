import { clearAuthCookies } from '../../utils/supabase'

export default defineEventHandler((event) => {
  clearAuthCookies(event)
  return { signedOut: true }
})
