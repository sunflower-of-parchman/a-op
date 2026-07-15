import { createError, readValidatedBody } from 'h3'
import { signUpSchema } from '#shared/schemas/auth'
import { getPublicSupabase, setAuthCookies } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const credentials = await readValidatedBody(event, (body) => signUpSchema.parse(body))
  const supabase = getPublicSupabase(event)
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: { data: { display_name: credentials.displayName } },
  })

  if (error || !data.user) {
    throw createError({ statusCode: 400, statusMessage: 'The account could not be created.' })
  }

  if (data.session) setAuthCookies(event, data.session)

  return {
    user: { id: data.user.id, email: data.user.email },
    confirmationRequired: !data.session,
  }
})
