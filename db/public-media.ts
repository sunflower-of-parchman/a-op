const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export interface PublicArtwork {
  readonly alt: string;
  readonly url: string;
}

export async function readPublicArtwork(
  binding: D1Database,
  derivativeId: string,
  alt: string,
): Promise<PublicArtwork | null> {
  if (!SAFE_ID.test(derivativeId)) return null;

  const row = await binding
    .prepare(
      `SELECT derivative.id
       FROM media_derivatives AS derivative
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE derivative.id = ?1
         AND derivative.kind IN ('artwork', 'poster', 'thumbnail')
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key IS NOT NULL
         AND derivative.content_type LIKE 'image/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'image'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'image/%'
         AND (
           EXISTS (
             SELECT 1 FROM courses
             WHERE courses.publication_state = 'published'
               AND courses.published_revision_id IS NOT NULL
               AND derivative.id = 'media-course-' || courses.slug || '-artwork'
           )
           OR EXISTS (
             SELECT 1 FROM pages
             WHERE pages.slug = 'about'
               AND pages.publication_state = 'published'
               AND pages.published_revision_id IS NOT NULL
               AND derivative.id = 'media-about-profile-artwork'
           )
         )
       LIMIT 1`,
    )
    .bind(derivativeId)
    .first<{ id: string }>();

  if (!row) return null;
  return Object.freeze({
    alt,
    url: `/api/media/artwork/${encodeURIComponent(derivativeId)}`,
  });
}
