create type public.telemetry_consent_mode as enum ('opt_in', 'implied');
create type public.analytics_consent_state as enum ('granted', 'implied');
create type public.analytics_event_name as enum (
  'page_view',
  'media_start',
  'meaningful_listen',
  'catalog_search',
  'product_interest',
  'checkout_start',
  'checkout_complete',
  'download',
  'license_interest',
  'license_complete',
  'course_progress',
  'contact_conversion'
);
create type public.operational_status as enum ('pass', 'action_required', 'fail');
create type public.operational_event_name as enum ('setup_health');

create table public.telemetry_settings (
  id text primary key default 'primary' check (id = 'primary'),
  optional_enabled boolean not null default true,
  consent_mode public.telemetry_consent_mode not null default 'opt_in',
  retention_days integer not null default 90 check (retention_days between 7 and 730),
  meaningful_listen_seconds integer not null default 10
    check (meaningful_listen_seconds between 5 and 120),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.telemetry_settings (id) values ('primary');

create table public.analytics_events (
  id uuid primary key,
  event_name public.analytics_event_name not null,
  session_id uuid not null,
  path text not null check (
    length(path) between 1 and 320
    and path like '/%'
    and path not like '//%'
    and path !~ '[[:cntrl:]]'
  ),
  resource_type text check (
    resource_type is null
    or resource_type in (
      'page', 'track', 'release', 'collection', 'product', 'license_offer', 'lesson', 'contact'
    )
  ),
  resource_key text check (
    resource_key is null
    or (
      length(resource_key) between 1 and 160
      and resource_key ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    )
  ),
  value integer check (value is null or value between 0 and 1000000),
  consent_state public.analytics_consent_state not null,
  occurred_at timestamptz not null default now(),
  check ((resource_type is null) = (resource_key is null))
);

create index analytics_events_time_idx on public.analytics_events (occurred_at desc);
create index analytics_events_name_time_idx
  on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_resource_time_idx
  on public.analytics_events (resource_type, resource_key, occurred_at desc)
  where resource_type is not null;

create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_name public.operational_event_name not null,
  check_key text not null check (check_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  status public.operational_status not null,
  summary text not null check (length(summary) between 1 and 240),
  safe_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_details) = 'object' and pg_column_size(safe_details) <= 4096),
  occurred_at timestamptz not null default now()
);

create index operational_events_name_time_idx
  on public.operational_events (event_name, occurred_at desc);

create table public.operational_checks (
  id text primary key check (id ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  status public.operational_status not null,
  summary text not null check (length(summary) between 1 and 240),
  safe_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_details) = 'object' and pg_column_size(safe_details) <= 4096),
  checked_at timestamptz not null default now()
);

create table public.installation_metadata (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  value text not null check (length(value) between 1 and 160),
  updated_at timestamptz not null default now()
);

insert into public.installation_metadata (key, value)
values
  ('schema_version', '20260715070000'),
  ('contact_adapter', 'local_capture');

create or replace function public.record_analytics_event(
  p_event_id uuid,
  p_event_name public.analytics_event_name,
  p_session_id uuid,
  p_path text,
  p_resource_type text,
  p_resource_key text,
  p_value integer,
  p_consent_state public.analytics_consent_state
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.telemetry_settings%rowtype;
  v_inserted integer;
begin
  select * into v_settings from public.telemetry_settings where id = 'primary';
  if v_settings.id is null or not v_settings.optional_enabled then
    return false;
  end if;
  if v_settings.consent_mode = 'opt_in' and p_consent_state <> 'granted' then
    return false;
  end if;

  delete from public.analytics_events
  where occurred_at < now() - make_interval(days => v_settings.retention_days);

  insert into public.analytics_events (
    id,
    event_name,
    session_id,
    path,
    resource_type,
    resource_key,
    value,
    consent_state
  )
  values (
    p_event_id,
    p_event_name,
    p_session_id,
    trim(p_path),
    p_resource_type,
    p_resource_key,
    p_value,
    p_consent_state
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.save_telemetry_settings(
  p_actor_id uuid,
  p_optional_enabled boolean,
  p_consent_mode public.telemetry_consent_mode,
  p_retention_days integer,
  p_meaningful_listen_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.app_roles where user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Only an owner can change telemetry settings.';
  end if;
  if p_retention_days not between 7 and 730
    or p_meaningful_listen_seconds not between 5 and 120 then
    raise exception 'Telemetry settings are outside their supported bounds.';
  end if;

  update public.telemetry_settings
  set optional_enabled = p_optional_enabled,
      consent_mode = p_consent_mode,
      retention_days = p_retention_days,
      meaningful_listen_seconds = p_meaningful_listen_seconds,
      updated_by = p_actor_id,
      updated_at = now()
  where id = 'primary';

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (
    p_actor_id,
    'telemetry.settings_saved',
    'telemetry_settings',
    null,
    jsonb_build_object(
      'optionalEnabled', p_optional_enabled,
      'consentMode', p_consent_mode,
      'retentionDays', p_retention_days,
      'meaningfulListenSeconds', p_meaningful_listen_seconds
    )
  );
end;
$$;

create or replace function public.prune_analytics_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention integer;
  v_deleted integer;
begin
  select retention_days into v_retention
  from public.telemetry_settings
  where id = 'primary';

  delete from public.analytics_events
  where occurred_at < now() - make_interval(days => coalesce(v_retention, 90));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.record_operational_event(
  p_event_name public.operational_event_name,
  p_check_key text,
  p_status public.operational_status,
  p_summary text,
  p_safe_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.operational_events (
    event_name,
    check_key,
    status,
    summary,
    safe_details
  )
  values (
    p_event_name,
    trim(p_check_key),
    p_status,
    trim(p_summary),
    coalesce(p_safe_details, '{}'::jsonb)
  )
  returning id into v_id;

  insert into public.operational_checks (id, status, summary, safe_details, checked_at)
  values (
    trim(p_check_key),
    p_status,
    trim(p_summary),
    coalesce(p_safe_details, '{}'::jsonb),
    now()
  )
  on conflict (id) do update
  set status = excluded.status,
      summary = excluded.summary,
      safe_details = excluded.safe_details,
      checked_at = excluded.checked_at;

  return v_id;
end;
$$;

alter table public.telemetry_settings enable row level security;
alter table public.telemetry_settings force row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;
alter table public.operational_events enable row level security;
alter table public.operational_events force row level security;
alter table public.operational_checks enable row level security;
alter table public.operational_checks force row level security;
alter table public.installation_metadata enable row level security;
alter table public.installation_metadata force row level security;

revoke all on table public.telemetry_settings from public, anon, authenticated;
revoke all on table public.analytics_events from public, anon, authenticated;
revoke all on table public.operational_events from public, anon, authenticated;
revoke all on table public.operational_checks from public, anon, authenticated;
revoke all on table public.installation_metadata from public, anon, authenticated;

grant select, insert, update, delete on table public.telemetry_settings to service_role;
grant select, insert, update, delete on table public.analytics_events to service_role;
grant select, insert, update, delete on table public.operational_events to service_role;
grant select, insert, update, delete on table public.operational_checks to service_role;
grant select, insert, update, delete on table public.installation_metadata to service_role;

revoke all on function public.record_analytics_event(
  uuid, public.analytics_event_name, uuid, text, text, text, integer,
  public.analytics_consent_state
) from public, anon, authenticated;
revoke all on function public.save_telemetry_settings(
  uuid, boolean, public.telemetry_consent_mode, integer, integer
) from public, anon, authenticated;
revoke all on function public.prune_analytics_events() from public, anon, authenticated;
revoke all on function public.record_operational_event(
  public.operational_event_name, text, public.operational_status, text, jsonb
) from public, anon, authenticated;

grant execute on function public.record_analytics_event(
  uuid, public.analytics_event_name, uuid, text, text, text, integer,
  public.analytics_consent_state
) to service_role;
grant execute on function public.save_telemetry_settings(
  uuid, boolean, public.telemetry_consent_mode, integer, integer
) to service_role;
grant execute on function public.prune_analytics_events() to service_role;
grant execute on function public.record_operational_event(
  public.operational_event_name, text, public.operational_status, text, jsonb
) to service_role;

comment on table public.analytics_events is
  'Optional first-party audience events with session-only identifiers and allowlisted fields.';
comment on table public.operational_events is
  'Required redacted setup-health facts kept separate from optional audience analytics.';
