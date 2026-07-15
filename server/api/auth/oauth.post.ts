import { createError, readValidatedBody } from 'h3'
import { oauthStartSchema } from '#shared/schemas/auth'
import {
  clearOAuthTransaction,
  getEnabledOAuthProviders,
  getOAuthSupabase,
  setOAuthReturnPath,
} from '../../utils/supabase'
import { assertOAuthAuthorizationUrl, oauthReturnPath, oauthSiteOrigin } from '../../utils/oauth'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => oauthStartSchema.parse(body))
  if (!getEnabledOAuthProviders(event).includes(input.provider)) {
    throw createError({ statusCode: 404, statusMessage: 'That sign-in provider is not enabled.' })
  }

  const returnPath = oauthReturnPath(event, input.redirect)
  setOAuthReturnPath(event, returnPath)

  try {
    const callback = new URL('/api/auth/oauth/callback', oauthSiteOrigin(event)).toString()
    const { data, error } = await getOAuthSupabase(event).auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo: callback, skipBrowserRedirect: true },
    })

    if (error || !data.url) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Provider sign-in could not be started.',
      })
    }

    return {
      provider: input.provider,
      url: assertOAuthAuthorizationUrl(event, data.url),
    }
  } catch (error) {
    clearOAuthTransaction(event)
    throw error
  }
})
