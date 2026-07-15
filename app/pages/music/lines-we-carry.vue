<script setup lang="ts">
const artist = useArtistConfig()
const tracks = ['First Light, Repeated', 'A Measure of Distance', 'Turn Toward Home']
const { data } = await useFetch('/api/releases/lines-we-carry')
const player = useTemplateRef<HTMLAudioElement>('player')
const playing = ref(false)
const previewReady = ref(false)
const previewStarted = ref(false)

function markPreviewStarted() {
  playing.value = true
  previewStarted.value = true
}

async function togglePreview() {
  if (!player.value) return
  if (player.value.paused) {
    await player.value.play()
  } else {
    player.value.pause()
  }
}

useSeoMeta({ title: artist.homepage.release.title })
</script>

<template>
  <article class="page-frame release-page">
    <header class="release-page__heading">
      <p class="eyebrow">
        {{ artist.homepage.release.format }} · {{ artist.homepage.release.year }}
      </p>
      <h1>{{ artist.homepage.release.title }}</h1>
      <p>{{ artist.homepage.release.description }}</p>
    </header>
    <ol class="tracklist" aria-label="Release track list">
      <li v-for="(track, index) in tracks" :key="track">
        <span class="tracklist__position">0{{ index + 1 }}</span>
        <span class="tracklist__title">{{ track }}</span>
        <span class="tracklist__status">{{
          index === 0 && data?.preview ? 'Public preview' : 'Full track forthcoming'
        }}</span>
      </li>
    </ol>
    <section v-if="data?.preview" class="preview-player" aria-labelledby="preview-heading">
      <div>
        <p class="section-number">Public media</p>
        <h2 id="preview-heading">Playback, without surrendering the source.</h2>
      </div>
      <div>
        <p>
          The local demonstration uses a one-second, code-generated verification tone. The source
          and protected download remain private.
        </p>
        <audio
          ref="player"
          :src="data.preview.url"
          preload="metadata"
          @canplay="previewReady = true"
          @play="markPreviewStarted"
          @pause="playing = false"
          @ended="playing = false"
        />
        <button
          class="text-action text-action--primary"
          type="button"
          :disabled="!previewReady"
          @click="togglePreview"
        >
          {{ playing ? 'Pause public preview' : 'Play public preview' }}
        </button>
        <p v-if="previewStarted" class="playback-status" role="status">
          Public preview playback verified.
        </p>
      </div>
    </section>
    <p class="release-note">
      This fictional catalog contains no borrowed audio or private artist material.
    </p>
  </article>
</template>
