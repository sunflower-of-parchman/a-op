create table public.collection_drafts (
  collection_id uuid primary key references public.collections (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collection_drafts enable row level security;
alter table public.collection_drafts force row level security;
revoke all on table public.collection_drafts from public, anon, authenticated;
grant all on table public.collection_drafts to service_role;

create or replace function public.apply_collection_draft(
  p_collection_id uuid,
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
begin
  if not exists (
    select 1 from public.app_roles
    where user_id = p_actor_id and role in ('owner', 'editor')
  ) then
    raise exception 'Only an owner or editor can publish a collection.';
  end if;

  select payload into v_payload
  from public.collection_drafts
  where collection_id = p_collection_id
  for update;

  if v_payload is null then
    raise exception 'The collection draft does not exist.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload->'tracks') as item(value)
    left join public.tracks on tracks.id = (item.value->>'track_id')::uuid
    where tracks.id is null or tracks.state <> 'published'
  ) then
    raise exception 'Every collection track must be published first.';
  end if;

  update public.collections
  set slug = v_payload->>'slug',
      title = v_payload->>'title',
      description = coalesce(v_payload->>'description', ''),
      state = 'published',
      published_at = now(),
      updated_at = now()
  where id = p_collection_id;

  if not found then
    raise exception 'The collection does not exist.';
  end if;

  delete from public.collection_tracks where collection_id = p_collection_id;
  for v_track in select value from jsonb_array_elements(v_payload->'tracks')
  loop
    insert into public.collection_tracks (collection_id, track_id, position, note)
    values (
      p_collection_id,
      (v_track->>'track_id')::uuid,
      (v_track->>'position')::integer,
      coalesce(v_track->>'note', '')
    );
  end loop;

  delete from public.collection_drafts where collection_id = p_collection_id;
  insert into public.audit_records (actor_id, event_type, target_type, target_id)
  values (p_actor_id, 'catalog.collection_published', 'collection', p_collection_id);
  return p_collection_id;
end;
$$;

revoke all on function public.apply_collection_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_collection_draft(uuid, uuid) to service_role;

comment on table public.collection_drafts is
  'Private ordered collection proposals applied atomically only after explicit publication.';
