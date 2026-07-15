import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestProtocol,
  setCookie,
  type H3Event,
} from 'h3'
import type { Database, Enums } from '#shared/types/database'
import { parseOAuthProviders } from '#shared/utils/oauth'

const accessCookie = 'artist-access-token'
const refreshCookie = 'artist-refresh-token'
const oauthVerifierCookie = 'artist-oauth-code-verifier'
const oauthReturnCookie = 'artist-oauth-return'

function clientOptions() {
  return { auth: { autoRefreshToken: false, persistSession: false } }
}

function getConnection(event: H3Event) {
  const config = useRuntimeConfig(event)
  const url = config.public.supabaseUrl
  const publishableKey = config.public.supabasePublishableKey

  if (!url || !publishableKey) {
    throw createError({ statusCode: 503, statusMessage: 'Authentication is not configured.' })
  }

  return { config, url, publishableKey }
}

export function getPublicSupabase(event: H3Event): SupabaseClient<Database> {
  const { url, publishableKey } = getConnection(event)
  return createClient<Database>(url, publishableKey, clientOptions())
}

export function getAdminSupabase(event: H3Event): SupabaseClient<Database> {
  const { config, url } = getConnection(event)
  const secretKey = config.supabaseSecretKey

  if (!secretKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Server database access is not configured.',
    })
  }

  return createClient<Database>(url, secretKey, clientOptions())
}

function cookieOptions(event: H3Event, maxAge: number) {
  const forwarded = getRequestHeader(event, 'x-forwarded-proto')
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: forwarded === 'https' || getRequestProtocol(event) === 'https',
    path: '/',
    maxAge,
  }
}

export function getEnabledOAuthProviders(event: H3Event) {
  return parseOAuthProviders(useRuntimeConfig(event).public.oauthProviders)
}

export function getOAuthSupabase(event: H3Event): SupabaseClient<Database> {
  const { url, publishableKey } = getConnection(event)
  const storage = {
    getItem(key: string) {
      return key.endsWith('-code-verifier') ? (getCookie(event, oauthVerifierCookie) ?? null) : null
    },
    setItem(key: string, value: string) {
      if (key.endsWith('-code-verifier')) {
        setCookie(event, oauthVerifierCookie, value, cookieOptions(event, 10 * 60))
      }
    },
    removeItem(key: string) {
      if (key.endsWith('-code-verifier')) deleteCookie(event, oauthVerifierCookie, { path: '/' })
    },
  }

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage,
    },
  })
}

export function setOAuthReturnPath(event: H3Event, path: string) {
  setCookie(event, oauthReturnCookie, path, cookieOptions(event, 10 * 60))
}

export function takeOAuthReturnPath(event: H3Event) {
  const path = getCookie(event, oauthReturnCookie) ?? '/account'
  deleteCookie(event, oauthReturnCookie, { path: '/' })
  return path
}

export function clearOAuthTransaction(event: H3Event) {
  deleteCookie(event, oauthVerifierCookie, { path: '/' })
  deleteCookie(event, oauthReturnCookie, { path: '/' })
}

export function setAuthCookies(event: H3Event, session: Session) {
  setCookie(event, accessCookie, session.access_token, cookieOptions(event, session.expires_in))
  setCookie(event, refreshCookie, session.refresh_token, cookieOptions(event, 60 * 60 * 24 * 30))
}

export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, accessCookie, { path: '/' })
  deleteCookie(event, refreshCookie, { path: '/' })
}

function bearerToken(event: H3Event) {
  const authorization = getRequestHeader(event, 'authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length).trim()
}

async function getVerifiedUser(event: H3Event) {
  const publicClient = getPublicSupabase(event)
  const token = bearerToken(event) ?? getCookie(event, accessCookie)

  if (token) {
    const { data, error } = await publicClient.auth.getUser(token)
    if (!error && data.user) return data.user
  }

  const refreshToken = getCookie(event, refreshCookie)
  if (!refreshToken || bearerToken(event)) return null

  const { data, error } = await publicClient.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session || !data.user) {
    clearAuthCookies(event)
    return null
  }

  setAuthCookies(event, data.session)
  return data.user
}

export type AuthIdentity = {
  user: User
  roles: Enums<'app_role'>[]
}

export async function getAuthIdentity(event: H3Event): Promise<AuthIdentity | null> {
  const user = await getVerifiedUser(event)
  if (!user) return null

  const admin = getAdminSupabase(event)
  const { data, error } = await admin.from('app_roles').select('role').eq('user_id', user.id)
  if (error) {
    throw createError({ statusCode: 503, statusMessage: 'Account roles could not be verified.' })
  }

  return { user, roles: data.map(({ role }) => role) }
}

export async function requireAuthIdentity(event: H3Event): Promise<AuthIdentity> {
  const identity = await getAuthIdentity(event)
  if (!identity) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in is required.' })
  }
  return identity
}

export async function requireAnyRole(event: H3Event, allowed: Enums<'app_role'>[]) {
  const identity = await requireAuthIdentity(event)
  if (!identity.roles.some((role) => allowed.includes(role))) {
    throw createError({ statusCode: 403, statusMessage: 'This account does not have access.' })
  }
  return identity
}
