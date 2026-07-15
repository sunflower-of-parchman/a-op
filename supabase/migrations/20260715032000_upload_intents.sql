create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  kind public.media_kind not null check (kind in ('source_audio', 'artwork')),
  release_id uuid references public.releases (id) on delete cascade,
  track_id uuid references public.tracks (id) on delete cascade,
  bucket_id text not null check (bucket_id in ('source-audio', 'artwork')),
  object_path text not null,
  media_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 524288000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'authorized'
    check (status in ('authorized', 'completed', 'expired')),
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint upload_intents_target check (
    (kind = 'source_audio' and track_id is not null)
    or (kind = 'artwork' and release_id is not null)
  ),
  unique (bucket_id, object_path)
);

create index upload_intents_actor_status_idx
  on public.upload_intents (actor_id, status, expires_at desc);
create index upload_intents_expiry_idx
  on public.upload_intents (status, expires_at)
  where status = 'authorized';

alter table public.upload_intents enable row level security;
alter table public.upload_intents force row level security;
revoke all on table public.upload_intents from public, anon, authenticated;
grant all on table public.upload_intents to service_role;

comment on table public.upload_intents is
  'Server-authorized direct Storage uploads. Source objects become processable only after explicit completion.';

create table public.release_drafts (
  release_id uuid primary key references public.releases (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.release_drafts enable row level security;
alter table public.release_drafts force row level security;
revoke all on table public.release_drafts from public, anon, authenticated;
grant all on table public.release_drafts to service_role;

create or replace function public.apply_release_draft(
  p_release_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_track jsonb;
  v_credit jsonb;
begin
  if not exists (
    select 1 from public.app_roles
    where user_id = p_actor_id and role in ('owner', 'editor')
  ) then
    raise exception 'Only an owner or editor can publish a release.';
  end if;

  select payload into v_payload
  from public.release_drafts
  where release_id = p_release_id
  for update;

  if v_payload is null then
    raise exception 'The release draft does not exist.';
  end if;

  update public.releases
  set slug = v_payload->>'slug',
      title = v_payload->>'title',
      subtitle = coalesce(v_payload->>'subtitle', ''),
      description = coalesce(v_payload->>'description', ''),
      release_type = v_payload->>'release_type',
      release_date = nullif(v_payload->>'release_date', '')::date,
      label = coalesce(v_payload->>'label', ''),
      catalog_number = coalesce(v_payload->>'catalog_number', ''),
      genre = coalesce(v_payload->>'genre', ''),
      mood = coalesce(v_payload->>'mood', ''),
      artwork_media_id = nullif(v_payload->>'artwork_media_id', '')::uuid,
      state = 'published',
      published_at = now()
  where id = p_release_id;

  if not found then
    raise exception 'The release does not exist.';
  end if;

  for v_track in select value from jsonb_array_elements(v_payload->'tracks')
  loop
    insert into public.tracks (
      id,
      slug,
      title,
      description,
      primary_release_id,
      duration_ms,
      musical_key,
      meter,
      tempo_bpm,
      mood,
      instruments,
      explicit,
      state,
      published_at,
      created_by,
      updated_at
    )
    values (
      (v_track->>'id')::uuid,
      v_track->>'slug',
      v_track->>'title',
      coalesce(v_track->>'description', ''),
      p_release_id,
      nullif(v_track->>'duration_ms', '')::integer,
      coalesce(v_track->>'musical_key', ''),
      coalesce(v_track->>'meter', ''),
      nullif(v_track->>'tempo_bpm', '')::numeric,
      coalesce(v_track->>'mood', ''),
      coalesce(
        array(select jsonb_array_elements_text(v_track->'instruments')),
        '{}'::text[]
      ),
      coalesce((v_track->>'explicit')::boolean, false),
      'published',
      now(),
      p_actor_id,
      now()
    )
    on conflict (id) do update
    set slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        primary_release_id = excluded.primary_release_id,
        duration_ms = excluded.duration_ms,
        musical_key = excluded.musical_key,
        meter = excluded.meter,
        tempo_bpm = excluded.tempo_bpm,
        mood = excluded.mood,
        instruments = excluded.instruments,
        explicit = excluded.explicit,
        state = 'published',
        published_at = now(),
        updated_at = now();
  end loop;

  delete from public.release_tracks where release_id = p_release_id;
  for v_track in select value from jsonb_array_elements(v_payload->'tracks')
  loop
    insert into public.release_tracks (release_id, track_id, disc_number, position)
    values (
      p_release_id,
      (v_track->>'id')::uuid,
      coalesce((v_track->>'disc_number')::integer, 1),
      (v_track->>'position')::integer
    );
  end loop;

  delete from public.catalog_credits
  where resource_type = 'release' and resource_id = p_release_id;
  for v_credit in select value from jsonb_array_elements(v_payload->'credits')
  loop
    insert into public.catalog_credits (resource_type, resource_id, role, name, position)
    values (
      'release',
      p_release_id,
      v_credit->>'role',
      v_credit->>'name',
      (v_credit->>'position')::integer
    );
  end loop;

  delete from public.release_drafts where release_id = p_release_id;
  insert into public.audit_records (actor_id, event_type, target_type, target_id)
  values (p_actor_id, 'catalog.release_published', 'release', p_release_id);
  return p_release_id;
end;
$$;

revoke all on function public.apply_release_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_release_draft(uuid, uuid) to service_role;

comment on function public.apply_release_draft(uuid, uuid) is
  'Atomically publishes one validated release draft, ordered tracks, and credits.';
