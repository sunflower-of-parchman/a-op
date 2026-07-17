<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const route = useRoute()
const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data, error } = await useFetch(() => `/api/collections/${String(route.params.slug)}`)
const audioPlayer = useAudioPlayer()

const playableTracks = computed(() =>
  (data.value?.tracks ?? [])
    .filter((track) => track.preview?.url)
    .map((track) => ({
      id: track.id,
      slug: track.slug,
      title: starterMode ? starterLayoutContent.releaseDetail.trackTitle : track.title,
      artist: starterMode ? starterLayoutContent.featuredRelease.artist : artist.identity.name,
      href: `/music/tracks/${track.slug}`,
      src: track.preview!.url,
    })),
)

watch(playableTracks, (tracks) => audioPlayer.loadQueue(tracks), { immediate: true })

useSeoMeta({
  title: () =>
    starterMode
      ? starterLayoutContent.collectionDetail.title
      : (data.value?.collection.title ?? 'Collection'),
  description: () =>
    starterMode
      ? starterLayoutContent.collectionDetail.description
      : data.value?.collection.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page">
    <header class="release-page__heading">
      <h1>
        {{ starterMode ? starterLayoutContent.collectionDetail.title : data.collection.title }}
      </h1>
      <p>
        {{
          starterMode
            ? starterLayoutContent.collectionDetail.description
            : data.collection.description
        }}
      </p>
    </header>
    <ol class="tracklist" aria-label="Collection track list">
      <li v-for="track in data.tracks" :key="track.id">
        <span class="tracklist__position">{{ String(track.position).padStart(2, '0') }}</span>
        <NuxtLink class="tracklist__title" :to="`/music/tracks/${track.slug}`">
          {{
            starterMode
              ? `${starterLayoutContent.releaseDetail.trackTitle} ${String(track.position).padStart(2, '0')}`
              : track.title
          }}
        </NuxtLink>
        <button
          v-if="track.preview"
          class="tracklist__play"
          type="button"
          :aria-label="
            starterMode
              ? `${starterLayoutContent.releaseDetail.playAction} ${String(track.position).padStart(2, '0')}`
              : `Play ${track.title}`
          "
          @click="audioPlayer.playAt(playableTracks.findIndex(({ id }) => id === track.id))"
        >
          {{ starterMode ? starterLayoutContent.releaseDetail.playAction : 'Play preview' }}
        </button>
      </li>
    </ol>
  </article>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Collection not found.' : 'Loading collection…' }}</h1>
  </div>
</template>
