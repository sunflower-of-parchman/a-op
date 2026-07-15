create or replace function public.replace_playlist(
  p_playlist_id uuid,
  p_owner_id uuid,
  p_title text,
  p_description text,
  p_track_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track_ids uuid[] := coalesce(p_track_ids, '{}'::uuid[]);
begin
  if length(trim(p_title)) < 1 or length(trim(p_title)) > 120 then
    raise exception 'The playlist title is invalid.';
  end if;
  if length(coalesce(p_description, '')) > 1000 then
    raise exception 'The playlist description is too long.';
  end if;
  if cardinality(v_track_ids) > 1000 then
    raise exception 'The playlist is too large.';
  end if;
  if cardinality(v_track_ids) <> (
    select count(distinct track_id) from unnest(v_track_ids) as track_id
  ) then
    raise exception 'A track can appear only once per playlist.';
  end if;
  if exists (
    select 1
    from unnest(v_track_ids) as requested(track_id)
    left join public.tracks on tracks.id = requested.track_id
    where tracks.id is null or tracks.state <> 'published'
  ) then
    raise exception 'Every playlist track must be published.';
  end if;

  update public.playlists
  set title = trim(p_title),
      description = coalesce(p_description, ''),
      updated_at = now()
  where id = p_playlist_id and owner_id = p_owner_id;
  if not found then
    raise exception 'The playlist does not belong to this account.';
  end if;

  delete from public.playlist_tracks where playlist_id = p_playlist_id;
  if cardinality(v_track_ids) > 0 then
    for v_position in 1..cardinality(v_track_ids)
    loop
      insert into public.playlist_tracks (playlist_id, track_id, position)
      values (p_playlist_id, v_track_ids[v_position], v_position);
    end loop;
  end if;
  return p_playlist_id;
end;
$$;

revoke all on function public.replace_playlist(uuid, uuid, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.replace_playlist(uuid, uuid, text, text, uuid[])
  to service_role;

comment on function public.replace_playlist(uuid, uuid, text, text, uuid[]) is
  'Server-only atomic replacement of one customer-owned playlist and its authored order.';
