create table public.license_templates (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 160),
  summary text not null default '' check (length(summary) <= 2000),
  state public.publication_state not null default 'draft',
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id)
);

create table public.license_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.license_templates (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null check (length(title) between 1 and 200),
  introduction text not null check (length(introduction) between 1 and 4000),
  general_terms jsonb not null check (jsonb_typeof(general_terms) = 'array'),
  disclaimer text not null check (length(disclaimer) between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

alter table public.license_templates
  add constraint license_templates_current_version_fkey
  foreign key (current_version_id) references public.license_template_versions (id) on delete restrict;

create index license_templates_publication_idx
  on public.license_templates (state, updated_at desc);
create index license_template_versions_template_idx
  on public.license_template_versions (template_id, version_number desc);

create table public.license_options (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.license_template_versions (id) on delete restrict,
  option_key text not null check (option_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (length(label) between 1 and 160),
  description text not null check (length(description) between 1 and 2000),
  usage_category text not null check (length(usage_category) between 1 and 120),
  allowed_media text[] not null check (cardinality(allowed_media) > 0),
  audience_label text not null check (length(audience_label) between 1 and 160),
  max_audience integer check (max_audience is null or max_audience > 0),
  distribution_label text not null check (length(distribution_label) between 1 and 200),
  max_copies integer check (max_copies is null or max_copies > 0),
  term_months integer not null check (term_months > 0),
  territory text not null check (length(territory) between 1 and 160),
  attribution_required boolean not null default true,
  attribution_text text not null default '' check (length(attribution_text) <= 500),
  exclusive boolean not null default false check (not exclusive),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_version_id, option_key)
);

create index license_options_version_order_idx
  on public.license_options (template_version_id, sort_order, label);

create table public.license_offers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.license_templates (id) on delete restrict,
  template_version_id uuid not null references public.license_template_versions (id) on delete restrict,
  option_id uuid not null references public.license_options (id) on delete restrict,
  track_id uuid not null references public.tracks (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  price_id uuid not null references public.prices (id) on delete restrict,
  state public.publication_state not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_version_id, option_id, track_id),
  unique (product_id),
  unique (price_id)
);

create index license_offers_track_state_idx
  on public.license_offers (track_id, state, created_at desc);

create table public.license_selections (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete restrict,
  offer_id uuid not null references public.license_offers (id) on delete restrict,
  template_version_id uuid not null references public.license_template_versions (id) on delete restrict,
  option_id uuid not null references public.license_options (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  price_id uuid not null references public.prices (id) on delete restrict,
  licensee_name text not null check (length(licensee_name) between 1 and 200),
  project_title text not null check (length(project_title) between 1 and 240),
  project_description text not null check (length(project_description) between 10 and 3000),
  terms_snapshot jsonb not null check (jsonb_typeof(terms_snapshot) = 'object'),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open'
    check (status in ('open', 'purchased', 'canceled', 'refunded')),
  created_at timestamptz not null default now(),
  purchased_at timestamptz
);

create index license_selections_subject_created_idx
  on public.license_selections (subject_id, created_at desc);

alter table public.checkout_intents
  add column license_selection_id uuid references public.license_selections (id) on delete restrict;

create unique index checkout_intents_license_selection_idx
  on public.checkout_intents (license_selection_id)
  where license_selection_id is not null;

create table public.issued_licenses (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null unique references public.license_selections (id) on delete restrict,
  subject_id uuid not null references auth.users (id) on delete restrict,
  track_id uuid not null references public.tracks (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  template_version_id uuid not null references public.license_template_versions (id) on delete restrict,
  option_id uuid not null references public.license_options (id) on delete restrict,
  terms_snapshot jsonb not null check (jsonb_typeof(terms_snapshot) = 'object'),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  document_status text not null default 'queued'
    check (document_status in ('queued', 'processing', 'ready', 'failed')),
  document_media_id uuid references public.media_objects (id) on delete restrict,
  document_failure_code text,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint issued_licenses_revoked_timestamp check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint issued_licenses_ready_document check (
    document_status <> 'ready' or document_media_id is not null
  )
);

create index issued_licenses_subject_issued_idx
  on public.issued_licenses (subject_id, issued_at desc);
create index issued_licenses_document_status_idx
  on public.issued_licenses (document_status, updated_at);

create table public.license_document_jobs (
  id uuid primary key default gen_random_uuid(),
  issued_license_id uuid not null unique references public.issued_licenses (id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'complete', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index license_document_jobs_claim_idx
  on public.license_document_jobs (status, lease_expires_at, created_at);

create or replace function private.prevent_license_terms_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Published license versions and options are immutable. Create a new version.';
end;
$$;

revoke all on function private.prevent_license_terms_mutation() from public;

create trigger prevent_license_template_version_update
  before update or delete on public.license_template_versions
  for each row execute function private.prevent_license_terms_mutation();

create trigger prevent_license_option_update
  before update or delete on public.license_options
  for each row execute function private.prevent_license_terms_mutation();

create or replace function public.publish_license_template_version(
  p_actor_id uuid,
  p_template_id uuid,
  p_track_id uuid,
  p_slug text,
  p_name text,
  p_summary text,
  p_title text,
  p_introduction text,
  p_general_terms jsonb,
  p_disclaimer text,
  p_options jsonb
)
returns table (template_id uuid, version_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_version_id uuid := gen_random_uuid();
  v_version_number integer;
  v_option jsonb;
  v_option_id uuid;
  v_offer_id uuid;
  v_product_id uuid;
  v_price_id uuid;
  v_option_key text;
  v_allowed_media text[];
  v_currency text;
  v_amount_minor integer;
  v_sort_order integer := 0;
begin
  if not exists (
    select 1 from public.app_roles where user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Only an owner can publish licensing terms and prices.';
  end if;
  if not exists (
    select 1 from public.tracks where id = p_track_id and state = 'published'
  ) then
    raise exception 'A published track is required.';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'The template slug is invalid.';
  end if;
  if jsonb_typeof(p_general_terms) <> 'array' or jsonb_array_length(p_general_terms) = 0 then
    raise exception 'At least one plain-language general term is required.';
  end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
    raise exception 'At least one supported license option is required.';
  end if;

  if p_template_id is null then
    insert into public.license_templates (
      track_id, slug, name, summary, state, created_by
    ) values (
      p_track_id, trim(p_slug), trim(p_name), trim(p_summary), 'published', p_actor_id
    ) returning id into v_template_id;
  else
    select id into v_template_id
    from public.license_templates
    where id = p_template_id and track_id = p_track_id
    for update;
    if v_template_id is null then
      raise exception 'The license template does not match this track.';
    end if;

    update public.license_templates
    set slug = trim(p_slug),
        name = trim(p_name),
        summary = trim(p_summary),
        state = 'published',
        updated_at = now()
    where id = v_template_id;

    update public.license_offers as offer
    set state = 'archived', updated_at = now()
    where offer.template_id = v_template_id and offer.state <> 'archived';

    update public.products as product
    set state = 'archived', published_at = null, updated_at = now()
    where product.id in (
      select offer.product_id from public.license_offers as offer
      where offer.template_id = v_template_id
    );
  end if;

  select coalesce(max(version.version_number), 0) + 1 into v_version_number
  from public.license_template_versions as version
  where version.template_id = v_template_id;

  insert into public.license_template_versions (
    id, template_id, version_number, title, introduction, general_terms, disclaimer, created_by
  ) values (
    v_version_id,
    v_template_id,
    v_version_number,
    trim(p_title),
    trim(p_introduction),
    p_general_terms,
    trim(p_disclaimer),
    p_actor_id
  );

  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_sort_order := v_sort_order + 1;
    v_option_key := trim(v_option ->> 'key');
    v_allowed_media := array(
      select trim(value) from jsonb_array_elements_text(v_option -> 'allowedMedia')
    );
    v_currency := upper(trim(v_option ->> 'currency'));
    v_amount_minor := (v_option ->> 'amountMinor')::integer;

    if v_option_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or cardinality(v_allowed_media) = 0
      or v_currency !~ '^[A-Z]{3}$'
      or v_amount_minor <= 0
      or coalesce((v_option ->> 'termMonths')::integer, 0) <= 0
    then
      raise exception 'A license option is incomplete or invalid.';
    end if;
    if coalesce((v_option ->> 'exclusive')::boolean, false) then
      raise exception 'Exclusive licensing requires an inquiry and cannot be published as checkout.';
    end if;

    v_option_id := gen_random_uuid();
    v_offer_id := gen_random_uuid();
    v_product_id := gen_random_uuid();
    v_price_id := gen_random_uuid();

    insert into public.license_options (
      id,
      template_version_id,
      option_key,
      label,
      description,
      usage_category,
      allowed_media,
      audience_label,
      max_audience,
      distribution_label,
      max_copies,
      term_months,
      territory,
      attribution_required,
      attribution_text,
      exclusive,
      currency,
      amount_minor,
      sort_order
    ) values (
      v_option_id,
      v_version_id,
      v_option_key,
      trim(v_option ->> 'label'),
      trim(v_option ->> 'description'),
      trim(v_option ->> 'usageCategory'),
      v_allowed_media,
      trim(v_option ->> 'audienceLabel'),
      nullif(v_option ->> 'maxAudience', '')::integer,
      trim(v_option ->> 'distributionLabel'),
      nullif(v_option ->> 'maxCopies', '')::integer,
      (v_option ->> 'termMonths')::integer,
      trim(v_option ->> 'territory'),
      coalesce((v_option ->> 'attributionRequired')::boolean, true),
      trim(coalesce(v_option ->> 'attributionText', '')),
      false,
      v_currency,
      v_amount_minor,
      coalesce((v_option ->> 'sortOrder')::integer, v_sort_order)
    );

    insert into public.products (
      id,
      slug,
      product_type,
      name,
      description,
      resource_type,
      resource_id,
      state,
      purchase_mode,
      sort_order,
      published_at,
      created_by
    ) values (
      v_product_id,
      trim(p_slug) || '-' || v_option_key || '-v' || v_version_number,
      'license',
      trim(p_name) || ': ' || trim(v_option ->> 'label'),
      trim(v_option ->> 'description'),
      'license_offer',
      v_offer_id,
      'published',
      'stripe',
      coalesce((v_option ->> 'sortOrder')::integer, v_sort_order),
      now(),
      p_actor_id
    );

    insert into public.prices (
      id, product_id, currency, amount_minor, active, billing_interval
    ) values (
      v_price_id, v_product_id, v_currency, v_amount_minor, true, 'one_time'
    );

    insert into public.license_offers (
      id,
      template_id,
      template_version_id,
      option_id,
      track_id,
      product_id,
      price_id,
      state
    ) values (
      v_offer_id,
      v_template_id,
      v_version_id,
      v_option_id,
      p_track_id,
      v_product_id,
      v_price_id,
      'published'
    );
  end loop;

  update public.license_templates
  set current_version_id = v_version_id, state = 'published', updated_at = now()
  where id = v_template_id;

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (
    p_actor_id,
    'licensing.template_published',
    'license_template',
    v_template_id,
    jsonb_build_object('version', v_version_number, 'optionCount', jsonb_array_length(p_options))
  );

  template_id := v_template_id;
  version_id := v_version_id;
  return next;
end;
$$;

create or replace function public.create_license_selection(
  p_subject_id uuid,
  p_offer_id uuid,
  p_licensee_name text,
  p_project_title text,
  p_project_description text
)
returns table (
  selection_id uuid,
  product_id uuid,
  price_id uuid,
  amount_minor integer,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer record;
  v_artist_name text;
  v_snapshot jsonb;
begin
  if not exists (select 1 from auth.users where id = p_subject_id) then
    raise exception 'A verified customer account is required.';
  end if;
  if length(trim(p_licensee_name)) not between 1 and 200
    or length(trim(p_project_title)) not between 1 and 240
    or length(trim(p_project_description)) not between 10 and 3000
  then
    raise exception 'The licensee and project details are incomplete.';
  end if;

  select
    offer.id,
    offer.product_id,
    offer.price_id,
    offer.track_id,
    template.id as template_id,
    template.name as template_name,
    version.id as version_id,
    version.version_number,
    version.title as license_title,
    version.introduction,
    version.general_terms,
    version.disclaimer,
    option.id as option_id,
    option.option_key,
    option.label as option_label,
    option.description as option_description,
    option.usage_category,
    option.allowed_media,
    option.audience_label,
    option.max_audience,
    option.distribution_label,
    option.max_copies,
    option.term_months,
    option.territory,
    option.attribution_required,
    option.attribution_text,
    option.exclusive,
    option.currency,
    option.amount_minor,
    track.title as track_title
  into v_offer
  from public.license_offers as offer
  join public.license_templates as template on template.id = offer.template_id
  join public.license_template_versions as version on version.id = offer.template_version_id
  join public.license_options as option on option.id = offer.option_id
  join public.tracks as track on track.id = offer.track_id
  join public.products as product on product.id = offer.product_id
  join public.prices as price on price.id = offer.price_id
  where offer.id = p_offer_id
    and offer.state = 'published'
    and template.state = 'published'
    and template.current_version_id = offer.template_version_id
    and track.state = 'published'
    and product.state = 'published'
    and price.active
    and price.amount_minor = option.amount_minor
    and price.currency = option.currency;

  if v_offer.id is null then
    raise exception 'This license option is not available.';
  end if;

  select config #>> '{identity,name}' into v_artist_name
  from public.site_config_versions
  where installation_key = 'primary' and status = 'published'
  limit 1;

  v_snapshot := jsonb_build_object(
    'artistName', coalesce(v_artist_name, 'The artist'),
    'templateName', v_offer.template_name,
    'templateVersion', v_offer.version_number,
    'licenseTitle', v_offer.license_title,
    'introduction', v_offer.introduction,
    'generalTerms', v_offer.general_terms,
    'disclaimer', v_offer.disclaimer,
    'track', jsonb_build_object('id', v_offer.track_id, 'title', v_offer.track_title),
    'option', jsonb_build_object(
      'id', v_offer.option_id,
      'key', v_offer.option_key,
      'label', v_offer.option_label,
      'description', v_offer.option_description,
      'usageCategory', v_offer.usage_category,
      'allowedMedia', to_jsonb(v_offer.allowed_media),
      'audienceLabel', v_offer.audience_label,
      'maxAudience', v_offer.max_audience,
      'distributionLabel', v_offer.distribution_label,
      'maxCopies', v_offer.max_copies,
      'termMonths', v_offer.term_months,
      'territory', v_offer.territory,
      'attributionRequired', v_offer.attribution_required,
      'attributionText', v_offer.attribution_text,
      'exclusive', v_offer.exclusive
    ),
    'licensee', jsonb_build_object(
      'name', trim(p_licensee_name),
      'projectTitle', trim(p_project_title),
      'projectDescription', trim(p_project_description)
    ),
    'price', jsonb_build_object(
      'amountMinor', v_offer.amount_minor,
      'currency', v_offer.currency
    )
  );

  insert into public.license_selections (
    subject_id,
    offer_id,
    template_version_id,
    option_id,
    product_id,
    price_id,
    licensee_name,
    project_title,
    project_description,
    terms_snapshot,
    amount_minor,
    currency
  ) values (
    p_subject_id,
    v_offer.id,
    v_offer.version_id,
    v_offer.option_id,
    v_offer.product_id,
    v_offer.price_id,
    trim(p_licensee_name),
    trim(p_project_title),
    trim(p_project_description),
    v_snapshot,
    v_offer.amount_minor,
    v_offer.currency
  ) returning id into selection_id;

  product_id := v_offer.product_id;
  price_id := v_offer.price_id;
  amount_minor := v_offer.amount_minor;
  currency := v_offer.currency;
  return next;
end;
$$;

create or replace function private.issue_license_from_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_type text;
  v_order public.orders%rowtype;
  v_selection public.license_selections%rowtype;
  v_track_id uuid;
  v_license_id uuid;
begin
  select product_type into v_product_type
  from public.products
  where id = new.product_id;
  if v_product_type <> 'license' then
    return new;
  end if;

  select * into v_order from public.orders where id = new.order_id;
  if v_order.checkout_intent_id is null then
    raise exception 'A license order requires its checkout intent.';
  end if;

  select selection.* into v_selection
  from public.checkout_intents as intent
  join public.license_selections as selection on selection.id = intent.license_selection_id
  where intent.id = v_order.checkout_intent_id
    and intent.subject_id = v_order.customer_id;

  if v_selection.id is null
    or v_selection.status <> 'open'
    or v_selection.product_id <> new.product_id
    or v_selection.amount_minor <> new.unit_amount_minor
    or v_selection.currency <> v_order.currency
  then
    raise exception 'The license selection does not match the paid order.';
  end if;

  select track_id into v_track_id
  from public.license_offers
  where id = v_selection.offer_id
    and product_id = v_selection.product_id
    and price_id = v_selection.price_id;
  if v_track_id is null then
    raise exception 'The paid license offer no longer reconciles.';
  end if;

  insert into public.issued_licenses (
    selection_id,
    subject_id,
    track_id,
    order_id,
    template_version_id,
    option_id,
    terms_snapshot,
    amount_minor,
    currency
  ) values (
    v_selection.id,
    v_order.customer_id,
    v_track_id,
    v_order.id,
    v_selection.template_version_id,
    v_selection.option_id,
    v_selection.terms_snapshot,
    v_selection.amount_minor,
    v_selection.currency
  ) returning id into v_license_id;

  update public.license_selections
  set status = 'purchased', purchased_at = now()
  where id = v_selection.id;

  insert into public.license_document_jobs (issued_license_id)
  values (v_license_id);

  insert into public.entitlement_grants (
    subject_id, resource_type, resource_id, source_type, source_id
  ) values (
    v_order.customer_id, 'issued_license', v_license_id, 'license', v_license_id
  );

  return new;
end;
$$;

revoke all on function private.issue_license_from_order_item() from public;

create trigger issue_license_after_order_item
  after insert on public.order_items
  for each row execute function private.issue_license_from_order_item();

create or replace function private.revoke_refunded_license()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'refunded' and old.status <> 'refunded' then
    update public.issued_licenses
    set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
    where order_id = new.id and status <> 'revoked';

    update public.entitlement_grants
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where source_type = 'license'
      and source_id in (select id from public.issued_licenses where order_id = new.id)
      and status <> 'revoked';

    update public.license_selections
    set status = 'refunded'
    where id in (select selection_id from public.issued_licenses where order_id = new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.revoke_refunded_license() from public;

create trigger revoke_license_after_full_refund
  after update of status on public.orders
  for each row execute function private.revoke_refunded_license();

create or replace function public.claim_license_document_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lease_token uuid,
  license_id uuid,
  object_path text,
  document_payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.license_document_jobs%rowtype;
  v_license public.issued_licenses%rowtype;
begin
  if length(trim(p_worker_id)) = 0 or p_lease_seconds not between 30 and 1800 then
    raise exception 'The document-worker lease is invalid.';
  end if;

  select job.* into v_job
  from public.license_document_jobs as job
  where job.status in ('queued', 'processing')
    and (job.status = 'queued' or job.lease_expires_at < now())
  order by job.created_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return;
  end if;

  update public.license_document_jobs
  set status = 'processing',
      attempts = attempts + 1,
      worker_id = trim(p_worker_id),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      error_code = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  select * into v_license
  from public.issued_licenses
  where id = v_job.issued_license_id and status = 'active';
  if v_license.id is null then
    update public.license_document_jobs
    set status = 'failed', error_code = 'license_inactive', updated_at = now()
    where id = v_job.id;
    return;
  end if;

  update public.issued_licenses
  set document_status = 'processing', document_failure_code = null, updated_at = now()
  where id = v_license.id;

  job_id := v_job.id;
  lease_token := v_job.lease_token;
  license_id := v_license.id;
  object_path := 'licenses/' || v_license.subject_id || '/' || v_license.id || '.pdf';
  document_payload := v_license.terms_snapshot || jsonb_build_object(
    'licenseId', v_license.id,
    'orderId', v_license.order_id,
    'issuedAt', v_license.issued_at,
    'amountMinor', v_license.amount_minor,
    'currency', v_license.currency
  );
  return next;
end;
$$;

create or replace function public.complete_license_document_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_object_path text,
  p_byte_size bigint,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.license_document_jobs%rowtype;
  v_license public.issued_licenses%rowtype;
  v_expected_path text;
  v_media_id uuid;
begin
  select * into v_job
  from public.license_document_jobs
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  for update;
  if v_job.id is null or v_job.lease_expires_at <= now() then
    raise exception 'The document-worker lease is missing or expired.';
  end if;

  select * into v_license from public.issued_licenses where id = v_job.issued_license_id;
  v_expected_path := 'licenses/' || v_license.subject_id || '/' || v_license.id || '.pdf';
  if p_object_path <> v_expected_path
    or p_byte_size <= 0
    or p_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'The completed document metadata is invalid.';
  end if;

  insert into public.media_objects (
    kind, bucket_id, object_path, media_type, byte_size, sha256, status, is_public
  ) values (
    'license_document', 'license-documents', p_object_path, 'application/pdf',
    p_byte_size, p_sha256, 'ready', false
  )
  on conflict (bucket_id, object_path) do update
    set media_type = excluded.media_type,
        byte_size = excluded.byte_size,
        sha256 = excluded.sha256,
        status = 'ready',
        updated_at = now()
  returning id into v_media_id;

  update public.issued_licenses
  set document_status = 'ready',
      document_media_id = v_media_id,
      document_failure_code = null,
      updated_at = now()
  where id = v_license.id;

  update public.license_document_jobs
  set status = 'complete',
      lease_token = null,
      lease_expires_at = null,
      error_code = null,
      updated_at = now()
  where id = v_job.id;

  return v_media_id;
end;
$$;

create or replace function public.fail_license_document_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_license_id uuid;
begin
  update public.license_document_jobs
  set status = 'failed',
      error_code = left(coalesce(nullif(trim(p_error_code), ''), 'generation_failed'), 120),
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  returning issued_license_id into v_license_id;
  if v_license_id is null then
    raise exception 'The document-worker lease does not match.';
  end if;

  update public.issued_licenses
  set document_status = 'failed',
      document_failure_code = left(coalesce(nullif(trim(p_error_code), ''), 'generation_failed'), 120),
      updated_at = now()
  where id = v_license_id;
end;
$$;

create or replace function public.retry_license_document_job(
  p_actor_id uuid,
  p_license_id uuid
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
    raise exception 'Only an owner can retry license documents.';
  end if;
  if not exists (
    select 1 from public.issued_licenses where id = p_license_id and status = 'active'
  ) then
    raise exception 'The active issued license does not exist.';
  end if;

  update public.license_document_jobs
  set status = 'queued',
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      error_code = null,
      updated_at = now()
  where issued_license_id = p_license_id;

  update public.issued_licenses
  set document_status = 'queued', document_failure_code = null, updated_at = now()
  where id = p_license_id;

  insert into public.audit_records (actor_id, event_type, target_type, target_id)
  values (p_actor_id, 'licensing.document_retried', 'issued_license', p_license_id);
end;
$$;

alter table public.license_templates enable row level security;
alter table public.license_templates force row level security;
alter table public.license_template_versions enable row level security;
alter table public.license_template_versions force row level security;
alter table public.license_options enable row level security;
alter table public.license_options force row level security;
alter table public.license_offers enable row level security;
alter table public.license_offers force row level security;
alter table public.license_selections enable row level security;
alter table public.license_selections force row level security;
alter table public.issued_licenses enable row level security;
alter table public.issued_licenses force row level security;
alter table public.license_document_jobs enable row level security;
alter table public.license_document_jobs force row level security;

revoke all on table public.license_templates from public, anon, authenticated;
revoke all on table public.license_template_versions from public, anon, authenticated;
revoke all on table public.license_options from public, anon, authenticated;
revoke all on table public.license_offers from public, anon, authenticated;
revoke all on table public.license_selections from public, anon, authenticated;
revoke all on table public.issued_licenses from public, anon, authenticated;
revoke all on table public.license_document_jobs from public, anon, authenticated;

grant select on table public.license_templates to anon, authenticated;
grant select on table public.license_template_versions to anon, authenticated;
grant select on table public.license_options to anon, authenticated;
grant select on table public.license_offers to anon, authenticated;
grant select on table public.license_selections to authenticated;
grant select on table public.issued_licenses to authenticated;
grant all on table public.license_templates to service_role;
grant all on table public.license_template_versions to service_role;
grant all on table public.license_options to service_role;
grant all on table public.license_offers to service_role;
grant all on table public.license_selections to service_role;
grant all on table public.issued_licenses to service_role;
grant all on table public.license_document_jobs to service_role;

create policy "published license templates are public"
  on public.license_templates for select to anon, authenticated
  using (state = 'published' or private.is_content_administrator());

create policy "current license versions are public"
  on public.license_template_versions for select to anon, authenticated
  using (
    exists (
      select 1 from public.license_templates as template
      where template.id = license_template_versions.template_id
        and (
          (template.state = 'published' and template.current_version_id = license_template_versions.id)
          or private.is_content_administrator()
        )
    )
  );

create policy "current license options are public"
  on public.license_options for select to anon, authenticated
  using (
    exists (
      select 1 from public.license_templates as template
      where template.current_version_id = license_options.template_version_id
        and (template.state = 'published' or private.is_content_administrator())
    )
  );

create policy "published license offers are public"
  on public.license_offers for select to anon, authenticated
  using (
    (state = 'published' and exists (
      select 1 from public.license_templates as template
      where template.id = license_offers.template_id
        and template.state = 'published'
        and template.current_version_id = license_offers.template_version_id
    )) or private.is_content_administrator()
  );

create policy "customers read their license selections"
  on public.license_selections for select to authenticated
  using (subject_id = auth.uid() or private.is_content_administrator());

create policy "customers read their issued licenses"
  on public.issued_licenses for select to authenticated
  using (subject_id = auth.uid() or private.is_content_administrator());

revoke all on function public.publish_license_template_version(
  uuid, uuid, uuid, text, text, text, text, text, jsonb, text, jsonb
) from public, anon, authenticated;
revoke all on function public.create_license_selection(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_license_document_job(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_license_document_job(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.fail_license_document_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.retry_license_document_job(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.publish_license_template_version(
  uuid, uuid, uuid, text, text, text, text, text, jsonb, text, jsonb
) to service_role;
grant execute on function public.create_license_selection(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.claim_license_document_job(text, integer)
  to service_role;
grant execute on function public.complete_license_document_job(uuid, uuid, text, bigint, text)
  to service_role;
grant execute on function public.fail_license_document_job(uuid, uuid, text)
  to service_role;
grant execute on function public.retry_license_document_job(uuid, uuid)
  to service_role;

comment on table public.license_template_versions is
  'Immutable artist-authored licensing language. New legal or business terms require a new version.';
comment on table public.license_options is
  'Explicit supported use packages. Exclusive or unusual uses remain an inquiry rather than an inferred checkout.';
comment on table public.issued_licenses is
  'Issued license facts and exact terms snapshots created transactionally from verified paid orders.';
