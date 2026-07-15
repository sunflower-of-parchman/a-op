import { createHash } from 'node:crypto'
import { createError, getRequestIP, readValidatedBody } from 'h3'
import { contactMessageSchema } from '#shared/schemas/contact'
import { getAdminSupabase } from '../utils/supabase'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => contactMessageSchema.parse(body))

  if (input.company) return { accepted: true }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const config = useRuntimeConfig(event)
  const fingerprint = createHash('sha256')
    .update(`${ip}:${config.supabaseSecretKey.slice(0, 16)}`)
    .digest('hex')
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('submit_contact_message', {
    p_name: input.name,
    p_email: input.email,
    p_message: input.message,
    p_consent: input.consent,
    p_request_fingerprint: fingerprint,
  })

  if (error) {
    const rateLimited = error.message.includes('rate limit')
    throw createError({
      statusCode: rateLimited ? 429 : 400,
      statusMessage: rateLimited
        ? 'Please wait before sending another message.'
        : 'The message could not be stored.',
    })
  }

  return { accepted: true, id: data }
})
