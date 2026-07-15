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

    <p v-else-if="error" class="form-message" role="alert">
      This account does not have access to artist administration.
    </p>
  </div>
</template>
