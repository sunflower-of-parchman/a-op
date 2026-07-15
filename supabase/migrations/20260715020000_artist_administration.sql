alter table public.site_config_versions
  add column updated_by uuid references auth.users (id) on delete set null,
  add column supersedes_id uuid references public.site_config_versions (id) on delete set null;

create index site_config_versions_status_created_idx
  on public.site_config_versions (installation_key, status, created_at desc);

create unique index site_config_versions_one_draft
  on public.site_config_versions (installation_key)
  where status = 'draft';

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  navigation_label text check (navigation_label is null or length(navigation_label) between 1 and 60),
  status public.publication_state not null default 'draft',
  seo jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  supersedes_id uuid references public.pages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint pages_published_timestamp check (
    status <> 'published' or published_at is not null
  )
);

create unique index pages_one_published_slug
  on public.pages (slug)
  where status = 'published';
create unique index pages_one_draft_slug
  on public.pages (slug)
  where status = 'draft';
create index pages_status_slug_idx on public.pages (status, slug, updated_at desc);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 320),
  message text not null check (length(message) between 10 and 5000),
  consent boolean not null default false,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_fingerprint_idx
  on public.contact_messages (request_fingerprint, created_at desc);

create table public.audit_records (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (length(event_type) between 1 and 120),
  target_type text not null check (length(target_type) between 1 and 80),
  target_id uuid,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_records_created_idx on public.audit_records (created_at desc);
create index audit_records_target_idx
  on public.audit_records (target_type, target_id, created_at desc);

create or replace function public.publish_site_config(
  p_version_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_installation_key text;
begin
  if not exists (
    select 1 from public.app_roles
    where user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Only an owner can publish site configuration.';
  end if;

  select installation_key into target_installation_key
  from public.site_config_versions
  where id = p_version_id and status = 'draft'
  for update;

  if target_installation_key is null then
    raise exception 'The draft configuration does not exist.';
  end if;

  update public.site_config_versions
  set status = 'archived'
  where installation_key = target_installation_key
    and status = 'published';

  update public.site_config_versions
  set status = 'published',
      published_at = now(),
      updated_by = p_actor_id
  where id = p_version_id;

  insert into public.audit_records (actor_id, event_type, target_type, target_id)
  values (p_actor_id, 'site_config.published', 'site_config_version', p_version_id);

  return p_version_id;
end;
$$;

revoke all on function public.publish_site_config(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_site_config(uuid, uuid) to service_role;

create or replace function public.publish_page(
  p_page_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_slug text;
begin
  if not exists (
    select 1 from public.app_roles
    where user_id = p_actor_id and role in ('owner', 'editor')
  ) then
    raise exception 'Only an owner or editor can publish a page.';
  end if;

  select slug into target_slug
  from public.pages
  where id = p_page_id and status = 'draft'
  for update;

  if target_slug is null then
    raise exception 'The draft page does not exist.';
  end if;

  update public.pages
  set status = 'archived'
  where slug = target_slug
    and status = 'published';

  update public.pages
  set status = 'published',
      published_at = now(),
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_page_id;

  insert into public.audit_records (actor_id, event_type, target_type, target_id)
  values (p_actor_id, 'page.published', 'page', p_page_id);

  return p_page_id;
end;
$$;

revoke all on function public.publish_page(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_page(uuid, uuid) to service_role;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_message text,
  p_consent boolean,
  p_request_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_id uuid;
begin
  if not p_consent then
    raise exception 'Contact storage consent is required.';
  end if;

  if (
    select count(*)
    from public.contact_messages
    where request_fingerprint = p_request_fingerprint
      and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Contact message rate limit exceeded.';
  end if;

  insert into public.contact_messages (name, email, message, consent, request_fingerprint)
  values (trim(p_name), lower(trim(p_email)), trim(p_message), p_consent, p_request_fingerprint)
  returning id into message_id;

  return message_id;
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, boolean, text)
  to service_role;

alter table public.pages enable row level security;
alter table public.pages force row level security;
alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;
alter table public.audit_records enable row level security;
alter table public.audit_records force row level security;

revoke all on table public.pages from public, anon, authenticated;
revoke all on table public.contact_messages from public, anon, authenticated;
revoke all on table public.audit_records from public, anon, authenticated;

grant select on table public.pages to anon, authenticated;
grant insert, update, delete on table public.pages to authenticated;
grant select on table public.contact_messages to authenticated;
grant update (status) on table public.contact_messages to authenticated;
grant select on table public.audit_records to authenticated;

grant all on table public.pages to service_role;
grant all on table public.contact_messages to service_role;
grant all on table public.audit_records to service_role;

create policy "published pages are public"
  on public.pages for select to anon, authenticated
  using (status = 'published');

create policy "administrators can read all pages"
  on public.pages for select to authenticated
  using (private.is_content_administrator());

create policy "administrators can create pages"
  on public.pages for insert to authenticated
  with check (private.is_content_administrator());

create policy "administrators can update pages"
  on public.pages for update to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "administrators can delete draft pages"
  on public.pages for delete to authenticated
  using (private.is_content_administrator() and status = 'draft');

create policy "owners can read contact messages"
  on public.contact_messages for select to authenticated
  using (private.has_role('owner'));

create policy "owners can update contact messages"
  on public.contact_messages for update to authenticated
  using (private.has_role('owner'))
  with check (private.has_role('owner'));

create policy "owners can read audit records"
  on public.audit_records for select to authenticated
  using (private.has_role('owner'));

comment on table public.pages is
  'Versioned structured pages. Public roles read only the current published version.';
comment on table public.contact_messages is
  'Server-created contact requests with hashed request fingerprints and no automatic email send.';
