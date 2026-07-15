create table public.membership_tiers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  state public.publication_state not null default 'draft',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index membership_tiers_publication_idx
  on public.membership_tiers (state, sort_order, name);

alter table public.products
  add column purchase_mode text not null default 'stripe'
    check (purchase_mode in ('free', 'stripe', 'external')),
  add column external_url text,
  add column sort_order integer not null default 0,
  add column published_at timestamptz,
  add constraint products_external_url check (
    (purchase_mode = 'external' and external_url is not null and external_url ~ '^https://')
    or (purchase_mode <> 'external' and external_url is null)
  );

alter table public.prices
  add column billing_interval text not null default 'one_time'
    check (billing_interval in ('one_time', 'month', 'year')),
  add column external_product_id text,
  add column updated_at timestamptz not null default now();

create unique index prices_external_product_price_idx
  on public.prices (external_product_id, external_price_id)
  where external_product_id is not null and external_price_id is not null;

create table public.payment_customers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('simulation', 'stripe')),
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, provider),
  unique (provider, provider_customer_id)
);

create table public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  price_id uuid references public.prices (id) on delete restrict,
  provider text not null check (provider in ('simulation', 'stripe')),
  provider_session_id text,
  status text not null default 'open'
    check (status in ('open', 'complete', 'expired', 'canceled', 'failed')),
  return_path text not null default '/account' check (return_path ~ '^/'),
  failure_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index checkout_intents_provider_session_idx
  on public.checkout_intents (provider, provider_session_id)
  where provider_session_id is not null;
create index checkout_intents_subject_created_idx
  on public.checkout_intents (subject_id, created_at desc);

alter table public.orders
  add column checkout_intent_id uuid references public.checkout_intents (id) on delete restrict,
  add column provider_payment_id text,
  add column refunded_minor integer not null default 0 check (refunded_minor >= 0);

create unique index orders_checkout_intent_idx
  on public.orders (checkout_intent_id)
  where checkout_intent_id is not null;
create unique index orders_provider_payment_idx
  on public.orders (provider_payment_id)
  where provider_payment_id is not null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  price_id uuid not null references public.prices (id) on delete restrict,
  provider text not null check (provider in ('simulation', 'stripe')),
  provider_subscription_id text not null,
  provider_customer_id text,
  status text not null check (
    status in (
      'trialing',
      'active',
      'past_due',
      'paused',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired'
    )
  ),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  constraint subscriptions_period check (current_period_end > current_period_start)
);

create index subscriptions_subject_updated_idx
  on public.subscriptions (subject_id, updated_at desc);
create index subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_event_id uuid not null references public.payment_events (id) on delete restrict,
  provider text not null check (provider in ('simulation', 'stripe')),
  provider_refund_id text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (
    status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')
  ),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_refund_id)
);

create index refunds_order_created_idx on public.refunds (order_id, created_at desc);

create table public.webhook_failures (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'stripe'),
  provider_event_id text not null,
  event_type text not null check (length(event_type) between 1 and 160),
  object_id text not null check (length(object_id) between 1 and 255),
  error_code text not null check (length(error_code) between 1 and 120),
  attempts integer not null default 1 check (attempts > 0),
  status text not null default 'unresolved' check (status in ('unresolved', 'resolved')),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (provider, provider_event_id)
);

create index webhook_failures_status_time_idx
  on public.webhook_failures (status, last_failed_at desc);

create or replace function public.process_commerce_payment_event(
  p_provider text,
  p_provider_event_id text,
  p_target_customer_id uuid,
  p_target_product_id uuid,
  p_target_price_id uuid,
  p_paid_amount_minor integer,
  p_paid_currency text,
  p_checkout_intent_id uuid default null,
  p_provider_payment_id text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_period_end timestamptz default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (order_id uuid, entitlement_id uuid, subscription_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_price public.prices%rowtype;
  v_event_id uuid;
  v_event_was_new boolean;
  v_order_id uuid;
  v_entitlement_id uuid;
  v_subscription_id uuid;
  v_membership boolean;
begin
  if p_provider not in ('simulation', 'stripe') then
    raise exception 'The payment provider is unsupported.';
  end if;
  if p_provider_event_id is null or length(trim(p_provider_event_id)) = 0 then
    raise exception 'A provider event identifier is required.';
  end if;

  select product.* into v_product
  from public.products as product
  where product.id = p_target_product_id and product.state = 'published';
  if v_product.id is null then
    raise exception 'The product is not available.';
  end if;

  select price.* into v_price
  from public.prices as price
  where price.id = p_target_price_id
    and price.product_id = p_target_product_id
    and price.currency = upper(p_paid_currency)
    and price.amount_minor = p_paid_amount_minor
    and price.active;
  if v_price.id is null then
    raise exception 'The payment amount does not match an active price.';
  end if;

  v_membership := v_product.product_type = 'membership';
  if v_membership and (
    p_provider_subscription_id is null
    or p_period_end is null
    or p_period_end <= now()
    or v_price.billing_interval = 'one_time'
  ) then
    raise exception 'A recurring membership requires a valid subscription period.';
  end if;
  if not v_membership and v_price.billing_interval <> 'one_time' then
    raise exception 'A non-membership product cannot use a recurring price.';
  end if;

  if p_checkout_intent_id is not null and not exists (
    select 1 from public.checkout_intents as intent
    where intent.id = p_checkout_intent_id
      and intent.subject_id = p_target_customer_id
      and intent.product_id = p_target_product_id
      and intent.price_id = p_target_price_id
  ) then
    raise exception 'The checkout intent does not match the payment facts.';
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
    p_provider,
    trim(p_provider_event_id),
    p_target_customer_id,
    p_target_product_id,
    p_paid_amount_minor,
    upper(p_paid_currency),
    coalesce(p_event_payload, '{}'::jsonb)
  )
  on conflict on constraint payment_events_provider_event_unique do nothing
  returning id into v_event_id;

  v_event_was_new := v_event_id is not null;
  if not v_event_was_new then
    select event.id into v_event_id
    from public.payment_events as event
    where event.provider = p_provider and event.provider_event_id = trim(p_provider_event_id);

    if not exists (
      select 1 from public.payment_events as event
      where event.id = v_event_id
        and event.customer_id = p_target_customer_id
        and event.product_id = p_target_product_id
        and event.amount_minor = p_paid_amount_minor
        and event.currency = upper(p_paid_currency)
    ) then
      raise exception 'The replayed event does not match the original payment facts.';
    end if;
  end if;

  if p_provider_customer_id is not null then
    insert into public.payment_customers (subject_id, provider, provider_customer_id)
    values (p_target_customer_id, p_provider, p_provider_customer_id)
    on conflict (subject_id, provider) do update
      set provider_customer_id = excluded.provider_customer_id,
          updated_at = now();
  end if;

  insert into public.orders (
    customer_id,
    payment_event_id,
    status,
    currency,
    total_minor,
    completed_at,
    checkout_intent_id,
    provider_payment_id
  ) values (
    p_target_customer_id,
    v_event_id,
    'complete',
    upper(p_paid_currency),
    p_paid_amount_minor,
    now(),
    p_checkout_intent_id,
    p_provider_payment_id
  )
  on conflict on constraint orders_payment_event_unique do update
    set status = 'complete',
        completed_at = coalesce(public.orders.completed_at, excluded.completed_at),
        checkout_intent_id = coalesce(public.orders.checkout_intent_id, excluded.checkout_intent_id),
        provider_payment_id = coalesce(public.orders.provider_payment_id, excluded.provider_payment_id)
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
    v_product.resource_type,
    v_product.resource_id,
    p_paid_amount_minor
  )
  on conflict on constraint order_items_order_product_unique do nothing;

  if v_membership then
    insert into public.subscriptions (
      subject_id,
      product_id,
      price_id,
      provider,
      provider_subscription_id,
      provider_customer_id,
      status,
      current_period_start,
      current_period_end
    ) values (
      p_target_customer_id,
      p_target_product_id,
      p_target_price_id,
      p_provider,
      p_provider_subscription_id,
      p_provider_customer_id,
      'active',
      now(),
      p_period_end
    )
    on conflict (provider, provider_subscription_id) do update
      set status = 'active',
          current_period_end = greatest(public.subscriptions.current_period_end, excluded.current_period_end),
          provider_customer_id = coalesce(excluded.provider_customer_id, public.subscriptions.provider_customer_id),
          updated_at = now()
    returning id into v_subscription_id;

    insert into public.entitlement_grants (
      subject_id,
      resource_type,
      resource_id,
      source_type,
      source_id,
      status,
      expires_at
    ) values (
      p_target_customer_id,
      'membership',
      v_product.resource_id,
      'membership',
      v_subscription_id,
      'active',
      p_period_end
    )
    on conflict on constraint entitlement_source_unique do update
      set status = 'active',
          expires_at = greatest(public.entitlement_grants.expires_at, excluded.expires_at),
          revoked_at = null
    returning id into v_entitlement_id;
  else
    insert into public.entitlement_grants (
      subject_id,
      resource_type,
      resource_id,
      source_type,
      source_id
    ) values (
      p_target_customer_id,
      v_product.resource_type,
      v_product.resource_id,
      'order',
      v_order_id
    )
    on conflict on constraint entitlement_source_unique do update
      set status = 'active', revoked_at = null
    returning id into v_entitlement_id;
  end if;

  update public.payment_events
  set status = 'complete', processed_at = coalesce(processed_at, now())
  where id = v_event_id;

  if p_checkout_intent_id is not null then
    update public.checkout_intents
    set status = 'complete', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = p_checkout_intent_id;
  end if;

  order_id := v_order_id;
  entitlement_id := v_entitlement_id;
  subscription_id := v_subscription_id;
  replayed := not v_event_was_new;
  return next;
end;
$$;

create or replace function public.process_subscription_state_event(
  p_provider text,
  p_provider_event_id text,
  p_target_customer_id uuid,
  p_target_product_id uuid,
  p_provider_subscription_id text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean default false,
  p_canceled_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (subscription_id uuid, entitlement_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_event_id uuid;
  v_event_was_new boolean;
  v_entitlement_id uuid;
  v_currency text;
  v_entitlement_status public.entitlement_status;
  v_safe_period_end timestamptz;
begin
  if p_provider not in ('simulation', 'stripe') then
    raise exception 'The subscription provider is unsupported.';
  end if;
  if p_status not in (
    'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'
  ) then
    raise exception 'The subscription status is unsupported.';
  end if;

  select subscription.* into v_subscription
  from public.subscriptions as subscription
  where subscription.provider = p_provider
    and subscription.provider_subscription_id = p_provider_subscription_id
    and subscription.subject_id = p_target_customer_id
    and subscription.product_id = p_target_product_id;
  if v_subscription.id is null then
    raise exception 'The subscription could not be reconciled.';
  end if;

  select price.currency into v_currency
  from public.prices as price
  where price.id = v_subscription.price_id;

  insert into public.payment_events (
    provider, provider_event_id, customer_id, product_id, amount_minor, currency, payload
  ) values (
    p_provider,
    trim(p_provider_event_id),
    p_target_customer_id,
    p_target_product_id,
    0,
    v_currency,
    coalesce(p_event_payload, '{}'::jsonb)
  )
  on conflict on constraint payment_events_provider_event_unique do nothing
  returning id into v_event_id;
  v_event_was_new := v_event_id is not null;

  if not v_event_was_new then
    select event.id into v_event_id
    from public.payment_events as event
    where event.provider = p_provider and event.provider_event_id = trim(p_provider_event_id);
  end if;

  v_safe_period_end := greatest(
    coalesce(p_period_end, v_subscription.current_period_end),
    v_subscription.current_period_start + interval '1 millisecond'
  );

  update public.subscriptions
  set status = p_status,
      current_period_end = v_safe_period_end,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
      canceled_at = p_canceled_at,
      ended_at = p_ended_at,
      updated_at = now()
  where id = v_subscription.id;

  v_entitlement_status := case
    when p_status in ('active', 'trialing', 'past_due') and v_safe_period_end > now()
      then 'active'::public.entitlement_status
    else 'expired'::public.entitlement_status
  end;

  update public.entitlement_grants
  set status = v_entitlement_status,
      expires_at = v_safe_period_end,
      revoked_at = null
  where subject_id = p_target_customer_id
    and source_type = 'membership'
    and source_id = v_subscription.id
  returning id into v_entitlement_id;

  update public.payment_events
  set status = 'complete', processed_at = coalesce(processed_at, now())
  where id = v_event_id;

  subscription_id := v_subscription.id;
  entitlement_id := v_entitlement_id;
  replayed := not v_event_was_new;
  return next;
end;
$$;

create or replace function public.process_refund_event(
  p_provider text,
  p_provider_event_id text,
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_refund_amount_minor integer,
  p_refund_status text,
  p_refund_reason text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (refund_id uuid, order_id uuid, entitlement_revoked boolean, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_product_id uuid;
  v_event_id uuid;
  v_event_was_new boolean;
  v_refund_id uuid;
  v_refunded_total integer;
  v_revoked_count integer;
begin
  if p_provider not in ('simulation', 'stripe') then
    raise exception 'The refund provider is unsupported.';
  end if;
  if p_refund_status not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
    raise exception 'The refund status is unsupported.';
  end if;
  if p_refund_amount_minor <= 0 then
    raise exception 'The refund amount must be positive.';
  end if;

  select customer_order.* into v_order
  from public.orders as customer_order
  where customer_order.provider_payment_id = p_provider_payment_id;
  if v_order.id is null then
    raise exception 'The refunded payment could not be reconciled.';
  end if;

  select item.product_id into v_product_id
  from public.order_items as item
  where item.order_id = v_order.id
  order by item.created_at
  limit 1;

  insert into public.payment_events (
    provider, provider_event_id, customer_id, product_id, amount_minor, currency, payload
  ) values (
    p_provider,
    trim(p_provider_event_id),
    v_order.customer_id,
    v_product_id,
    p_refund_amount_minor,
    v_order.currency,
    coalesce(p_event_payload, '{}'::jsonb)
  )
  on conflict on constraint payment_events_provider_event_unique do nothing
  returning id into v_event_id;
  v_event_was_new := v_event_id is not null;

  if not v_event_was_new then
    select event.id into v_event_id
    from public.payment_events as event
    where event.provider = p_provider and event.provider_event_id = trim(p_provider_event_id);
  end if;

  insert into public.refunds (
    order_id,
    payment_event_id,
    provider,
    provider_refund_id,
    amount_minor,
    currency,
    status,
    reason
  ) values (
    v_order.id,
    v_event_id,
    p_provider,
    p_provider_refund_id,
    p_refund_amount_minor,
    v_order.currency,
    p_refund_status,
    p_refund_reason
  )
  on conflict (provider, provider_refund_id) do update
    set status = excluded.status,
        reason = excluded.reason,
        updated_at = now()
  returning id into v_refund_id;

  select coalesce(sum(refund.amount_minor) filter (where refund.status = 'succeeded'), 0)::integer
  into v_refunded_total
  from public.refunds as refund
  where refund.order_id = v_order.id;

  update public.orders
  set refunded_minor = least(total_minor, v_refunded_total),
      status = case when v_refunded_total >= total_minor then 'refunded' else status end
  where id = v_order.id;

  v_revoked_count := 0;
  if v_refunded_total >= v_order.total_minor then
    update public.entitlement_grants
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where source_type = 'order' and source_id = v_order.id and status <> 'revoked';
    get diagnostics v_revoked_count = row_count;
  end if;

  update public.payment_events
  set status = 'complete', processed_at = coalesce(processed_at, now())
  where id = v_event_id;

  refund_id := v_refund_id;
  order_id := v_order.id;
  entitlement_revoked := v_revoked_count > 0;
  replayed := not v_event_was_new;
  return next;
end;
$$;

create or replace function public.update_commerce_offer(
  p_actor_id uuid,
  p_product_id uuid,
  p_price_id uuid,
  p_name text,
  p_description text,
  p_state public.publication_state,
  p_purchase_mode text,
  p_external_url text,
  p_currency text,
  p_amount_minor integer,
  p_billing_interval text,
  p_external_product_id text,
  p_external_price_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_external_url text := nullif(trim(p_external_url), '');
  v_external_product_id text := nullif(trim(p_external_product_id), '');
  v_external_price_id text := nullif(trim(p_external_price_id), '');
begin
  if not exists (
    select 1 from public.app_roles where user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Only an owner can change commerce settings.';
  end if;
  if p_purchase_mode not in ('free', 'stripe', 'external') then
    raise exception 'The purchase mode is unsupported.';
  end if;
  if p_purchase_mode = 'external' and (
    v_external_url is null or v_external_url !~ '^https://'
  ) then
    raise exception 'An external offering requires an HTTPS URL.';
  end if;
  if p_purchase_mode <> 'external' and v_external_url is not null then
    raise exception 'Only external offerings can carry an external URL.';
  end if;
  if (v_external_product_id is null) <> (v_external_price_id is null) then
    raise exception 'Stripe product and price mappings must be supplied together.';
  end if;
  if p_purchase_mode = 'free' and p_amount_minor <> 0 then
    raise exception 'A free offering must have a zero price.';
  end if;

  select product.* into v_product from public.products as product where product.id = p_product_id;
  if v_product.id is null then
    raise exception 'The offering does not exist.';
  end if;
  if v_product.product_type = 'membership' and p_billing_interval = 'one_time' then
    raise exception 'A membership requires a recurring interval.';
  end if;
  if v_product.product_type <> 'membership' and p_billing_interval <> 'one_time' then
    raise exception 'Only memberships can use recurring prices.';
  end if;
  if p_purchase_mode <> 'external' and p_price_id is null then
    raise exception 'This offering requires a price.';
  end if;

  update public.products
  set name = trim(p_name),
      description = trim(p_description),
      state = p_state,
      purchase_mode = p_purchase_mode,
      external_url = case when p_purchase_mode = 'external' then v_external_url else null end,
      published_at = case
        when p_state = 'published' then coalesce(published_at, now())
        else null
      end,
      updated_at = now()
  where id = p_product_id;

  if p_price_id is not null then
    update public.prices
    set currency = upper(p_currency),
        amount_minor = p_amount_minor,
        billing_interval = p_billing_interval,
        external_product_id = case when p_purchase_mode = 'stripe' then v_external_product_id else null end,
        external_price_id = case when p_purchase_mode = 'stripe' then v_external_price_id else null end,
        active = p_purchase_mode <> 'external',
        updated_at = now()
    where id = p_price_id and product_id = p_product_id;
    if not found and p_purchase_mode <> 'external' then
      raise exception 'The offering price does not exist.';
    end if;
  end if;

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (
    p_actor_id,
    'commerce.offer_updated',
    'product',
    p_product_id,
    jsonb_build_object(
      'purchaseMode', p_purchase_mode,
      'currency', upper(p_currency),
      'amountMinor', p_amount_minor,
      'billingInterval', p_billing_interval,
      'stripeMapped', v_external_price_id is not null
    )
  );
end;
$$;

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
  v_entitlement public.entitlement_grants%rowtype;
begin
  if exists (
    select 1 from public.app_roles
    where user_id = target_subject_id and role in ('owner', 'editor')
  ) then
    return jsonb_build_object('allowed', true, 'reason', 'admin', 'entitlementId', null);
  end if;

  select entitlement.* into v_entitlement
  from public.entitlement_grants as entitlement
  where entitlement.subject_id = target_subject_id
    and entitlement.resource_type = target_resource_type
    and entitlement.resource_id = target_resource_id
    and entitlement.status = 'active'
    and entitlement.starts_at <= now()
    and (entitlement.expires_at is null or entitlement.expires_at > now())
  order by entitlement.created_at
  limit 1;

  if v_entitlement.id is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', case
        when v_entitlement.source_type = 'order' then 'purchase'
        else v_entitlement.source_type
      end,
      'entitlementId', v_entitlement.id,
      'expiresAt', v_entitlement.expires_at,
      'revokedAt', v_entitlement.revoked_at
    );
  end if;

  select entitlement.* into v_entitlement
  from public.entitlement_grants as entitlement
  where entitlement.subject_id = target_subject_id
    and entitlement.resource_type = target_resource_type
    and entitlement.resource_id = target_resource_id
  order by
    case when entitlement.status = 'revoked' then 0 else 1 end,
    entitlement.created_at desc
  limit 1;

  if v_entitlement.id is not null then
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_entitlement.status = 'revoked' then 'revoked' else 'expired' end,
      'entitlementId', v_entitlement.id,
      'expiresAt', v_entitlement.expires_at,
      'revokedAt', v_entitlement.revoked_at
    );
  end if;

  return jsonb_build_object('allowed', false, 'reason', 'missing', 'entitlementId', null);
end;
$$;

create or replace function public.record_webhook_failure(
  p_provider_event_id text,
  p_event_type text,
  p_object_id text,
  p_error_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failure_id uuid;
begin
  insert into public.webhook_failures (
    provider,
    provider_event_id,
    event_type,
    object_id,
    error_code
  ) values (
    'stripe',
    trim(p_provider_event_id),
    trim(p_event_type),
    trim(p_object_id),
    trim(p_error_code)
  )
  on conflict (provider, provider_event_id) do update
    set attempts = public.webhook_failures.attempts + 1,
        error_code = excluded.error_code,
        status = 'unresolved',
        last_failed_at = now(),
        resolved_at = null
  returning id into v_failure_id;
  return v_failure_id;
end;
$$;

create or replace function public.resolve_webhook_failure(p_provider_event_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_failures
  set status = 'resolved', resolved_at = now()
  where provider = 'stripe'
    and provider_event_id = trim(p_provider_event_id)
    and status = 'unresolved';
$$;

revoke all on function public.process_commerce_payment_event(
  text, text, uuid, uuid, uuid, integer, text, uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.process_commerce_payment_event(
  text, text, uuid, uuid, uuid, integer, text, uuid, text, text, text, timestamptz, jsonb
) to service_role;

revoke all on function public.process_subscription_state_event(
  text, text, uuid, uuid, text, text, timestamptz, boolean, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.process_subscription_state_event(
  text, text, uuid, uuid, text, text, timestamptz, boolean, timestamptz, timestamptz, jsonb
) to service_role;

revoke all on function public.process_refund_event(
  text, text, text, text, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_refund_event(
  text, text, text, text, integer, text, text, jsonb
) to service_role;

revoke all on function public.update_commerce_offer(
  uuid, uuid, uuid, text, text, public.publication_state, text, text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_commerce_offer(
  uuid, uuid, uuid, text, text, public.publication_state, text, text, text, integer, text, text, text
) to service_role;

revoke all on function public.record_webhook_failure(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_webhook_failure(text, text, text, text) to service_role;
revoke all on function public.resolve_webhook_failure(text) from public, anon, authenticated;
grant execute on function public.resolve_webhook_failure(text) to service_role;

alter table public.membership_tiers enable row level security;
alter table public.membership_tiers force row level security;
alter table public.payment_customers enable row level security;
alter table public.payment_customers force row level security;
alter table public.checkout_intents enable row level security;
alter table public.checkout_intents force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.refunds enable row level security;
alter table public.refunds force row level security;
alter table public.webhook_failures enable row level security;
alter table public.webhook_failures force row level security;

revoke all on table public.membership_tiers from public, anon, authenticated;
revoke all on table public.payment_customers from public, anon, authenticated;
revoke all on table public.checkout_intents from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;
revoke all on table public.refunds from public, anon, authenticated;
revoke all on table public.webhook_failures from public, anon, authenticated;

grant select on table public.membership_tiers to anon, authenticated;
grant select on table public.checkout_intents to authenticated;
grant select on table public.subscriptions to authenticated;
grant select on table public.refunds to authenticated;

grant all on table public.membership_tiers to service_role;
grant all on table public.payment_customers to service_role;
grant all on table public.checkout_intents to service_role;
grant all on table public.subscriptions to service_role;
grant all on table public.refunds to service_role;
grant all on table public.webhook_failures to service_role;

create policy "published membership tiers are public"
  on public.membership_tiers for select to anon, authenticated
  using (state = 'published');

create policy "administrators can read all membership tiers"
  on public.membership_tiers for select to authenticated
  using (private.is_content_administrator());

create policy "customers can read their checkout intents"
  on public.checkout_intents for select to authenticated
  using (subject_id = auth.uid() or private.has_role('owner'));

create policy "customers can read their subscriptions"
  on public.subscriptions for select to authenticated
  using (subject_id = auth.uid() or private.has_role('owner'));

create policy "customers can read their refunds"
  on public.refunds for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = refunds.order_id
        and (orders.customer_id = auth.uid() or private.has_role('owner'))
    )
  );

comment on function public.process_commerce_payment_event(
  text, text, uuid, uuid, uuid, integer, text, uuid, text, text, text, timestamptz, jsonb
) is 'Server-only atomic payment fulfillment for simulation and verified Stripe events.';
comment on function public.process_subscription_state_event(
  text, text, uuid, uuid, text, text, timestamptz, boolean, timestamptz, timestamptz, jsonb
) is 'Server-only idempotent subscription state and membership entitlement reconciliation.';
comment on function public.process_refund_event(
  text, text, text, text, integer, text, text, jsonb
) is 'Server-only append-only refund reconciliation with full-refund entitlement revocation.';
comment on function public.update_commerce_offer(
  uuid, uuid, uuid, text, text, public.publication_state, text, text, text, integer, text, text, text
) is 'Server-only atomic owner update for one artist-owned product and its provider mapping.';
comment on function public.record_webhook_failure(text, text, text, text) is
  'Stores only redacted Stripe event reconciliation facts and an atomic retry count.';
comment on function public.resolve_webhook_failure(text) is
  'Marks a previously failed verified Stripe event resolved after successful replay.';
