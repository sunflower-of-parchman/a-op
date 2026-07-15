create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.site_config_versions (
  id uuid primary key default gen_random_uuid(),
  installation_key text not null default 'primary',
  status text not null check (status in ('draft', 'published', 'archived')),
  config_schema_version integer not null check (config_schema_version > 0),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint published_timestamp_required check (
    status <> 'published' or published_at is not null
  )
);

create unique index site_config_versions_one_published
  on public.site_config_versions (installation_key)
  where status = 'published';

alter table public.site_config_versions enable row level security;
alter table public.site_config_versions force row level security;

revoke all on table public.site_config_versions from public, anon, authenticated;
grant select on table public.site_config_versions to anon, authenticated;
grant all on table public.site_config_versions to service_role;

create policy "published site configuration is public"
  on public.site_config_versions
  for select
  to anon, authenticated
  using (status = 'published');

create view public.published_site_config
  with (security_invoker = true)
  as
  select id, installation_key, config_schema_version, config, published_at
  from public.site_config_versions
  where status = 'published';

revoke all on table public.published_site_config from public, anon, authenticated;
grant select on table public.published_site_config to anon, authenticated;
grant all on table public.published_site_config to service_role;

comment on table public.site_config_versions is
  'Versioned artist configuration. Public roles can read only the active published row.';
