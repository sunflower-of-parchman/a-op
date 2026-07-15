<script setup lang="ts">
useSeoMeta({ title: 'Artist administration' })

const { data, error } = await useFetch('/api/admin/overview')

if (error.value?.statusCode === 401) {
  await navigateTo('/sign-in?redirect=/admin')
}
</script>

<template>
  <div class="page-frame admin-frame">
    <header class="page-heading">
      <p class="eyebrow">Artist administration</p>
      <h1>The working side of your site.</h1>
      <p v-if="data">
        {{ data.user.email }} · {{ data.roles.join(', ') }}. This foundation exposes verified state
        before the complete editorial workspace arrives.
      </p>
    </header>

    <section v-if="data" class="admin-status" aria-labelledby="authority-heading">
      <div>
        <p class="section-number">01 / Authority</p>
        <h2 id="authority-heading">Current installation facts</h2>
      </div>
      <dl>
        <div>
          <dt>Releases</dt>
          <dd>{{ data.counts.releases }}</dd>
        </div>
        <div>
          <dt>Media objects</dt>
          <dd>{{ data.counts.media }}</dd>
        </div>
        <div>
          <dt>Pending fulfillment events</dt>
          <dd>{{ data.counts.pendingEvents }}</dd>
        </div>
      </dl>
    </section>

    <nav v-if="data" class="admin-workspace-links" aria-label="Administration areas">
      <NuxtLink to="/admin/identity">
        <span>Identity, design, and navigation</span>
        <small>Draft, preview, and publish the artist-controlled site configuration.</small>
      </NuxtLink>
      <NuxtLink to="/admin/pages">
        <span>Structured pages</span>
        <small
          >Edit ordered, validated sections without allowing arbitrary scripts or markup.</small
        >
      </NuxtLink>
      <NuxtLink to="/admin/music">
        <span>Music, media, and listening</span>
        <small>Build releases, upload sources, follow processing, and publish the catalog.</small>
      </NuxtLink>
      <NuxtLink v-if="data.roles.includes('owner')" to="/admin/commerce">
        <span>Commerce and memberships</span>
        <small
          >Own the offerings, price mappings, fulfillment state, and subscription record.</small
        >
      </NuxtLink>
      <NuxtLink v-if="data.roles.includes('owner')" to="/admin/licensing">
        <span>Music licensing</span>
        <small
          >Publish explicit use packages, immutable terms, issued records, and documents.</small
        >
      </NuxtLink>
    </nav>

    <p v-else-if="error" class="form-message" role="alert">
      This account does not have access to artist administration.
    </p>
  </div>
</template>
