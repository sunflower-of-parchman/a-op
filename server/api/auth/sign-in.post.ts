import { createError, readValidatedBody } from 'h3'
import { signInSchema } from '#shared/schemas/auth'
import { getPublicSupabase, setAuthCookies } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const credentials = await readValidatedBody(event, (body) => signInSchema.parse(body))
  const supabase = getPublicSupabase(event)
  const { data, error } = await supabase.auth.signInWithPassword(credentials)

  if (error || !data.session || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'The email or password was not accepted.' })
  }

  setAuthCookies(event, data.session)
  return { user: { id: data.user.id, email: data.user.email } }
})
