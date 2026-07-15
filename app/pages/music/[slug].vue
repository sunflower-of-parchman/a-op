<script setup lang="ts">
const route = useRoute()
const artist = useArtistConfig()
const { data, error } = await useFetch(() => `/api/releases/${String(route.params.slug)}`)
const audioPlayer = useAudioPlayer()
const previewStarted = ref(false)

const playableTracks = computed(() =>
  (data.value?.tracks ?? [])
    .filter((track) => track.preview?.url)
    .map((track) => ({
      id: track.id,
      slug: track.slug,
      title: track.title,
      artist: artist.identity.name,
      releaseTitle: data.value?.release.title,
      href: `/music/tracks/${track.slug}`,
      src: track.preview!.url,
    })),
)

watch(playableTracks, (tracks) => audioPlayer.loadQueue(tracks), { immediate: true })

function playTrack(trackId: string) {
  const index = playableTracks.value.findIndex(({ id }) => id === trackId)
  if (index < 0) return
  previewStarted.value = true
  audioPlayer.playAt(index)
}

useSeoMeta({
  title: () => data.value?.release.title ?? 'Release',
  description: () => data.value?.release.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page">
    <header class="release-page__heading">
      <p class="eyebrow">
        {{ data.release.release_type }} ·
        {{ data.release.release_date?.slice(0, 4) ?? 'Unscheduled' }}
      </p>
      <h1>{{ data.release.title }}</h1>
      <p>{{ data.release.description }}</p>
    </header>
    <ol class="tracklist" aria-label="Release track list">
      <li v-for="track in data.tracks" :key="track.id">
        <span class="tracklist__position">{{ String(track.position).padStart(2, '0') }}</span>
        <NuxtLink class="tracklist__title" :to="`/music/tracks/${track.slug}`">
          {{ track.title }}
        </NuxtLink>
        <button
          v-if="track.preview"
          class="tracklist__play"
          type="button"
          :aria-label="
            track.id === playableTracks[0]?.id ? 'Play public preview' : `Play ${track.title}`
          "
          @click="playTrack(track.id)"
        >
          Play preview
        </button>
        <span v-else class="tracklist__status">Preview processing</span>
      </li>
    </ol>
    <p v-if="previewStarted" class="playback-status" role="status">
      Public preview playback verified.
    </p>
    <section v-if="data.credits.length" class="release-credits" aria-labelledby="credits-heading">
      <p class="section-number">Credits</p>
      <h2 id="credits-heading">The people behind the release.</h2>
      <dl>
        <div v-for="credit in data.credits" :key="`${credit.position}-${credit.name}`">
          <dt>{{ credit.role }}</dt>
          <dd>{{ credit.name }}</dd>
        </div>
      </dl>
    </section>
    <p class="release-note">
      This fictional catalog contains no borrowed audio or private artist material.
    </p>
  </article>
  <div v-else class="page-frame interior-page">
    <p class="eyebrow">Catalog</p>
    <h1>{{ error ? 'Release not found.' : 'Loading release…' }}</h1>
  </div>
</template>
