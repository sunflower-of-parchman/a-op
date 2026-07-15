create type public.app_role as enum ('owner', 'editor', 'customer');
create type public.publication_state as enum ('draft', 'published', 'archived');
create type public.media_kind as enum (
  'artwork',
  'preview_audio',
  'source_audio',
  'download',
  'license_document',
  'lesson_media',
  'administrative'
);
create type public.fulfillment_status as enum ('pending', 'complete', 'failed', 'refunded');
create type public.entitlement_status as enum ('active', 'revoked', 'expired');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index app_roles_role_user_idx on public.app_roles (role, user_id);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  description text not null default '',
  release_date date,
  state public.publication_state not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint releases_published_timestamp check (
    state <> 'published' or published_at is not null
  )
);

create index releases_publication_idx
  on public.releases (state, sort_order, published_at desc);

create table public.media_objects (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.releases (id) on delete set null,
  kind public.media_kind not null,
  bucket_id text not null,
  object_path text not null,
  media_type text not null,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'ready' check (status in ('pending', 'processing', 'ready', 'failed')),
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  constraint media_public_bucket check (
    not is_public or bucket_id in ('artwork', 'preview-media')
  )
);

create index media_objects_release_kind_idx
  on public.media_objects (release_id, kind, status);
create index media_objects_public_idx
  on public.media_objects (is_public, status)
  where is_public;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  product_type text not null check (
    product_type in ('album_download', 'track_download', 'membership', 'license', 'learning')
  ),
  name text not null check (length(name) between 1 and 200),
  description text not null default '',
  resource_type text not null,
  resource_id uuid not null,
  state public.publication_state not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_resource_idx on public.products (resource_type, resource_id);
create index products_publication_idx on public.products (state, product_type);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor >= 0),
  active boolean not null default true,
  external_price_id text,
  created_at timestamptz not null default now(),
  unique (product_id, currency, amount_minor)
);

create index prices_active_product_idx on public.prices (product_id, active);
create unique index prices_external_id_idx
  on public.prices (external_price_id)
  where external_price_id is not null;

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('simulation', 'stripe')),
  provider_event_id text not null,
  customer_id uuid not null references auth.users (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status public.fulfillment_status not null default 'pending',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_provider_event_unique unique (provider, provider_event_id)
);

create index payment_events_customer_received_idx
  on public.payment_events (customer_id, received_at desc);
create index payment_events_status_received_idx
  on public.payment_events (status, received_at);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete restrict,
  payment_event_id uuid not null references public.payment_events (id) on delete restrict,
  status public.fulfillment_status not null default 'pending',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_minor integer not null check (total_minor >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint orders_payment_event_unique unique (payment_event_id)
);

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_amount_minor integer not null check (unit_amount_minor >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_order_product_unique unique (order_id, product_id)
);

create index order_items_resource_idx
  on public.order_items (resource_type, resource_id);

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  source_type text not null check (
    source_type in ('order', 'membership', 'license', 'manual', 'learning')
  ),
  source_id uuid not null,
  status public.entitlement_status not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint entitlement_time_window check (
    expires_at is null or expires_at > starts_at
  ),
  constraint entitlement_revocation_timestamp check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint entitlement_source_unique unique (
    subject_id,
    resource_type,
    resource_id,
    source_type,
    source_id
  )
);

create index entitlement_access_idx
  on public.entitlement_grants (subject_id, resource_type, resource_id, status, expires_at);
create index entitlement_source_idx
  on public.entitlement_grants (source_type, source_id);

create table public.download_records (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  media_object_id uuid not null references public.media_objects (id) on delete restrict,
  entitlement_id uuid not null references public.entitlement_grants (id) on delete restrict,
  delivered_at timestamptz not null default now(),
  request_id uuid not null default gen_random_uuid(),
  unique (request_id)
);

create index downloads_subject_delivered_idx
  on public.download_records (subject_id, delivered_at desc);

create or replace function private.has_role(
  requested_role public.app_role,
  subject_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_roles
    where user_id = subject_id
      and role = requested_role
  );
$$;

revoke all on function private.has_role(public.app_role, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_role(public.app_role, uuid) to authenticated;

create or replace function private.is_content_administrator(subject_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_roles
    where user_id = subject_id
      and role in ('owner', 'editor')
  );
$$;

revoke all on function private.is_content_administrator(uuid) from public;
grant execute on function private.is_content_administrator(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  insert into public.app_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.bootstrap_owner(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null or not exists (
    select 1 from auth.users where id = target_user_id
  ) then
    raise exception 'A valid existing user is required.';
  end if;

  insert into public.app_roles (user_id, role, granted_by)
  values (target_user_id, 'owner', target_user_id)
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.bootstrap_owner(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_owner(uuid) to service_role;

create or replace function public.decide_access(
  target_subject_id uuid,
  target_resource_type text,
  target_resource_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_entitlement public.entitlement_grants%rowtype;
begin
  if exists (
    select 1
    from public.app_roles
    where user_id = target_subject_id
      and role in ('owner', 'editor')
  ) then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'administrator',
      'entitlementId', null
    );
  end if;

  select *
  into matched_entitlement
  from public.entitlement_grants
  where subject_id = target_subject_id
    and resource_type = target_resource_type
    and resource_id = target_resource_id
    and status = 'active'
    and starts_at <= now()
    and (expires_at is null or expires_at > now())
  order by created_at asc
  limit 1;

  if matched_entitlement.id is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', matched_entitlement.source_type,
      'entitlementId', matched_entitlement.id,
      'expiresAt', matched_entitlement.expires_at
    );
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'missing_entitlement',
    'entitlementId', null
  );
end;
$$;

revoke all on function public.decide_access(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.decide_access(uuid, text, uuid) to service_role;

create or replace function public.process_simulated_payment_event(
  p_provider_event_id text,
  p_target_customer_id uuid,
  p_target_product_id uuid,
  p_paid_amount_minor integer,
  p_paid_currency text,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (order_id uuid, entitlement_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_product public.products%rowtype;
  matched_price public.prices%rowtype;
  v_payment_event_id uuid;
  v_payment_was_new boolean;
  v_order_id uuid;
  v_entitlement_id uuid;
begin
  if p_provider_event_id is null or length(trim(p_provider_event_id)) = 0 then
    raise exception 'A provider event identifier is required.';
  end if;

  select * into matched_product
  from public.products
  where id = p_target_product_id
    and state = 'published';

  if matched_product.id is null then
    raise exception 'The product is not available.';
  end if;

  select * into matched_price
  from public.prices
  where product_id = p_target_product_id
    and currency = upper(p_paid_currency)
    and amount_minor = p_paid_amount_minor
    and active
  order by created_at asc
  limit 1;

  if matched_price.id is null then
    raise exception 'The payment amount does not match an active price.';
  end if;

  insert into public.payment_events (
    provider,
    provider_event_id,
    customer_id,
    product_id,
    amount_minor,
    currency,
    payload
  ) values (
    'simulation',
    p_provider_event_id,
    p_target_customer_id,
    p_target_product_id,
    p_paid_amount_minor,
    upper(p_paid_currency),
    coalesce(p_event_payload, '{}'::jsonb)
  )
  on conflict on constraint payment_events_provider_event_unique do nothing
  returning id into v_payment_event_id;

  v_payment_was_new := v_payment_event_id is not null;

  if not v_payment_was_new then
    select existing_event.id into v_payment_event_id
    from public.payment_events as existing_event
    where existing_event.provider = 'simulation'
      and existing_event.provider_event_id = p_provider_event_id;

    if not exists (
      select 1
      from public.payment_events as existing_event
      where existing_event.id = v_payment_event_id
        and existing_event.customer_id = p_target_customer_id
        and existing_event.product_id = p_target_product_id
        and existing_event.amount_minor = p_paid_amount_minor
        and existing_event.currency = upper(p_paid_currency)
    ) then
      raise exception 'The replayed event does not match the original payment facts.';
    end if;
  end if;

  insert into public.orders (
    customer_id,
    payment_event_id,
    status,
    currency,
    total_minor,
    completed_at
  ) values (
    p_target_customer_id,
    v_payment_event_id,
    'complete',
    upper(p_paid_currency),
    p_paid_amount_minor,
    now()
  )
  on conflict on constraint orders_payment_event_unique do update
    set status = 'complete',
        completed_at = coalesce(public.orders.completed_at, excluded.completed_at)
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    resource_type,
    resource_id,
    unit_amount_minor
  ) values (
    v_order_id,
    p_target_product_id,
    matched_product.resource_type,
    matched_product.resource_id,
    p_paid_amount_minor
  )
  on conflict on constraint order_items_order_product_unique do nothing;

  insert into public.entitlement_grants (
    subject_id,
    resource_type,
    resource_id,
    source_type,
    source_id
  ) values (
    p_target_customer_id,
    matched_product.resource_type,
    matched_product.resource_id,
    'order',
    v_order_id
  )
  on conflict on constraint entitlement_source_unique
  do update set status = 'active', revoked_at = null
  returning id into v_entitlement_id;

  update public.payment_events
  set status = 'complete',
      processed_at = coalesce(processed_at, now())
  where id = v_payment_event_id;

  order_id := v_order_id;
  entitlement_id := v_entitlement_id;
  replayed := not v_payment_was_new;
  return next;
end;
$$;

revoke all on function public.process_simulated_payment_event(text, uuid, uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_simulated_payment_event(text, uuid, uuid, integer, text, jsonb)
  to service_role;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.app_roles enable row level security;
alter table public.app_roles force row level security;
alter table public.releases enable row level security;
alter table public.releases force row level security;
alter table public.media_objects enable row level security;
alter table public.media_objects force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.prices enable row level security;
alter table public.prices force row level security;
alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.order_items enable row level security;
alter table public.order_items force row level security;
alter table public.entitlement_grants enable row level security;
alter table public.entitlement_grants force row level security;
alter table public.download_records enable row level security;
alter table public.download_records force row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.app_roles from public, anon, authenticated;
revoke all on table public.releases from public, anon, authenticated;
revoke all on table public.media_objects from public, anon, authenticated;
revoke all on table public.products from public, anon, authenticated;
revoke all on table public.prices from public, anon, authenticated;
revoke all on table public.payment_events from public, anon, authenticated;
revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.order_items from public, anon, authenticated;
revoke all on table public.entitlement_grants from public, anon, authenticated;
revoke all on table public.download_records from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.app_roles to authenticated;
grant select on table public.releases to anon;
grant select, insert, update, delete on table public.releases to authenticated;
grant select on table public.media_objects to anon;
grant select, insert, update, delete on table public.media_objects to authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.prices to anon, authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.entitlement_grants to authenticated;
grant select on table public.download_records to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.app_roles to service_role;
grant all on table public.releases to service_role;
grant all on table public.media_objects to service_role;
grant all on table public.products to service_role;
grant all on table public.prices to service_role;
grant all on table public.payment_events to service_role;
grant all on table public.orders to service_role;
grant all on table public.order_items to service_role;
grant all on table public.entitlement_grants to service_role;
grant all on table public.download_records to service_role;

create policy "people can read their profile"
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.has_role('owner'));

create policy "people can update their profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "people can read their roles"
  on public.app_roles for select to authenticated
  using (user_id = auth.uid() or private.has_role('owner'));

create policy "published releases are public"
  on public.releases for select to anon, authenticated
  using (state = 'published');

create policy "administrators can read all releases"
  on public.releases for select to authenticated
  using (private.is_content_administrator());

create policy "administrators can create releases"
  on public.releases for insert to authenticated
  with check (private.is_content_administrator());

create policy "administrators can update releases"
  on public.releases for update to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "administrators can delete releases"
  on public.releases for delete to authenticated
  using (private.is_content_administrator());

create policy "public media records are readable"
  on public.media_objects for select to anon, authenticated
  using (is_public and status = 'ready');

create policy "administrators can read all media records"
  on public.media_objects for select to authenticated
  using (private.is_content_administrator());

create policy "administrators can create media records"
  on public.media_objects for insert to authenticated
  with check (private.is_content_administrator());

create policy "administrators can update media records"
  on public.media_objects for update to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "administrators can delete media records"
  on public.media_objects for delete to authenticated
  using (private.is_content_administrator());

create policy "published products are public"
  on public.products for select to anon, authenticated
  using (state = 'published');

create policy "published prices are public"
  on public.prices for select to anon, authenticated
  using (
    active and exists (
      select 1 from public.products
      where products.id = prices.product_id
        and products.state = 'published'
    )
  );

create policy "customers can read their orders"
  on public.orders for select to authenticated
  using (customer_id = auth.uid() or private.has_role('owner'));

create policy "customers can read their order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.customer_id = auth.uid() or private.has_role('owner'))
    )
  );

create policy "customers can read their entitlements"
  on public.entitlement_grants for select to authenticated
  using (subject_id = auth.uid() or private.has_role('owner'));

create policy "customers can read their download history"
  on public.download_records for select to authenticated
  using (subject_id = auth.uid() or private.has_role('owner'));

create policy "owners can read every site configuration"
  on public.site_config_versions for select to authenticated
  using (private.has_role('owner'));

create policy "owners can create site configurations"
  on public.site_config_versions for insert to authenticated
  with check (private.has_role('owner'));

create policy "owners can update site configurations"
  on public.site_config_versions for update to authenticated
  using (private.has_role('owner'))
  with check (private.has_role('owner'));

create policy "owners can delete site configurations"
  on public.site_config_versions for delete to authenticated
  using (private.has_role('owner'));

grant insert, update, delete on table public.site_config_versions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artwork', 'artwork', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('preview-media', 'preview-media', true, 104857600, array['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']),
  ('source-audio', 'source-audio', false, 524288000, array['audio/wav', 'audio/aiff', 'audio/x-aiff', 'audio/flac']),
  ('downloads', 'downloads', false, 524288000, null),
  ('license-documents', 'license-documents', false, 52428800, array['application/pdf']),
  ('lesson-media', 'lesson-media', false, 524288000, null),
  ('administrative', 'administrative', false, 52428800, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public storage objects are readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id in ('artwork', 'preview-media'));

create policy "administrators can read managed storage"
  on storage.objects for select to authenticated
  using (private.is_content_administrator());

create policy "administrators can upload managed storage"
  on storage.objects for insert to authenticated
  with check (private.is_content_administrator());

create policy "administrators can update managed storage"
  on storage.objects for update to authenticated
  using (private.is_content_administrator())
  with check (private.is_content_administrator());

create policy "administrators can delete managed storage"
  on storage.objects for delete to authenticated
  using (private.is_content_administrator());

comment on function public.process_simulated_payment_event(text, uuid, uuid, integer, text, jsonb) is
  'Server-only idempotent fulfillment entrypoint used by Integration Gate A.';
comment on function public.decide_access(uuid, text, uuid) is
  'Server-only central access decision for protected resources.';
