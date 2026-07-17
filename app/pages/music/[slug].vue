<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const route = useRoute()
const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data, error } = await useFetch(() => `/api/releases/${String(route.params.slug)}`)
const audioPlayer = useAudioPlayer()
const previewStarted = ref(false)

const playableTracks = computed(() =>
  (data.value?.tracks ?? [])
    .filter((track) => track.preview?.url)
    .map((track) => ({
      id: track.id,
      slug: track.slug,
      title: starterMode ? starterLayoutContent.releaseDetail.trackTitle : track.title,
      artist: starterMode ? starterLayoutContent.featuredRelease.artist : artist.identity.name,
      releaseTitle: starterMode
        ? starterLayoutContent.releaseDetail.title
        : data.value?.release.title,
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
  title: () =>
    starterMode
      ? starterLayoutContent.releaseDetail.title
      : (data.value?.release.title ?? 'Release'),
  description: () =>
    starterMode ? starterLayoutContent.releaseDetail.description : data.value?.release.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page">
    <header class="release-page__heading">
      <p class="eyebrow">
        {{
          starterMode
            ? starterLayoutContent.releaseDetail.metadata
            : `${data.release.release_type} · ${data.release.release_date?.slice(0, 4) ?? 'Unscheduled'}`
        }}
      </p>
      <h1>
        {{ starterMode ? starterLayoutContent.releaseDetail.title : data.release.title }}
      </h1>
      <p>
        {{
          starterMode ? starterLayoutContent.releaseDetail.description : data.release.description
        }}
      </p>
    </header>
    <ol class="tracklist" aria-label="Release track list">
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
              : track.id === playableTracks[0]?.id
                ? 'Play public preview'
                : `Play ${track.title}`
          "
          @click="playTrack(track.id)"
        >
          {{ starterMode ? starterLayoutContent.releaseDetail.playAction : 'Play preview' }}
        </button>
        <span v-else class="tracklist__status">
          {{
            starterMode ? starterLayoutContent.releaseDetail.previewStatus : 'Preview processing'
          }}
        </span>
      </li>
    </ol>
    <p v-if="previewStarted" class="playback-status" role="status">
      {{
        starterMode
          ? starterLayoutContent.releaseDetail.playbackStatus
          : 'Public preview playback verified.'
      }}
    </p>
    <section v-if="data.credits.length" class="release-credits" aria-labelledby="credits-heading">
      <p class="section-number">
        {{ starterMode ? starterLayoutContent.releaseDetail.creditsLabel : 'Credits' }}
      </p>
      <h2 id="credits-heading">
        {{
          starterMode
            ? starterLayoutContent.releaseDetail.creditsHeading
            : 'The people behind the release.'
        }}
      </h2>
      <dl>
        <div v-for="credit in data.credits" :key="`${credit.position}-${credit.name}`">
          <dt>
            {{ starterMode ? starterLayoutContent.releaseDetail.creditRole : credit.role }}
          </dt>
          <dd>
            {{ starterMode ? starterLayoutContent.releaseDetail.creditName : credit.name }}
          </dd>
        </div>
      </dl>
    </section>
    <p class="release-note">
      {{
        starterMode
          ? starterLayoutContent.releaseDetail.note
          : 'This fictional catalog contains no borrowed audio or private artist material.'
      }}
    </p>
  </article>
  <div v-else class="page-frame interior-page">
    <p class="eyebrow">Catalog</p>
    <h1>{{ error ? 'Release not found.' : 'Loading release…' }}</h1>
  </div>
</template>
