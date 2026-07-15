<script setup lang="ts">
const artist = useArtistConfig()
const tracks = ['First Light, Repeated', 'A Measure of Distance', 'Turn Toward Home']

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
        <span class="tracklist__status">Preview pending approved media</span>
      </li>
    </ol>
    <p class="release-note">
      This fictional catalog contains no borrowed audio. The working media pipeline will add an
      original demonstration preview with its source and rights recorded.
    </p>
  </article>
</template>
