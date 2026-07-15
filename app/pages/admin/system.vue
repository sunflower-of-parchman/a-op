<script setup lang="ts">
import type { OperationalStatusResponse } from '#shared/types/telemetry'

useSeoMeta({ title: 'System status' })

const { data, error, refresh } = await useFetch<OperationalStatusResponse>('/api/admin/system')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/system')

function statusLabel(status: string) {
  return status.replace('_', ' ')
}
</script>

<template>
  <div class="page-frame admin-editor system-status-page">
    <header class="page-heading">
      <p class="eyebrow">Artist administration · Operations</p>
      <h1>Shareable status without private configuration.</h1>
      <p>
        Every line below is a redacted check. URLs, credentials, account identities, object paths,
        and provider event identifiers stay server-side.
      </p>
      <button v-if="data" class="text-action" type="button" @click="refresh()">
        Refresh checks
      </button>
    </header>

    <section v-if="data" class="system-status" aria-labelledby="system-status-heading">
      <header>
        <p class="section-number">Overall · {{ statusLabel(data.overall) }}</p>
        <h2 id="system-status-heading">Installation checks</h2>
        <p>Generated {{ new Date(data.generatedAt).toLocaleString() }}</p>
      </header>
      <ol>
        <li v-for="check in data.checks" :key="check.id">
          <div>
            <p class="status-label" :data-status="check.status">{{ statusLabel(check.status) }}</p>
            <h3>{{ check.label }}</h3>
            <p>{{ check.summary }}</p>
            <p v-if="check.action" class="system-status__action">{{ check.action }}</p>
          </div>
          <time :datetime="check.checkedAt">{{
            new Date(check.checkedAt).toLocaleDateString()
          }}</time>
        </li>
      </ol>
    </section>

    <p v-else-if="error" class="form-message" role="alert">
      System status is available to the installation owner.
    </p>
  </div>
</template>
