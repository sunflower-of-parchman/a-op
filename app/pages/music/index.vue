<script setup lang="ts">
const { data } = await useFetch('/api/catalog')

useSeoMeta({ title: 'Music' })
</script>

<template>
  <div class="page-frame interior-page">
    <header class="page-heading">
      <p class="eyebrow">Catalog</p>
      <h1>Music in authored order.</h1>
      <p>Releases keep their sequence, credits, writing, listening, and direct support together.</p>
    </header>

    <section
      v-for="release in data?.releases"
      :key="release.id"
      class="release-row"
      :aria-labelledby="`release-${release.id}`"
    >
      <div>
        <p class="section-number">
          {{ release.release_type }} · {{ release.release_date?.slice(0, 4) ?? 'Unscheduled' }}
        </p>
        <h2 :id="`release-${release.id}`">
          <NuxtLink :to="`/music/${release.slug}`">{{ release.title }}</NuxtLink>
        </h2>
        <p>{{ release.description }}</p>
      </div>
      <ol class="compact-tracklist">
        <li v-for="track in release.tracks" :key="track.id">
          <span>{{ String(track.position).padStart(2, '0') }}</span>
          <NuxtLink :to="`/music/tracks/${track.slug}`">{{ track.title }}</NuxtLink>
        </li>
      </ol>
    </section>

    <section
      v-if="data?.collections.length"
      class="catalog-collections"
      aria-labelledby="collections-heading"
    >
      <p class="section-number">Collections</p>
      <h2 id="collections-heading">Another way through the catalog.</h2>
      <ul>
        <li v-for="collection in data.collections" :key="collection.id">
          <NuxtLink :to="`/music/collections/${collection.slug}`">{{ collection.title }}</NuxtLink>
          <p>{{ collection.description }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
