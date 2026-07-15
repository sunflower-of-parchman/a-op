do $hosted_reset_guard$
declare
  current_schema_version text;
  current_project_hash text;
begin
  select value into current_schema_version
  from public.installation_metadata
  where key = 'schema_version';

  if current_schema_version is distinct from '__SCHEMA_VERSION__' then
    raise exception 'Hosted reset refused: schema version mismatch.';
  end if;

  select value into current_project_hash
  from public.installation_metadata
  where key = 'judging_project_ref_sha256';

  if current_project_hash is distinct from '__PROJECT_REF_SHA256__' then
    raise exception 'Hosted reset refused: project marker mismatch.';
  end if;

  execute $truncate$
    truncate table
      public.analytics_events,
      public.app_roles,
      public.audit_records,
      public.catalog_credits,
      public.catalog_taxonomies,
      public.catalog_term_assignments,
      public.catalog_terms,
      public.checkout_intents,
      public.collection_drafts,
      public.collection_tracks,
      public.collections,
      public.contact_messages,
      public.courses,
      public.download_records,
      public.editorial_drafts,
      public.editorial_posts,
      public.entitlement_grants,
      public.favorites,
      public.issued_licenses,
      public.learning_areas,
      public.learning_path_drafts,
      public.learning_paths,
      public.lesson_progress,
      public.lesson_sections,
      public.lessons,
      public.license_document_jobs,
      public.license_offers,
      public.license_options,
      public.license_selections,
      public.license_template_versions,
      public.license_templates,
      public.listening_history,
      public.media_jobs,
      public.media_objects,
      public.membership_tiers,
      public.operational_checks,
      public.operational_events,
      public.order_items,
      public.orders,
      public.pages,
      public.payment_customers,
      public.payment_events,
      public.playlist_tracks,
      public.playlists,
      public.prices,
      public.products,
      public.profiles,
      public.refunds,
      public.release_drafts,
      public.release_tracks,
      public.releases,
      public.site_config_versions,
      public.subscriptions,
      public.telemetry_settings,
      public.tracks,
      public.upload_intents,
      public.video_drafts,
      public.videos,
      public.webhook_failures
  $truncate$;

  insert into public.telemetry_settings (id) values ('primary');

  insert into public.installation_metadata (key, value)
  values ('hosted_reset_version', '__RESET_VERSION__')
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  delete from public.installation_metadata
  where key = 'hosted_fixture_fingerprint';
end
$hosted_reset_guard$;
