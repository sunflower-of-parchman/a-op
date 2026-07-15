import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const licenseId = getRouterParam(event, 'id')
  if (!licenseId) {
    throw createError({ statusCode: 400, statusMessage: 'A license identifier is required.' })
  }

  const admin = getAdminSupabase(event)
  const { data: issued, error: issuedError } = await admin
    .from('issued_licenses')
    .select('id, status, document_status, document_media_id')
    .eq('id', licenseId)
    .maybeSingle()
  if (issuedError || !issued) {
    throw createError({ statusCode: 404, statusMessage: 'The issued license was not found.' })
  }

  const { data: decision, error: decisionError } = await admin.rpc('decide_access', {
    target_subject_id: identity.user.id,
    target_resource_type: 'issued_license',
    target_resource_id: issued.id,
  })
  const access = decision as { allowed: boolean; entitlementId: string | null }
  if (decisionError || !access.allowed || issued.status !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'This account cannot access that license.',
    })
  }
  if (issued.document_status !== 'ready' || !issued.document_media_id) {
    throw createError({ statusCode: 409, statusMessage: 'The license document is not ready yet.' })
  }

  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('id, bucket_id, object_path')
    .eq('id', issued.document_media_id)
    .eq('kind', 'license_document')
    .eq('status', 'ready')
    .single()
  if (mediaError || !media) {
    throw createError({ statusCode: 503, statusMessage: 'The license document is unavailable.' })
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(media.bucket_id)
    .createSignedUrl(media.object_path, 60, { download: `artist-license-${issued.id}.pdf` })
  if (signedError || !signed?.signedUrl) {
    throw createError({ statusCode: 503, statusMessage: 'A protected link could not be created.' })
  }

  if (access.entitlementId) {
    const { error: recordError } = await admin.from('download_records').insert({
      subject_id: identity.user.id,
      media_object_id: media.id,
      entitlement_id: access.entitlementId,
    })
    if (recordError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'License delivery could not be recorded.',
      })
    }
  }

  return { url: signed.signedUrl, expiresIn: 60 }
})
