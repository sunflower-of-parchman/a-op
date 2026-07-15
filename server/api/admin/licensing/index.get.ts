import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner'])
  const admin = getAdminSupabase(event)
  const [
    { data: tracks, error: trackError },
    { data: templates, error: templateError },
    { data: versions, error: versionError },
    { data: options, error: optionError },
    { data: offers, error: offerError },
    { data: prices, error: priceError },
    { data: issued, error: issuedError },
  ] = await Promise.all([
    admin.from('tracks').select('id, slug, title, state').order('title'),
    admin.from('license_templates').select('*').order('updated_at', { ascending: false }),
    admin
      .from('license_template_versions')
      .select('*')
      .order('version_number', { ascending: false }),
    admin.from('license_options').select('*').order('sort_order'),
    admin.from('license_offers').select('*').order('created_at', { ascending: false }),
    admin.from('prices').select('id, external_product_id, external_price_id'),
    admin
      .from('issued_licenses')
      .select(
        'id, track_id, terms_snapshot, status, document_status, document_failure_code, amount_minor, currency, issued_at',
      )
      .order('issued_at', { ascending: false })
      .limit(50),
  ])
  if (
    trackError ||
    templateError ||
    versionError ||
    optionError ||
    offerError ||
    priceError ||
    issuedError
  ) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Licensing administration could not load.',
    })
  }

  return {
    tracks,
    templates: templates.map((template) => {
      const current = versions.find(({ id }) => id === template.current_version_id) ?? null
      const currentOptions = current
        ? options.filter(({ template_version_id }) => template_version_id === current.id)
        : []
      const currentOffers = current
        ? offers.filter(({ template_version_id }) => template_version_id === current.id)
        : []
      return {
        ...template,
        versionCount: versions.filter(({ template_id }) => template_id === template.id).length,
        currentVersion: current,
        options: currentOptions.map((option) => {
          const offer = currentOffers.find(({ option_id }) => option_id === option.id)
          const mapping = prices.find(({ id }) => id === offer?.price_id)
          return {
            ...option,
            offerId: offer?.id ?? null,
            productId: offer?.product_id ?? null,
            priceId: offer?.price_id ?? null,
            stripeMapped: Boolean(mapping?.external_product_id && mapping.external_price_id),
          }
        }),
      }
    }),
    issued: issued.map((license) => {
      const snapshot = license.terms_snapshot as {
        track?: { title?: string }
        option?: { label?: string }
        licensee?: { name?: string; projectTitle?: string }
      }
      return {
        ...license,
        trackTitle: snapshot.track?.title ?? 'Licensed track',
        optionLabel: snapshot.option?.label ?? 'Artist license',
        licenseeName: snapshot.licensee?.name ?? 'Licensee',
        projectTitle: snapshot.licensee?.projectTitle ?? 'Licensed project',
      }
    }),
  }
})
