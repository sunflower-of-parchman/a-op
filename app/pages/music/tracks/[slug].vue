<script setup lang="ts">
const route = useRoute()
const artist = useArtistConfig()
const { data, error } = await useFetch(() => `/api/tracks/${String(route.params.slug)}`)
const audioPlayer = useAudioPlayer()

const playerTrack = computed(() => {
  if (!data.value?.preview) return null
  return {
    id: data.value.track.id,
    slug: data.value.track.slug,
    title: data.value.track.title,
    artist: artist.identity.name,
    releaseTitle: data.value.release?.title,
    href: `/music/tracks/${data.value.track.slug}`,
    src: data.value.preview.url,
  }
})

useSeoMeta({
  title: () => data.value?.track.title ?? 'Track',
  description: () => data.value?.track.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page track-page">
    <header class="release-page__heading">
      <p class="eyebrow">Track</p>
      <h1>{{ data.track.title }}</h1>
      <p>{{ data.track.description }}</p>
    </header>
    <section class="track-details" aria-labelledby="details-heading">
      <div>
        <p class="section-number">Listening details</p>
        <h2 id="details-heading">Music, with its context intact.</h2>
      </div>
      <dl>
        <div v-if="data.track.tempo_bpm">
          <dt>Tempo</dt>
          <dd>{{ data.track.tempo_bpm }} BPM</dd>
        </div>
        <div v-if="data.track.meter">
          <dt>Meter</dt>
          <dd>{{ data.track.meter }}</dd>
        </div>
        <div v-if="data.track.musical_key">
          <dt>Key</dt>
          <dd>{{ data.track.musical_key }}</dd>
        </div>
        <div v-if="data.track.mood">
          <dt>Mood</dt>
          <dd>{{ data.track.mood }}</dd>
        </div>
      </dl>
    </section>
    <div class="action-row">
      <button
        v-if="playerTrack"
        class="text-action text-action--primary"
        type="button"
        @click="audioPlayer.playTrack(playerTrack)"
      >
        Play public preview
      </button>
      <NuxtLink v-if="data.release" class="text-action" :to="`/music/${data.release.slug}`">
        Return to {{ data.release.title }}
      </NuxtLink>
    </div>
  </article>
  <div v-else class="page-frame interior-page">
    <p class="eyebrow">Catalog</p>
    <h1>{{ error ? 'Track not found.' : 'Loading track…' }}</h1>
  </div>
</template>
