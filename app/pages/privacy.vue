<script setup lang="ts">
useSeoMeta({
  title: 'Privacy',
  description: 'How this independent artist site handles optional audience analytics.',
})

const { policy, preference, initialized, privacySignal, loadPolicy, setConsent } = useTelemetry()
onMounted(loadPolicy)
</script>

<template>
  <div class="page-frame interior-page privacy-page">
    <header class="page-heading">
      <p class="eyebrow">Privacy</p>
      <h1>Small signals, held by the artist.</h1>
      <p>
        Optional analytics help the artist improve this independent site. Operational health records
        are kept separately so declining audience analytics never prevents the site from working.
      </p>
    </header>

    <section class="privacy-section" aria-labelledby="privacy-collection-heading">
      <div>
        <p class="section-number">01 / Optional audience events</p>
        <h2 id="privacy-collection-heading">What can be counted</h2>
      </div>
      <div>
        <p v-for="purpose in policy?.purposes" :key="purpose">{{ purpose }}</p>
        <p>
          Events can include an internal page, an artist-owned resource slug, and a bounded count.
          Search text, email addresses, IP addresses, user-agent strings, full referrers, and
          account identities are not stored with these events.
        </p>
      </div>
    </section>

    <section class="privacy-section" aria-labelledby="privacy-control-heading">
      <div>
        <p class="section-number">02 / Your control</p>
        <h2 id="privacy-control-heading">A choice that remains available</h2>
      </div>
      <div>
        <p v-if="privacySignal" class="form-message">
          A Global Privacy Control or Do Not Track signal is active. Optional analytics are disabled
          for this browser.
        </p>
        <template v-else-if="initialized">
          <p>
            Current choice: <strong>{{ preference }}</strong
            >. You can change it here at any time.
          </p>
          <div class="action-row">
            <button
              class="text-action text-action--primary"
              type="button"
              @click="setConsent('granted')"
            >
              Allow optional analytics
            </button>
            <button class="text-action" type="button" @click="setConsent('denied')">
              Decline optional analytics
            </button>
          </div>
        </template>
      </div>
    </section>

    <section class="privacy-section" aria-labelledby="privacy-retention-heading">
      <div>
        <p class="section-number">03 / Boundaries</p>
        <h2 id="privacy-retention-heading">Retention and operations</h2>
      </div>
      <div>
        <p>
          Optional events use a random identifier that lasts only for the browser session. The
          current retention window is {{ policy?.retentionDays ?? 'set by the artist' }} days, and
          expired records are pruned by the application.
        </p>
        <p>
          Redacted setup checks, failed worker counts, storage readiness, and payment-webhook health
          remain operational records. They do not contain audience session identifiers and are never
          combined with optional audience analytics.
        </p>
      </div>
    </section>
  </div>
</template>
