<script setup lang="ts">
const artist = useArtistConfig()
const catalog = {
  tracks: ['First Light, Repeated', 'A Measure of Distance', 'Turn Toward Home'],
}

useSeoMeta({ title: 'Music' })
</script>

<template>
  <div class="page-frame interior-page">
    <header class="page-heading">
      <p class="eyebrow">Catalog</p>
      <h1>Music in authored order.</h1>
      <p>Releases keep their sequence, credits, writing, listening, and direct support together.</p>
    </header>

    <section class="release-row" aria-labelledby="release-title">
      <div>
        <p class="section-number">DAY 001 · {{ artist.homepage.release.year }}</p>
        <h2 id="release-title">
          <NuxtLink :to="artist.homepage.release.href">{{
            artist.homepage.release.title
          }}</NuxtLink>
        </h2>
        <p>{{ artist.homepage.release.description }}</p>
      </div>
      <ol class="compact-tracklist">
        <li v-for="(track, index) in catalog.tracks" :key="track">
          <span>0{{ index + 1 }}</span>
          <span>{{ track }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
