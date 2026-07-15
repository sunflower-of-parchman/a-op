import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAnyRole } from '../../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'A media identifier is required.' })
  const admin = getAdminSupabase(event)
  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('id, kind')
    .eq('id', id)
    .eq('kind', 'source_audio')
    .maybeSingle()
  if (mediaError || !media)
    throw createError({ statusCode: 404, statusMessage: 'Source not found.' })
  const { data: job, error: jobError } = await admin
    .from('media_jobs')
    .update({
      status: 'pending',
      worker_id: null,
      lease_expires_at: null,
      error_category: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('media_object_id', id)
    .eq('status', 'failed')
    .select('id')
    .maybeSingle()
  if (jobError || !job) {
    throw createError({ statusCode: 409, statusMessage: 'Only a failed media job can be retried.' })
  }
  await admin.from('media_objects').update({ status: 'pending' }).eq('id', id)
  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'media.job_retried',
    target_type: 'media_object',
    target_id: id,
  })
  return { jobId: job.id, status: 'pending' }
})
