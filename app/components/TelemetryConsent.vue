<script setup lang="ts">
const { policy, preference, initialized, privacySignal, setConsent, trackPage } = useTelemetry()
const route = useRoute()

const shouldAsk = computed(
  () =>
    initialized.value &&
    policy.value?.optionalEnabled &&
    policy.value.consentMode === 'opt_in' &&
    preference.value === 'unset' &&
    !privacySignal.value,
)

function choose(value: 'granted' | 'denied') {
  setConsent(value)
  if (value === 'granted') void trackPage(route.path)
}
</script>

<template>
  <aside v-if="shouldAsk" class="telemetry-consent" aria-labelledby="telemetry-consent-title">
    <div>
      <p id="telemetry-consent-title">Optional artist-owned analytics</p>
      <span>
        Help this artist understand visits, meaningful listening, and direct support. This site uses
        a session-only identifier and no advertising trackers.
        <NuxtLink to="/privacy">Read the privacy details.</NuxtLink>
      </span>
    </div>
    <div class="telemetry-consent__actions">
      <button class="text-action text-action--primary" type="button" @click="choose('granted')">
        Allow optional analytics
      </button>
      <button class="text-action" type="button" @click="choose('denied')">No thanks</button>
    </div>
  </aside>
</template>
