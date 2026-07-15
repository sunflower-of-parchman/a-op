<script setup lang="ts">
const { data } = await useFetch('/api/catalog')
const { track: recordTelemetry } = useTelemetry()
const query = ref('')
const appliedQuery = ref('')

const filteredReleases = computed(() => {
  const normalized = appliedQuery.value.trim().toLowerCase()
  if (!normalized) return data.value?.releases ?? []
  return (data.value?.releases ?? []).filter(
    (release) =>
      release.title.toLowerCase().includes(normalized) ||
      release.description.toLowerCase().includes(normalized) ||
      release.tracks.some((track) => (track.title ?? '').toLowerCase().includes(normalized)),
  )
})

const filteredCollections = computed(() => {
  const normalized = appliedQuery.value.trim().toLowerCase()
  if (!normalized) return data.value?.collections ?? []
  return (data.value?.collections ?? []).filter(
    (collection) =>
      collection.title.toLowerCase().includes(normalized) ||
      collection.description.toLowerCase().includes(normalized),
  )
})

function searchCatalog() {
  appliedQuery.value = query.value
  const resultCount =
    filteredReleases.value.reduce((count, release) => count + release.tracks.length + 1, 0) +
    filteredCollections.value.length
  void recordTelemetry('catalog_search', { value: resultCount })
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

    <form class="catalog-search" role="search" @submit.prevent="searchCatalog">
      <label>
        <span>Search this artist's catalog</span>
        <input v-model="query" type="search" autocomplete="off" />
      </label>
      <button class="text-action" type="submit">Search</button>
    </form>

    <p v-if="appliedQuery" class="catalog-search__result" role="status">
      Showing {{ filteredReleases.length }} releases and {{ filteredCollections.length }}
      collections. Search words stay in this browser and are not recorded in analytics.
    </p>

    <section
      v-for="release in filteredReleases"
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
      v-if="filteredCollections.length"
      class="catalog-collections"
      aria-labelledby="collections-heading"
    >
      <p class="section-number">Collections</p>
      <h2 id="collections-heading">Another way through the catalog.</h2>
      <ul>
        <li v-for="collection in filteredCollections" :key="collection.id">
          <NuxtLink :to="`/music/collections/${collection.slug}`">{{ collection.title }}</NuxtLink>
          <p>{{ collection.description }}</p>
        </li>
      </ul>
    </section>

    <p v-if="appliedQuery && !filteredReleases.length && !filteredCollections.length">
      No published music matches this search.
    </p>
  </div>
</template>
