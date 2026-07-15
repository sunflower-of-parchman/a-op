<script setup lang="ts">
const route = useRoute()
const artist = useArtistConfig()
const { data, error } = await useFetch(() => `/api/collections/${String(route.params.slug)}`)
const audioPlayer = useAudioPlayer()

const playableTracks = computed(() =>
  (data.value?.tracks ?? [])
    .filter((track) => track.preview?.url)
    .map((track) => ({
      id: track.id,
      slug: track.slug,
      title: track.title,
      artist: artist.identity.name,
      href: `/music/tracks/${track.slug}`,
      src: track.preview!.url,
    })),
)

watch(playableTracks, (tracks) => audioPlayer.loadQueue(tracks), { immediate: true })

useSeoMeta({
  title: () => data.value?.collection.title ?? 'Collection',
  description: () => data.value?.collection.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page">
    <header class="release-page__heading">
      <p class="eyebrow">Collection</p>
      <h1>{{ data.collection.title }}</h1>
      <p>{{ data.collection.description }}</p>
    </header>
    <ol class="tracklist" aria-label="Collection track list">
      <li v-for="track in data.tracks" :key="track.id">
        <span class="tracklist__position">{{ String(track.position).padStart(2, '0') }}</span>
        <NuxtLink class="tracklist__title" :to="`/music/tracks/${track.slug}`">
          {{ track.title }}
        </NuxtLink>
        <button
          v-if="track.preview"
          class="tracklist__play"
          type="button"
          :aria-label="`Play ${track.title}`"
          @click="audioPlayer.playAt(playableTracks.findIndex(({ id }) => id === track.id))"
        >
          Play preview
        </button>
      </li>
    </ol>
  </article>
  <div v-else class="page-frame interior-page">
    <p class="eyebrow">Catalog</p>
    <h1>{{ error ? 'Collection not found.' : 'Loading collection…' }}</h1>
  </div>
</template>
