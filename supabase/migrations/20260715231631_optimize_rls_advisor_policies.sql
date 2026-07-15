-- Resolve the database policy findings reported by the Supabase advisors on
-- 2026-07-15. Auth helpers are evaluated once per statement, and overlapping
-- authenticated SELECT policies are consolidated without widening write access.

-- Auth RLS initialization-plan findings.

alter policy "people can read their profile"
  on public.profiles
  using (
    id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "people can update their profile"
  on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "people can read their roles"
  on public.app_roles
  using (
    user_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "customers can read their orders"
  on public.orders
  using (
    customer_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "customers can read their order items"
  on public.order_items
  using (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
        and (
          orders.customer_id = (select auth.uid())
          or (select private.has_role('owner'))
        )
    )
  );

alter policy "customers can read their entitlements"
  on public.entitlement_grants
  using (
    subject_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "customers can read their download history"
  on public.download_records
  using (
    subject_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "people manage their playlists"
  on public.playlists
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "people manage their playlist tracks"
  on public.playlist_tracks
  using (
    exists (
      select 1
      from public.playlists
      where playlists.id = playlist_tracks.playlist_id
        and playlists.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.playlists
      where playlists.id = playlist_tracks.playlist_id
        and playlists.owner_id = (select auth.uid())
    )
  );

alter policy "people manage their favorites"
  on public.favorites
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "people manage their listening history"
  on public.listening_history
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "customers can read their checkout intents"
  on public.checkout_intents
  using (
    subject_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "customers can read their subscriptions"
  on public.subscriptions
  using (
    subject_id = (select auth.uid())
    or (select private.has_role('owner'))
  );

alter policy "customers can read their refunds"
  on public.refunds
  using (
    exists (
      select 1
      from public.orders
      where orders.id = refunds.order_id
        and (
          orders.customer_id = (select auth.uid())
          or (select private.has_role('owner'))
        )
    )
  );

alter policy "customers read their license selections"
  on public.license_selections
  using (
    subject_id = (select auth.uid())
    or (select private.is_content_administrator())
  );

alter policy "customers read their issued licenses"
  on public.issued_licenses
  using (
    subject_id = (select auth.uid())
    or (select private.is_content_administrator())
  );

alter policy "customers read their learning progress"
  on public.lesson_progress
  using (subject_id = (select auth.uid()));

-- Consolidate authenticated read access while preserving anonymous published
-- access and the original administrator or owner visibility.

drop policy "published site configuration is public"
  on public.site_config_versions;
drop policy "owners can read every site configuration"
  on public.site_config_versions;

create policy "published site configuration is public"
  on public.site_config_versions
  for select
  to anon
  using (status = 'published');

create policy "authenticated people read available site configuration"
  on public.site_config_versions
  for select
  to authenticated
  using (
    status = 'published'
    or (select private.has_role('owner'))
  );

drop policy "published releases are public" on public.releases;
drop policy "administrators can read all releases" on public.releases;

create policy "published releases are public"
  on public.releases
  for select
  to anon
  using (state = 'published');

create policy "authenticated people read available releases"
  on public.releases
  for select
  to authenticated
  using (
    state = 'published'
    or (select private.is_content_administrator())
  );

drop policy "public media records are readable" on public.media_objects;
drop policy "administrators can read all media records" on public.media_objects;

create policy "public media records are readable"
  on public.media_objects
  for select
  to anon
  using (is_public and status = 'ready');

create policy "authenticated people read available media records"
  on public.media_objects
  for select
  to authenticated
  using (
    (is_public and status = 'ready')
    or (select private.is_content_administrator())
  );

drop policy "published pages are public" on public.pages;
drop policy "administrators can read all pages" on public.pages;

create policy "published pages are public"
  on public.pages
  for select
  to anon
  using (status = 'published');

create policy "authenticated people read available pages"
  on public.pages
  for select
  to authenticated
  using (
    status = 'published'
    or (select private.is_content_administrator())
  );

drop policy "published membership tiers are public" on public.membership_tiers;
drop policy "administrators can read all membership tiers" on public.membership_tiers;

create policy "published membership tiers are public"
  on public.membership_tiers
  for select
  to anon
  using (state = 'published');

create policy "authenticated people read available membership tiers"
  on public.membership_tiers
  for select
  to authenticated
  using (
    state = 'published'
    or (select private.is_content_administrator())
  );

-- Catalog policies originally used FOR ALL administrator policies alongside
-- public SELECT policies. Split write commands from read access so each role has
-- one permissive SELECT policy and administrator write authority stays intact.

drop policy "published tracks are public" on public.tracks;
drop policy "administrators manage tracks" on public.tracks;

create policy "published tracks are public"
  on public.tracks for select to anon
  using (state = 'published');
create policy "authenticated people read available tracks"
  on public.tracks for select to authenticated
  using (
    state = 'published'
    or (select private.is_content_administrator())
  );
create policy "administrators create tracks"
  on public.tracks for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update tracks"
  on public.tracks for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete tracks"
  on public.tracks for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "published release tracks are public" on public.release_tracks;
drop policy "administrators manage release tracks" on public.release_tracks;

create policy "published release tracks are public"
  on public.release_tracks for select to anon
  using (
    exists (
      select 1
      from public.releases
      where releases.id = release_tracks.release_id
        and releases.state = 'published'
    )
    and exists (
      select 1
      from public.tracks
      where tracks.id = release_tracks.track_id
        and tracks.state = 'published'
    )
  );
create policy "authenticated people read available release tracks"
  on public.release_tracks for select to authenticated
  using (
    (
      exists (
        select 1
        from public.releases
        where releases.id = release_tracks.release_id
          and releases.state = 'published'
      )
      and exists (
        select 1
        from public.tracks
        where tracks.id = release_tracks.track_id
          and tracks.state = 'published'
      )
    )
    or (select private.is_content_administrator())
  );
create policy "administrators create release tracks"
  on public.release_tracks for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update release tracks"
  on public.release_tracks for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete release tracks"
  on public.release_tracks for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "published collections are public" on public.collections;
drop policy "administrators manage collections" on public.collections;

create policy "published collections are public"
  on public.collections for select to anon
  using (state = 'published');
create policy "authenticated people read available collections"
  on public.collections for select to authenticated
  using (
    state = 'published'
    or (select private.is_content_administrator())
  );
create policy "administrators create collections"
  on public.collections for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update collections"
  on public.collections for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete collections"
  on public.collections for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "published collection tracks are public" on public.collection_tracks;
drop policy "administrators manage collection tracks" on public.collection_tracks;

create policy "published collection tracks are public"
  on public.collection_tracks for select to anon
  using (
    exists (
      select 1
      from public.collections
      where collections.id = collection_tracks.collection_id
        and collections.state = 'published'
    )
    and exists (
      select 1
      from public.tracks
      where tracks.id = collection_tracks.track_id
        and tracks.state = 'published'
    )
  );
create policy "authenticated people read available collection tracks"
  on public.collection_tracks for select to authenticated
  using (
    (
      exists (
        select 1
        from public.collections
        where collections.id = collection_tracks.collection_id
          and collections.state = 'published'
      )
      and exists (
        select 1
        from public.tracks
        where tracks.id = collection_tracks.track_id
          and tracks.state = 'published'
      )
    )
    or (select private.is_content_administrator())
  );
create policy "administrators create collection tracks"
  on public.collection_tracks for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update collection tracks"
  on public.collection_tracks for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete collection tracks"
  on public.collection_tracks for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "catalog credits are public for published resources"
  on public.catalog_credits;
drop policy "administrators manage catalog credits"
  on public.catalog_credits;

create policy "catalog credits are public for published resources"
  on public.catalog_credits for select to anon
  using (
    (
      resource_type = 'release'
      and exists (
        select 1
        from public.releases
        where releases.id = catalog_credits.resource_id
          and releases.state = 'published'
      )
    )
    or (
      resource_type = 'track'
      and exists (
        select 1
        from public.tracks
        where tracks.id = catalog_credits.resource_id
          and tracks.state = 'published'
      )
    )
  );
create policy "authenticated people read available catalog credits"
  on public.catalog_credits for select to authenticated
  using (
    (
      resource_type = 'release'
      and exists (
        select 1
        from public.releases
        where releases.id = catalog_credits.resource_id
          and releases.state = 'published'
      )
    )
    or (
      resource_type = 'track'
      and exists (
        select 1
        from public.tracks
        where tracks.id = catalog_credits.resource_id
          and tracks.state = 'published'
      )
    )
    or (select private.is_content_administrator())
  );
create policy "administrators create catalog credits"
  on public.catalog_credits for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update catalog credits"
  on public.catalog_credits for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete catalog credits"
  on public.catalog_credits for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "administrators manage catalog taxonomies"
  on public.catalog_taxonomies;
drop policy "administrators manage catalog terms"
  on public.catalog_terms;

create policy "administrators create catalog taxonomies"
  on public.catalog_taxonomies for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update catalog taxonomies"
  on public.catalog_taxonomies for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete catalog taxonomies"
  on public.catalog_taxonomies for delete to authenticated
  using ((select private.is_content_administrator()));

create policy "administrators create catalog terms"
  on public.catalog_terms for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update catalog terms"
  on public.catalog_terms for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete catalog terms"
  on public.catalog_terms for delete to authenticated
  using ((select private.is_content_administrator()));

drop policy "catalog assignments are public for published resources"
  on public.catalog_term_assignments;
drop policy "administrators manage catalog assignments"
  on public.catalog_term_assignments;

create policy "catalog assignments are public for published resources"
  on public.catalog_term_assignments for select to anon
  using (
    (
      resource_type = 'release'
      and exists (
        select 1
        from public.releases
        where releases.id = catalog_term_assignments.resource_id
          and releases.state = 'published'
      )
    )
    or (
      resource_type = 'track'
      and exists (
        select 1
        from public.tracks
        where tracks.id = catalog_term_assignments.resource_id
          and tracks.state = 'published'
      )
    )
  );
create policy "authenticated people read available catalog assignments"
  on public.catalog_term_assignments for select to authenticated
  using (
    (
      resource_type = 'release'
      and exists (
        select 1
        from public.releases
        where releases.id = catalog_term_assignments.resource_id
          and releases.state = 'published'
      )
    )
    or (
      resource_type = 'track'
      and exists (
        select 1
        from public.tracks
        where tracks.id = catalog_term_assignments.resource_id
          and tracks.state = 'published'
      )
    )
    or (select private.is_content_administrator())
  );
create policy "administrators create catalog assignments"
  on public.catalog_term_assignments for insert to authenticated
  with check ((select private.is_content_administrator()));
create policy "administrators update catalog assignments"
  on public.catalog_term_assignments for update to authenticated
  using ((select private.is_content_administrator()))
  with check ((select private.is_content_administrator()));
create policy "administrators delete catalog assignments"
  on public.catalog_term_assignments for delete to authenticated
  using ((select private.is_content_administrator()));
