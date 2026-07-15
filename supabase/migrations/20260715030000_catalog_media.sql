create type public.media_job_status as enum ('pending', 'processing', 'ready', 'failed');

alter table public.releases
  add column subtitle text not null default '',
  add column release_type text not null default 'album'
    check (release_type in ('album', 'ep', 'single', 'collection')),
  add column label text not null default '',
  add column catalog_number text not null default '',
  add column genre text not null default '',
  add column mood text not null default '';

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  description text not null default '',
  primary_release_id uuid references public.releases (id) on delete set null,
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  musical_key text not null default '',
  meter text not null default '',
  tempo_bpm numeric(6, 2) check (tempo_bpm is null or tempo_bpm > 0),
  mood text not null default '',
  instruments text[] not null default '{}'::text[],
  explicit boolean not null default false,
  state public.publication_state not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracks_published_timestamp check (
    state <> 'published' or published_at is not null
  )
);

create index tracks_publication_idx on public.tracks (state, published_at desc);
create index tracks_primary_release_idx on public.tracks (primary_release_id, state);

create table public.release_tracks (
  release_id uuid not null references public.releases (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  disc_number integer not null default 1 check (disc_number > 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  primary key (release_id, track_id),
  unique (release_id, disc_number, position)
);

create index release_tracks_track_idx on public.release_tracks (track_id, release_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  description text not null default '',
  state public.publication_state not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_published_timestamp check (
    state <> 'published' or published_at is not null
  )
);

create index collections_publication_idx
  on public.collections (state, sort_order, published_at desc);

create table public.collection_tracks (
  collection_id uuid not null references public.collections (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null check (position > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (collection_id, track_id),
  unique (collection_id, position)
);

create index collection_tracks_track_idx on public.collection_tracks (track_id, collection_id);

create table public.catalog_credits (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('release', 'track')),
  resource_id uuid not null,
  role text not null check (length(role) between 1 and 100),
  name text not null check (length(name) between 1 and 160),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (resource_type, resource_id, role, name)
);

create index catalog_credits_resource_idx
  on public.catalog_credits (resource_type, resource_id, position);

create table public.catalog_taxonomies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (length(label) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.catalog_terms (
  id uuid primary key default gen_random_uuid(),
  taxonomy_id uuid not null references public.catalog_taxonomies (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (length(label) between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (taxonomy_id, slug)
);

create table public.catalog_term_assignments (
  term_id uuid not null references public.catalog_terms (id) on delete cascade,
  resource_type text not null check (resource_type in ('release', 'track')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (term_id, resource_type, resource_id)
);

alter table public.media_objects
  add column track_id uuid references public.tracks (id) on delete set null,
  add column source_media_id uuid references public.media_objects (id) on delete set null,
  add column metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  add column processing_profile_version text,
  add column derivative_key text;

create index media_objects_track_kind_idx
  on public.media_objects (track_id, kind, status);
create unique index media_objects_source_hash_idx
  on public.media_objects (sha256)
  where kind = 'source_audio' and sha256 is not null;
create unique index media_objects_derivative_key_idx
  on public.media_objects (derivative_key)
  where derivative_key is not null;

alter table public.releases
  add column artwork_media_id uuid references public.media_objects (id) on delete set null;

create table public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  media_object_id uuid not null references public.media_objects (id) on delete cascade,
  status public.media_job_status not null default 'pending',
  processing_profile_version text not null,
  worker_id text,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  error_category text,
  result_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_metadata) = 'object'),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (media_object_id, processing_profile_version),
  constraint media_jobs_lease_shape check (
    (status = 'processing' and worker_id is not null and lease_expires_at is not null)
    or status <> 'processing'
  )
);

create index media_jobs_claim_idx
  on public.media_jobs (status, lease_expires_at, created_at);

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playlists_owner_updated_idx on public.playlists (owner_id, updated_at desc);

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null check (position > 0),
  added_at timestamptz not null default now(),
  primary key (playlist_id, track_id),
  unique (playlist_id, position)
);

create table public.favorites (
  owner_id uuid not null references auth.users (id) on delete cascade,
  resource_type text not null check (resource_type in ('release', 'track', 'collection')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, resource_type, resource_id)
);

create table public.listening_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  listened_at timestamptz not null default now(),
  progress_ms integer not null default 0 check (progress_ms >= 0),
  completed boolean not null default false
);

create index listening_history_owner_time_idx
  on public.listening_history (owner_id, listened_at desc);

create or replace function public.claim_media_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  media_id uuid,
  source_hash text,
  source_bucket text,
  source_path text,
  processing_profile_version text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if length(trim(p_worker_id)) < 3 then
    raise exception 'A stable worker identifier is required.';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'Lease seconds must be between 30 and 3600.';
  end if;

  select media_jobs.id into v_job_id
  from public.media_jobs
  join public.media_objects on media_objects.id = media_jobs.media_object_id
  where media_objects.kind = 'source_audio'
    and media_objects.sha256 is not null
    and (
      media_jobs.status = 'pending'
      or (media_jobs.status = 'processing' and media_jobs.lease_expires_at < now())
    )
  order by media_jobs.created_at, media_jobs.id
  for update of media_jobs skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.media_jobs
  set status = 'processing',
      worker_id = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempts = attempts + 1,
      started_at = coalesce(started_at, now()),
      finished_at = null,
      error_category = null,
      updated_at = now()
  from public.media_objects
  where media_jobs.id = v_job_id
    and media_objects.id = media_jobs.media_object_id
  returning media_jobs.id,
            media_objects.id,
            media_objects.sha256,
            media_objects.bucket_id,
            media_objects.object_path,
            media_jobs.processing_profile_version,
            media_jobs.lease_expires_at;
end;
$$;

create or replace function public.finalize_media_job(
  p_job_id uuid,
  p_worker_id text,
  p_result_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.media_jobs
  set status = 'ready',
      result_metadata = coalesce(p_result_metadata, '{}'::jsonb),
      lease_expires_at = null,
      finished_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and worker_id = p_worker_id
    and lease_expires_at > now();

  if not found then
    raise exception 'The media job lease is stale or does not belong to this worker.';
  end if;

  update public.media_objects
  set status = 'ready', updated_at = now()
  where id = (select media_object_id from public.media_jobs where id = p_job_id);
end;
$$;

create or replace function public.fail_media_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.media_jobs
  set status = 'failed',
      error_category = left(coalesce(nullif(trim(p_error_category), ''), 'processing-failed'), 80),
      lease_expires_at = null,
      finished_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and worker_id = p_worker_id
    and lease_expires_at > now();

  if not found then
    raise exception 'The media job lease is stale or does not belong to this worker.';
  end if;

  update public.media_objects
  set status = 'failed', updated_at = now()
  where id = (select media_object_id from public.media_jobs where id = p_job_id);
end;
$$;

revoke all on function public.claim_media_job(text, integer) from public, anon, authenticated;
revoke all on function public.finalize_media_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_media_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_media_job(text, integer) to service_role;
grant execute on function public.finalize_media_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_media_job(uuid, text, text) to service_role;

alter table public.tracks enable row level security;
alter table public.tracks force row level security;
alter table public.release_tracks enable row level security;
alter table public.release_tracks force row level security;
alter table public.collections enable row level security;
alter table public.collections force row level security;
alter table public.collection_tracks enable row level security;
alter table public.collection_tracks force row level security;
alter table public.catalog_credits enable row level security;
alter table public.catalog_credits force row level security;
alter table public.catalog_taxonomies enable row level security;
alter table public.catalog_taxonomies force row level security;
alter table public.catalog_terms enable row level security;
alter table public.catalog_terms force row level security;
alter table public.catalog_term_assignments enable row level security;
alter table public.catalog_term_assignments force row level security;
alter table public.media_jobs enable row level security;
alter table public.media_jobs force row level security;
alter table public.playlists enable row level security;
alter table public.playlists force row level security;
alter table public.playlist_tracks enable row level security;
alter table public.playlist_tracks force row level security;
alter table public.favorites enable row level security;
alter table public.favorites force row level security;
alter table public.listening_history enable row level security;
alter table public.listening_history force row level security;

revoke all on table public.tracks from public, anon, authenticated;
revoke all on table public.release_tracks from public, anon, authenticated;
revoke all on table public.collections from public, anon, authenticated;
revoke all on table public.collection_tracks from public, anon, authenticated;
revoke all on table public.catalog_credits from public, anon, authenticated;
revoke all on table public.catalog_taxonomies from public, anon, authenticated;
revoke all on table public.catalog_terms from public, anon, authenticated;
revoke all on table public.catalog_term_assignments from public, anon, authenticated;
revoke all on table public.media_jobs from public, anon, authenticated;
revoke all on table public.playlists from public, anon, authenticated;
revoke all on table public.playlist_tracks from public, anon, authenticated;
revoke all on table public.favorites from public, anon, authenticated;
revoke all on table public.listening_history from public, anon, authenticated;

grant select on table public.tracks to anon, authenticated;
grant select on table public.release_tracks to anon, authenticated;
grant select on table public.collections to anon, authenticated;
grant select on table public.collection_tracks to anon, authenticated;
grant select on table public.catalog_credits to anon, authenticated;
grant select on table public.catalog_taxonomies to anon, authenticated;
grant select on table public.catalog_terms to anon, authenticated;
grant select on table public.catalog_term_assignments to anon, authenticated;
grant insert, update, delete on table public.tracks to authenticated;
grant insert, update, delete on table public.release_tracks to authenticated;
grant insert, update, delete on table public.collections to authenticated;
grant insert, update, delete on table public.collection_tracks to authenticated;
grant insert, update, delete on table public.catalog_credits to authenticated;
grant insert, update, delete on table public.catalog_taxonomies to authenticated;
grant insert, update, delete on table public.catalog_terms to authenticated;
grant insert, update, delete on table public.catalog_term_assignments to authenticated;
grant select on table public.media_jobs to authenticated;
grant select, insert, update, delete on table public.playlists to authenticated;
grant select, insert, update, delete on table public.playlist_tracks to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
grant select, insert, update, delete on table public.listening_history to authenticated;

grant all on table public.tracks to service_role;
grant all on table public.release_tracks to service_role;
grant all on table public.collections to service_role;
grant all on table public.collection_tracks to service_role;
grant all on table public.catalog_credits to service_role;
grant all on table public.catalog_taxonomies to service_role;
grant all on table public.catalog_terms to service_role;
grant all on table public.catalog_term_assignments to service_role;
grant all on table public.media_jobs to service_role;
grant all on table public.playlists to service_role;
grant all on table public.playlist_tracks to service_role;
grant all on table public.favorites to service_role;
grant all on table public.listening_history to service_role;

create policy "published tracks are public"
  on public.tracks for select to anon, authenticated
  using (state = 'published');
create policy "administrators manage tracks"
  on public.tracks for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "published release tracks are public"
  on public.release_tracks for select to anon, authenticated
  using (
    exists (select 1 from public.releases where releases.id = release_tracks.release_id and releases.state = 'published')
    and exists (select 1 from public.tracks where tracks.id = release_tracks.track_id and tracks.state = 'published')
  );
create policy "administrators manage release tracks"
  on public.release_tracks for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "published collections are public"
  on public.collections for select to anon, authenticated
  using (state = 'published');
create policy "administrators manage collections"
  on public.collections for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "published collection tracks are public"
  on public.collection_tracks for select to anon, authenticated
  using (
    exists (select 1 from public.collections where collections.id = collection_tracks.collection_id and collections.state = 'published')
    and exists (select 1 from public.tracks where tracks.id = collection_tracks.track_id and tracks.state = 'published')
  );
create policy "administrators manage collection tracks"
  on public.collection_tracks for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "catalog credits are public for published resources"
  on public.catalog_credits for select to anon, authenticated
  using (
    (resource_type = 'release' and exists (select 1 from public.releases where releases.id = catalog_credits.resource_id and releases.state = 'published'))
    or (resource_type = 'track' and exists (select 1 from public.tracks where tracks.id = catalog_credits.resource_id and tracks.state = 'published'))
  );
create policy "administrators manage catalog credits"
  on public.catalog_credits for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "catalog taxonomies are public"
  on public.catalog_taxonomies for select to anon, authenticated using (true);
create policy "catalog terms are public"
  on public.catalog_terms for select to anon, authenticated using (true);
create policy "catalog assignments are public for published resources"
  on public.catalog_term_assignments for select to anon, authenticated
  using (
    (resource_type = 'release' and exists (select 1 from public.releases where releases.id = catalog_term_assignments.resource_id and releases.state = 'published'))
    or (resource_type = 'track' and exists (select 1 from public.tracks where tracks.id = catalog_term_assignments.resource_id and tracks.state = 'published'))
  );
create policy "administrators manage catalog taxonomies"
  on public.catalog_taxonomies for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());
create policy "administrators manage catalog terms"
  on public.catalog_terms for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());
create policy "administrators manage catalog assignments"
  on public.catalog_term_assignments for all to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "administrators read media jobs"
  on public.media_jobs for select to authenticated
  using (private.is_content_administrator());

create policy "people manage their playlists"
  on public.playlists for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "people manage their playlist tracks"
  on public.playlist_tracks for all to authenticated
  using (exists (select 1 from public.playlists where playlists.id = playlist_tracks.playlist_id and playlists.owner_id = auth.uid()))
  with check (exists (select 1 from public.playlists where playlists.id = playlist_tracks.playlist_id and playlists.owner_id = auth.uid()));
create policy "people manage their favorites"
  on public.favorites for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "people manage their listening history"
  on public.listening_history for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on function public.claim_media_job(text, integer) is
  'Server-only atomic media job lease. Expired processing leases are reclaimable.';
comment on function public.finalize_media_job(uuid, text, jsonb) is
  'Server-only compare-and-set media job finalization that rejects stale leases.';
