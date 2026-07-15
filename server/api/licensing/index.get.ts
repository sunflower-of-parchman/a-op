import type { LicenseGeneralTerm, LicensingResponse } from '#shared/types/licensing'
import { getAdminSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event): Promise<LicensingResponse> => {
  const admin = getAdminSupabase(event)
  const { data: templates, error: templateError } = await admin
    .from('license_templates')
    .select('id, slug, name, summary, track_id, current_version_id')
    .eq('state', 'published')
    .order('name')
  if (templateError) {
    throw createError({ statusCode: 503, statusMessage: 'Licensing could not be loaded.' })
  }
  if (!templates.length) return { templates: [], inquiryPath: '/contact' }

  const versionIds = templates.flatMap(({ current_version_id }) =>
    current_version_id ? [current_version_id] : [],
  )
  const trackIds = templates.map(({ track_id }) => track_id)
  const [
    { data: versions, error: versionError },
    { data: options, error: optionError },
    { data: offers, error: offerError },
    { data: tracks, error: trackError },
  ] = await Promise.all([
    admin
      .from('license_template_versions')
      .select('id, version_number, title, introduction, general_terms, disclaimer')
      .in('id', versionIds),
    admin
      .from('license_options')
      .select('*')
      .in('template_version_id', versionIds)
      .order('sort_order'),
    admin
      .from('license_offers')
      .select('id, option_id, template_version_id')
      .eq('state', 'published')
      .in('template_version_id', versionIds),
    admin.from('tracks').select('id, slug, title').in('id', trackIds).eq('state', 'published'),
  ])
  if (versionError || optionError || offerError || trackError) {
    throw createError({ statusCode: 503, statusMessage: 'Licensing could not be loaded.' })
  }

  return {
    templates: templates.flatMap((template) => {
      const version = versions?.find(({ id }) => id === template.current_version_id)
      const track = tracks?.find(({ id }) => id === template.track_id)
      if (!version || !track) return []
      return [
        {
          id: template.id,
          slug: template.slug,
          name: template.name,
          summary: template.summary,
          track,
          version: {
            id: version.id,
            number: version.version_number,
            title: version.title,
            introduction: version.introduction,
            generalTerms: version.general_terms as LicenseGeneralTerm[],
            disclaimer: version.disclaimer,
          },
          options: (options ?? [])
            .filter(({ template_version_id }) => template_version_id === version.id)
            .flatMap((option) => {
              const offer = offers?.find(({ option_id }) => option_id === option.id)
              if (!offer) return []
              return [
                {
                  offerId: offer.id,
                  optionId: option.id,
                  key: option.option_key,
                  label: option.label,
                  description: option.description,
                  usageCategory: option.usage_category,
                  allowedMedia: option.allowed_media,
                  audienceLabel: option.audience_label,
                  maxAudience: option.max_audience,
                  distributionLabel: option.distribution_label,
                  maxCopies: option.max_copies,
                  termMonths: option.term_months,
                  territory: option.territory,
                  attributionRequired: option.attribution_required,
                  attributionText: option.attribution_text,
                  exclusive: false as const,
                  currency: option.currency,
                  amountMinor: option.amount_minor,
                },
              ]
            }),
        },
      ]
    }),
    inquiryPath: '/contact',
  }
})
