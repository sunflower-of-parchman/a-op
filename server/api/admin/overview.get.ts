import { getAdminSupabase, requireAnyRole } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [{ count: releases }, { count: media }, { count: pendingEvents }] = await Promise.all([
    admin.from('releases').select('*', { count: 'exact', head: true }),
    admin.from('media_objects').select('*', { count: 'exact', head: true }),
    admin
      .from('payment_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  return {
    user: { email: identity.user.email },
    roles: identity.roles,
    counts: { releases: releases ?? 0, media: media ?? 0, pendingEvents: pendingEvents ?? 0 },
  }
})
