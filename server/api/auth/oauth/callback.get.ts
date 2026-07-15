import { getQuery, sendRedirect } from 'h3'
import {
  clearOAuthTransaction,
  getOAuthSupabase,
  setAuthCookies,
  takeOAuthReturnPath,
} from '../../../utils/supabase'
import { oauthReturnPath, oauthSiteOrigin } from '../../../utils/oauth'

function failedRedirect(event: Parameters<typeof getQuery>[0]) {
  clearOAuthTransaction(event)
  return sendRedirect(
    event,
    new URL('/sign-in?oauth=failed', oauthSiteOrigin(event)).toString(),
    303,
  )
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  if (!code || code.length > 2_000) return failedRedirect(event)

  const { data, error } = await getOAuthSupabase(event).auth.exchangeCodeForSession(code)
  if (error || !data.session || !data.user) return failedRedirect(event)

  setAuthCookies(event, data.session)
  const destination = oauthReturnPath(event, takeOAuthReturnPath(event))
  clearOAuthTransaction(event)
  return sendRedirect(event, new URL(destination, oauthSiteOrigin(event)).toString(), 303)
})
