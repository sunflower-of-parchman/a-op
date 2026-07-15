<script setup lang="ts">
import type { TelemetryAdminResponse } from '#shared/types/telemetry'

useSeoMeta({ title: 'Audience analytics' })

const { data, error, refresh } = await useFetch<TelemetryAdminResponse>('/api/admin/telemetry')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/telemetry')

const settings = reactive({
  optionalEnabled: true,
  consentMode: 'opt_in' as 'opt_in' | 'implied',
  retentionDays: 90,
  meaningfulListenSeconds: 10,
})
const message = ref('')
const busy = ref(false)

watch(
  data,
  (value) => {
    if (value) Object.assign(settings, value.settings)
  },
  { immediate: true },
)

function eventLabel(value: string) {
  return value.replaceAll('_', ' ')
}

async function save() {
  busy.value = true
  message.value = ''
  try {
    await $fetch('/api/admin/telemetry', { method: 'PUT', body: settings })
    await refresh()
    message.value = 'Privacy settings saved.'
  } catch {
    message.value = 'Privacy settings could not be saved.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page-frame admin-editor">
    <header class="page-heading">
      <p class="eyebrow">Artist administration · Privacy</p>
      <h1>Useful counts with a deliberate boundary.</h1>
      <p>
        This view contains aggregates only. Raw session events are isolated from artist accounts and
        are never exposed through administration.
      </p>
    </header>

    <template v-if="data">
      <section class="admin-status" aria-labelledby="telemetry-summary-heading">
        <div>
          <p class="section-number">01 / Last {{ data.summary.windowDays }} days</p>
          <h2 id="telemetry-summary-heading">Audience summary</h2>
        </div>
        <dl>
          <div>
            <dt>Sessions</dt>
            <dd>{{ data.summary.sessions }}</dd>
          </div>
          <div>
            <dt>Optional events</dt>
            <dd>{{ data.summary.events }}</dd>
          </div>
          <div>
            <dt>Content signals</dt>
            <dd>{{ data.summary.content.length }}</dd>
          </div>
        </dl>
      </section>

      <section class="telemetry-detail" aria-labelledby="telemetry-events-heading">
        <header>
          <p class="section-number">02 / Event totals</p>
          <h2 id="telemetry-events-heading">What audiences chose to do</h2>
        </header>
        <ol v-if="data.summary.totals.length" class="telemetry-ranked-list">
          <li v-for="item in data.summary.totals" :key="item.eventName">
            <span>{{ eventLabel(item.eventName) }}</span
            ><strong>{{ item.count }}</strong>
          </li>
        </ol>
        <p v-else>No optional audience events have been collected.</p>
      </section>

      <section class="telemetry-detail" aria-labelledby="telemetry-content-heading">
        <header>
          <p class="section-number">03 / Content</p>
          <h2 id="telemetry-content-heading">Most active artist resources</h2>
        </header>
        <ol v-if="data.summary.content.length" class="telemetry-ranked-list">
          <li
            v-for="item in data.summary.content"
            :key="`${item.resourceType}:${item.resourceKey}:${item.eventName}`"
          >
            <span>{{ item.resourceKey }} · {{ eventLabel(item.eventName) }}</span>
            <strong>{{ item.count }}</strong>
          </li>
        </ol>
        <p v-else>Resource-level aggregates will appear after visitors make a privacy choice.</p>
      </section>

      <form class="admin-edit-form telemetry-settings" @submit.prevent="save">
        <section>
          <header class="admin-section-heading">
            <p class="section-number">04 / Collection policy</p>
            <h2>Artist-controlled defaults</h2>
          </header>
          <div class="admin-fields">
            <label class="consent-control">
              <input v-model="settings.optionalEnabled" type="checkbox" />
              <span>Enable optional first-party audience analytics</span>
            </label>
            <label>
              <span>Consent mode</span>
              <select v-model="settings.consentMode">
                <option value="opt_in">Explicit opt in</option>
                <option value="implied">Collect unless declined</option>
              </select>
            </label>
            <label>
              <span>Retention in days</span>
              <input v-model.number="settings.retentionDays" type="number" min="7" max="730" />
            </label>
            <label>
              <span>Meaningful listen threshold in seconds</span>
              <input
                v-model.number="settings.meaningfulListenSeconds"
                type="number"
                min="5"
                max="120"
              />
            </label>
            <button class="text-action text-action--primary" type="submit" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save privacy settings' }}
            </button>
            <p v-if="message" class="form-message" role="status">{{ message }}</p>
          </div>
        </section>
      </form>
    </template>

    <p v-else-if="error" class="form-message" role="alert">
      Audience analytics are available to the installation owner.
    </p>
  </div>
</template>
