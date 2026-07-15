create type public.lesson_access_mode as enum (
  'public',
  'account',
  'entitlement',
  'membership'
);

create table public.learning_areas (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  state public.publication_state not null default 'published',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_paths (
  id uuid primary key,
  area_id uuid not null references public.learning_areas (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  summary text not null default '',
  introduction text not null default '',
  state public.publication_state not null default 'published',
  sort_order integer not null default 0,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  summary text not null default '',
  position integer not null check (position > 0),
  state public.publication_state not null default 'published',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path_id, slug),
  unique (path_id, position)
);

create table public.lessons (
  id uuid primary key,
  course_id uuid not null references public.courses (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  summary text not null default '',
  estimated_minutes integer not null default 10 check (estimated_minutes between 1 and 600),
  access_mode public.lesson_access_mode not null default 'public',
  access_explanation text not null default '',
  membership_tier_id uuid references public.membership_tiers (id) on delete restrict,
  entitlement_product_id uuid references public.products (id) on delete set null,
  position integer not null check (position > 0),
  state public.publication_state not null default 'published',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position),
  constraint lessons_access_shape check (
    (access_mode = 'membership' and membership_tier_id is not null and entitlement_product_id is null)
    or (access_mode = 'entitlement' and membership_tier_id is null and entitlement_product_id is not null)
    or (access_mode in ('public', 'account') and membership_tier_id is null and entitlement_product_id is null)
  )
);

create table public.videos (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  summary text not null default '',
  provider text not null check (provider in ('youtube', 'vimeo', 'hosted')),
  external_id text,
  hosted_media_id uuid references public.media_objects (id) on delete restrict,
  poster_url text,
  transcript text not null,
  credits jsonb not null default '[]'::jsonb check (jsonb_typeof(credits) = 'array'),
  state public.publication_state not null default 'published',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_source_shape check (
    (provider = 'hosted' and hosted_media_id is not null and external_id is null)
    or (provider in ('youtube', 'vimeo') and external_id is not null and hosted_media_id is null)
  )
);

create table public.lesson_sections (
  id uuid primary key,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  section_type text not null check (
    section_type in ('prose', 'image', 'audio', 'video', 'download', 'prompt')
  ),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  media_object_id uuid references public.media_objects (id) on delete restrict,
  video_id uuid references public.videos (id) on delete restrict,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (lesson_id, position),
  constraint lesson_sections_reference_shape check (
    (section_type in ('image', 'audio', 'download') and media_object_id is not null and video_id is null)
    or (section_type = 'video' and video_id is not null and media_object_id is null)
    or (section_type in ('prose', 'prompt') and media_object_id is null and video_id is null)
  )
);

create table public.learning_path_drafts (
  id uuid primary key,
  slug text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_progress (
  subject_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  section_position integer not null default 0 check (section_position >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_id, lesson_id),
  constraint lesson_progress_completion_shape check (
    not completed or completed_at is not null
  )
);

create table public.video_drafts (
  id uuid primary key,
  slug text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editorial_posts (
  id uuid primary key,
  kind text not null check (kind in ('essay', 'announcement', 'learning_note', 'information')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  summary text not null default '',
  published_on date not null,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  state public.publication_state not null default 'published',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editorial_drafts (
  id uuid primary key,
  slug text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_objects add column lesson_id uuid;
alter table public.upload_intents add column lesson_id uuid;
alter table public.upload_intents drop constraint upload_intents_kind_check;
alter table public.upload_intents drop constraint upload_intents_bucket_id_check;
alter table public.upload_intents drop constraint upload_intents_target;
alter table public.upload_intents
  add constraint upload_intents_kind_check
    check (kind in ('source_audio', 'artwork', 'lesson_media')),
  add constraint upload_intents_bucket_id_check
    check (bucket_id in ('source-audio', 'artwork', 'lesson-media')),
  add constraint upload_intents_target check (
    (kind = 'source_audio' and track_id is not null and release_id is null and lesson_id is null)
    or (kind = 'artwork' and release_id is not null and track_id is null and lesson_id is null)
    or (kind = 'lesson_media' and lesson_id is not null and track_id is null and release_id is null)
  );

create index learning_paths_publication_idx
  on public.learning_paths (state, sort_order, published_at desc);
create index courses_path_position_idx on public.courses (path_id, position);
create index lessons_course_position_idx on public.lessons (course_id, position);
create index lessons_access_idx on public.lessons (access_mode, membership_tier_id);
create index lesson_sections_lesson_position_idx on public.lesson_sections (lesson_id, position);
create index lesson_progress_subject_updated_idx
  on public.lesson_progress (subject_id, updated_at desc);
create index videos_publication_idx on public.videos (state, published_at desc);
create index editorial_publication_idx
  on public.editorial_posts (state, published_on desc, published_at desc);
create index media_objects_lesson_idx on public.media_objects (lesson_id, kind, status);

create or replace function public.publish_video_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_provider text;
begin
  if not private.is_content_administrator(p_actor_id) then
    raise exception 'Only an owner or editor can publish video.';
  end if;
  select draft.payload into v_payload
  from public.video_drafts as draft
  where draft.id = p_draft_id
  for update;
  if v_payload is null then raise exception 'The video draft does not exist.'; end if;
  v_provider := v_payload ->> 'provider';

  insert into public.videos (
    id, slug, title, summary, provider, external_id, hosted_media_id,
    poster_url, transcript, credits, state, published_at, created_by
  ) values (
    p_draft_id,
    v_payload ->> 'slug',
    v_payload ->> 'title',
    v_payload ->> 'summary',
    v_provider,
    case when v_provider = 'hosted' then null else v_payload ->> 'externalId' end,
    case when v_provider = 'hosted' then nullif(v_payload ->> 'hostedMediaId', '')::uuid else null end,
    nullif(v_payload ->> 'posterUrl', ''),
    v_payload ->> 'transcript',
    v_payload -> 'credits',
    'published',
    now(),
    p_actor_id
  )
  on conflict (id) do update set
    slug = excluded.slug,
    title = excluded.title,
    summary = excluded.summary,
    provider = excluded.provider,
    external_id = excluded.external_id,
    hosted_media_id = excluded.hosted_media_id,
    poster_url = excluded.poster_url,
    transcript = excluded.transcript,
    credits = excluded.credits,
    state = 'published',
    published_at = now(),
    updated_at = now();

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (p_actor_id, 'video.published', 'video', p_draft_id, jsonb_build_object('slug', v_payload ->> 'slug'));
  return p_draft_id;
end;
$$;

create or replace function public.publish_editorial_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if not private.is_content_administrator(p_actor_id) then
    raise exception 'Only an owner or editor can publish editorial work.';
  end if;
  select draft.payload into v_payload
  from public.editorial_drafts as draft
  where draft.id = p_draft_id
  for update;
  if v_payload is null then raise exception 'The editorial draft does not exist.'; end if;

  insert into public.editorial_posts (
    id, kind, slug, title, summary, published_on, sections,
    state, published_at, created_by
  ) values (
    p_draft_id,
    v_payload ->> 'kind',
    v_payload ->> 'slug',
    v_payload ->> 'title',
    v_payload ->> 'summary',
    (v_payload ->> 'publishedOn')::date,
    v_payload -> 'sections',
    'published',
    now(),
    p_actor_id
  )
  on conflict (id) do update set
    kind = excluded.kind,
    slug = excluded.slug,
    title = excluded.title,
    summary = excluded.summary,
    published_on = excluded.published_on,
    sections = excluded.sections,
    state = 'published',
    published_at = now(),
    updated_at = now();

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (p_actor_id, 'editorial.published', 'editorial_post', p_draft_id, jsonb_build_object('slug', v_payload ->> 'slug'));
  return p_draft_id;
end;
$$;

create or replace function public.publish_learning_path_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_area jsonb;
  v_course jsonb;
  v_lesson jsonb;
  v_section jsonb;
  v_course_ids uuid[];
  v_lesson_ids uuid[];
  v_course_id uuid;
  v_lesson_id uuid;
  v_product_id uuid;
  v_price_id uuid;
  v_position integer;
  v_lesson_position integer;
  v_section_position integer;
  v_access_mode public.lesson_access_mode;
begin
  if not private.is_content_administrator(p_actor_id) then
    raise exception 'Only an owner or editor can publish learning.';
  end if;
  select draft.payload into v_payload
  from public.learning_path_drafts as draft
  where draft.id = p_draft_id
  for update;
  if v_payload is null then raise exception 'The learning draft does not exist.'; end if;
  v_area := v_payload -> 'area';
  if jsonb_array_length(v_payload -> 'courses') = 0 then
    raise exception 'A learning path requires at least one course.';
  end if;

  select array_agg((course.value ->> 'id')::uuid)
  into v_course_ids
  from jsonb_array_elements(v_payload -> 'courses') as course;
  select array_agg((lesson.value ->> 'id')::uuid)
  into v_lesson_ids
  from jsonb_array_elements(v_payload -> 'courses') as course,
       lateral jsonb_array_elements(course.value -> 'lessons') as lesson;
  if coalesce(cardinality(v_lesson_ids), 0) = 0 then
    raise exception 'A learning path requires at least one lesson.';
  end if;

  insert into public.learning_areas (
    id, slug, name, description, state, created_by
  ) values (
    (v_area ->> 'id')::uuid,
    v_area ->> 'slug',
    v_area ->> 'name',
    v_area ->> 'description',
    'published',
    p_actor_id
  )
  on conflict (id) do update set
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    state = 'published',
    updated_at = now();

  insert into public.learning_paths (
    id, area_id, slug, title, summary, introduction,
    state, published_at, created_by
  ) values (
    p_draft_id,
    (v_area ->> 'id')::uuid,
    v_payload ->> 'slug',
    v_payload ->> 'title',
    v_payload ->> 'summary',
    v_payload ->> 'introduction',
    'published',
    now(),
    p_actor_id
  )
  on conflict (id) do update set
    area_id = excluded.area_id,
    slug = excluded.slug,
    title = excluded.title,
    summary = excluded.summary,
    introduction = excluded.introduction,
    state = 'published',
    published_at = now(),
    updated_at = now();

  delete from public.lesson_sections as section
  where section.lesson_id in (
    select lesson.id
    from public.lessons as lesson
    join public.courses as course on course.id = lesson.course_id
    where course.path_id = p_draft_id
  );

  update public.products as product
  set state = 'archived', published_at = null, updated_at = now()
  where product.product_type = 'learning'
    and product.resource_type = 'lesson'
    and product.resource_id in (
      select lesson.id
      from public.lessons as lesson
      join public.courses as course on course.id = lesson.course_id
      where course.path_id = p_draft_id
        and not (lesson.id = any(v_lesson_ids))
    );

  -- Move existing rows into a collision-free namespace before applying the approved
  -- order. This keeps progress and media references stable while allowing swaps,
  -- moves between courses, and replacement slugs in a single transaction.
  update public.lessons as lesson
  set slug = 'reorder-' || replace(lesson.id::text, '-', ''),
      position = lesson.position + 1000000,
      updated_at = now()
  from public.courses as course
  where course.id = lesson.course_id
    and course.path_id = p_draft_id;

  update public.courses as course
  set slug = 'reorder-' || replace(course.id::text, '-', ''),
      position = course.position + 1000000,
      updated_at = now()
  where course.path_id = p_draft_id;

  v_position := 0;
  for v_course in select value from jsonb_array_elements(v_payload -> 'courses')
  loop
    v_position := v_position + 1;
    v_course_id := (v_course ->> 'id')::uuid;
    insert into public.courses (
      id, path_id, slug, title, summary, position, state, published_at
    ) values (
      v_course_id, p_draft_id, v_course ->> 'slug', v_course ->> 'title',
      v_course ->> 'summary', v_position, 'published', now()
    )
    on conflict (id) do update set
      path_id = excluded.path_id,
      slug = excluded.slug,
      title = excluded.title,
      summary = excluded.summary,
      position = excluded.position,
      state = 'published',
      published_at = now(),
      updated_at = now();

    v_lesson_position := 0;
    for v_lesson in select value from jsonb_array_elements(v_course -> 'lessons')
    loop
      v_lesson_position := v_lesson_position + 1;
      v_lesson_id := (v_lesson ->> 'id')::uuid;
      v_access_mode := (v_lesson ->> 'accessMode')::public.lesson_access_mode;
      v_product_id := null;

      if v_access_mode = 'entitlement' then
        select product.id into v_product_id
        from public.products as product
        where product.product_type = 'learning'
          and product.resource_type = 'lesson'
          and product.resource_id = v_lesson_id
        order by product.created_at
        limit 1;
        if v_product_id is null then
          v_product_id := gen_random_uuid();
          insert into public.products (
            id, slug, product_type, name, description, resource_type, resource_id,
            state, purchase_mode, published_at, created_by
          ) values (
            v_product_id,
            (v_payload ->> 'slug') || '-' || (v_lesson ->> 'slug') || '-access',
            'learning',
            v_lesson ->> 'title',
            v_lesson ->> 'accessExplanation',
            'lesson',
            v_lesson_id,
            'published',
            'stripe',
            now(),
            p_actor_id
          );
        else
          update public.products as product
          set name = v_lesson ->> 'title',
              description = v_lesson ->> 'accessExplanation',
              state = 'published',
              purchase_mode = 'stripe',
              published_at = now(),
              updated_at = now()
          where product.id = v_product_id;
        end if;

        update public.prices as price
        set active = false, updated_at = now()
        where price.product_id = v_product_id
          and (
            price.currency <> v_lesson -> 'price' ->> 'currency'
            or price.amount_minor <> (v_lesson -> 'price' ->> 'amountMinor')::integer
            or price.billing_interval <> 'one_time'
          );
        select price.id into v_price_id
        from public.prices as price
        where price.product_id = v_product_id
          and price.currency = v_lesson -> 'price' ->> 'currency'
          and price.amount_minor = (v_lesson -> 'price' ->> 'amountMinor')::integer
          and price.billing_interval = 'one_time'
        limit 1;
        if v_price_id is null then
          insert into public.prices (
            product_id, currency, amount_minor, active, billing_interval
          ) values (
            v_product_id,
            v_lesson -> 'price' ->> 'currency',
            (v_lesson -> 'price' ->> 'amountMinor')::integer,
            true,
            'one_time'
          );
        else
          update public.prices set active = true, updated_at = now() where id = v_price_id;
        end if;
      else
        update public.products as product
        set state = 'archived', published_at = null, updated_at = now()
        where product.product_type = 'learning'
          and product.resource_type = 'lesson'
          and product.resource_id = v_lesson_id;
      end if;

      insert into public.lessons (
        id, course_id, slug, title, summary, estimated_minutes,
        access_mode, access_explanation, membership_tier_id,
        entitlement_product_id, position, state, published_at
      ) values (
        v_lesson_id,
        v_course_id,
        v_lesson ->> 'slug',
        v_lesson ->> 'title',
        v_lesson ->> 'summary',
        (v_lesson ->> 'estimatedMinutes')::integer,
        v_access_mode,
        v_lesson ->> 'accessExplanation',
        case when v_access_mode = 'membership' then nullif(v_lesson ->> 'membershipTierId', '')::uuid else null end,
        v_product_id,
        v_lesson_position,
        'published',
        now()
      )
      on conflict (id) do update set
        course_id = excluded.course_id,
        slug = excluded.slug,
        title = excluded.title,
        summary = excluded.summary,
        estimated_minutes = excluded.estimated_minutes,
        access_mode = excluded.access_mode,
        access_explanation = excluded.access_explanation,
        membership_tier_id = excluded.membership_tier_id,
        entitlement_product_id = excluded.entitlement_product_id,
        position = excluded.position,
        state = 'published',
        published_at = now(),
        updated_at = now();

      v_section_position := 0;
      for v_section in select value from jsonb_array_elements(v_lesson -> 'sections')
      loop
        v_section_position := v_section_position + 1;
        insert into public.lesson_sections (
          id, lesson_id, section_type, content, media_object_id, video_id, position
        ) values (
          (v_section ->> 'id')::uuid,
          v_lesson_id,
          v_section ->> 'type',
          v_section - 'mediaId' - 'videoId',
          case when v_section ->> 'type' in ('image', 'audio', 'download') then (v_section ->> 'mediaId')::uuid else null end,
          case when v_section ->> 'type' = 'video' then (v_section ->> 'videoId')::uuid else null end,
          v_section_position
        );
      end loop;
    end loop;
  end loop;

  update public.lessons as lesson
  set state = 'archived', published_at = null, updated_at = now()
  where lesson.course_id in (
    select course.id from public.courses as course where course.path_id = p_draft_id
  )
    and not (lesson.id = any(v_lesson_ids));

  update public.courses as course
  set state = 'archived', published_at = null, updated_at = now()
  where course.path_id = p_draft_id
    and not (course.id = any(v_course_ids));

  insert into public.audit_records (actor_id, event_type, target_type, target_id, detail)
  values (
    p_actor_id,
    'learning.path_published',
    'learning_path',
    p_draft_id,
    jsonb_build_object('slug', v_payload ->> 'slug', 'lessonCount', cardinality(v_lesson_ids))
  );
  return p_draft_id;
end;
$$;

create or replace function public.decide_lesson_access(
  p_subject_id uuid,
  p_lesson_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
  v_decision jsonb;
begin
  select lesson.* into v_lesson
  from public.lessons as lesson
  join public.courses as course on course.id = lesson.course_id
  join public.learning_paths as path on path.id = course.path_id
  where lesson.id = p_lesson_id
    and lesson.state = 'published'
    and course.state = 'published'
    and path.state = 'published';
  if v_lesson.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'missing', 'entitlementId', null);
  end if;
  if p_subject_id is not null and private.is_content_administrator(p_subject_id) then
    return jsonb_build_object('allowed', true, 'reason', 'admin', 'entitlementId', null);
  end if;
  if v_lesson.access_mode = 'public' then
    return jsonb_build_object('allowed', true, 'reason', 'public', 'entitlementId', null);
  end if;
  if v_lesson.access_mode = 'account' then
    if p_subject_id is not null and exists (select 1 from auth.users where id = p_subject_id) then
      return jsonb_build_object('allowed', true, 'reason', 'account', 'entitlementId', null);
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'sign_in', 'entitlementId', null);
  end if;
  if p_subject_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'sign_in', 'entitlementId', null);
  end if;
  if v_lesson.access_mode = 'membership' then
    v_decision := public.decide_access(p_subject_id, 'membership', v_lesson.membership_tier_id);
  else
    v_decision := public.decide_access(p_subject_id, 'lesson', v_lesson.id);
  end if;
  return v_decision || jsonb_build_object('accessMode', v_lesson.access_mode);
end;
$$;

create or replace function public.record_lesson_progress(
  p_subject_id uuid,
  p_lesson_id uuid,
  p_section_position integer,
  p_completed boolean
)
returns table (section_position integer, completed boolean, completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_max_position integer;
begin
  v_decision := public.decide_lesson_access(p_subject_id, p_lesson_id);
  if not coalesce((v_decision ->> 'allowed')::boolean, false) then
    raise exception 'The account cannot record progress for this lesson.';
  end if;
  select max(section.position) into v_max_position
  from public.lesson_sections as section
  where section.lesson_id = p_lesson_id;
  if v_max_position is null or p_section_position < 0 or p_section_position > v_max_position then
    raise exception 'The lesson progress position is invalid.';
  end if;

  insert into public.lesson_progress as progress (
    subject_id, lesson_id, section_position, completed, completed_at
  ) values (
    p_subject_id,
    p_lesson_id,
    p_section_position,
    p_completed,
    case when p_completed then now() else null end
  )
  on conflict (subject_id, lesson_id) do update set
    section_position = greatest(progress.section_position, excluded.section_position),
    completed = progress.completed or excluded.completed,
    completed_at = case
      when progress.completed then progress.completed_at
      when excluded.completed then now()
      else null
    end,
    updated_at = now();

  return query
  select progress.section_position, progress.completed, progress.completed_at
  from public.lesson_progress as progress
  where progress.subject_id = p_subject_id and progress.lesson_id = p_lesson_id;
end;
$$;

alter table public.learning_areas enable row level security;
alter table public.learning_areas force row level security;
alter table public.learning_paths enable row level security;
alter table public.learning_paths force row level security;
alter table public.courses enable row level security;
alter table public.courses force row level security;
alter table public.lessons enable row level security;
alter table public.lessons force row level security;
alter table public.lesson_sections enable row level security;
alter table public.lesson_sections force row level security;
alter table public.learning_path_drafts enable row level security;
alter table public.learning_path_drafts force row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_progress force row level security;
alter table public.videos enable row level security;
alter table public.videos force row level security;
alter table public.video_drafts enable row level security;
alter table public.video_drafts force row level security;
alter table public.editorial_posts enable row level security;
alter table public.editorial_posts force row level security;
alter table public.editorial_drafts enable row level security;
alter table public.editorial_drafts force row level security;

revoke all on table public.learning_areas from public, anon, authenticated;
revoke all on table public.learning_paths from public, anon, authenticated;
revoke all on table public.courses from public, anon, authenticated;
revoke all on table public.lessons from public, anon, authenticated;
revoke all on table public.lesson_sections from public, anon, authenticated;
revoke all on table public.learning_path_drafts from public, anon, authenticated;
revoke all on table public.lesson_progress from public, anon, authenticated;
revoke all on table public.videos from public, anon, authenticated;
revoke all on table public.video_drafts from public, anon, authenticated;
revoke all on table public.editorial_posts from public, anon, authenticated;
revoke all on table public.editorial_drafts from public, anon, authenticated;

grant select on table public.learning_areas to anon, authenticated;
grant select on table public.learning_paths to anon, authenticated;
grant select on table public.courses to anon, authenticated;
grant select on table public.lessons to anon, authenticated;
grant select on table public.lesson_sections to anon, authenticated;
grant select on table public.lesson_progress to authenticated;
grant select on table public.videos to anon, authenticated;
grant select on table public.editorial_posts to anon, authenticated;
grant all on table public.learning_areas to service_role;
grant all on table public.learning_paths to service_role;
grant all on table public.courses to service_role;
grant all on table public.lessons to service_role;
grant all on table public.lesson_sections to service_role;
grant all on table public.learning_path_drafts to service_role;
grant all on table public.lesson_progress to service_role;
grant all on table public.videos to service_role;
grant all on table public.video_drafts to service_role;
grant all on table public.editorial_posts to service_role;
grant all on table public.editorial_drafts to service_role;

create policy "published learning areas are public"
  on public.learning_areas for select to anon, authenticated
  using (state = 'published');
create policy "published learning paths are public"
  on public.learning_paths for select to anon, authenticated
  using (state = 'published');
create policy "published courses are public"
  on public.courses for select to anon, authenticated
  using (
    state = 'published'
    and exists (
      select 1 from public.learning_paths as path
      where path.id = courses.path_id and path.state = 'published'
    )
  );
create policy "published lesson metadata is public"
  on public.lessons for select to anon, authenticated
  using (
    state = 'published'
    and exists (
      select 1
      from public.courses as course
      join public.learning_paths as path on path.id = course.path_id
      where course.id = lessons.course_id
        and course.state = 'published'
        and path.state = 'published'
    )
  );
create policy "only public lesson sections are directly readable"
  on public.lesson_sections for select to anon, authenticated
  using (
    exists (
      select 1
      from public.lessons as lesson
      join public.courses as course on course.id = lesson.course_id
      join public.learning_paths as path on path.id = course.path_id
      where lesson.id = lesson_sections.lesson_id
        and lesson.access_mode = 'public'
        and lesson.state = 'published'
        and course.state = 'published'
        and path.state = 'published'
    )
  );
create policy "customers read their learning progress"
  on public.lesson_progress for select to authenticated
  using (subject_id = auth.uid());
create policy "published videos are public"
  on public.videos for select to anon, authenticated
  using (state = 'published');
create policy "published editorial work is public"
  on public.editorial_posts for select to anon, authenticated
  using (state = 'published');

revoke all on function public.publish_video_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_editorial_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_learning_path_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decide_lesson_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_lesson_progress(uuid, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.publish_video_draft(uuid, uuid) to service_role;
grant execute on function public.publish_editorial_draft(uuid, uuid) to service_role;
grant execute on function public.publish_learning_path_draft(uuid, uuid) to service_role;
grant execute on function public.decide_lesson_access(uuid, uuid) to service_role;
grant execute on function public.record_lesson_progress(uuid, uuid, integer, boolean) to service_role;

comment on function public.decide_lesson_access(uuid, uuid) is
  'Resolves public, account, individual-entitlement, membership, and administrator lesson access through the central entitlement authority.';
comment on function public.record_lesson_progress(uuid, uuid, integer, boolean) is
  'Records monotonic learner progress only after the central lesson access decision allows it.';
comment on table public.learning_path_drafts is
  'Private structured learning proposals. Publication atomically replaces the normalized public path while preserving stable IDs.';
