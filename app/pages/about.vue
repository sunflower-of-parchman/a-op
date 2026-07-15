<script setup lang="ts">
const artist = useArtistConfig()
const { data: page } = await useFetch('/api/pages/about')
useSeoMeta({
  title: page.value?.seo.title ?? 'About',
  description: page.value?.seo.description,
})
</script>

<template>
  <article class="page-frame interior-page about-page">
    <header class="page-heading">
      <p class="eyebrow">{{ artist.identity.eyebrow }}</p>
      <h1>{{ artist.identity.name }}</h1>
      <p>{{ artist.identity.biography }}</p>
    </header>
    <dl class="artist-facts">
      <div>
        <dt>Based in</dt>
        <dd>{{ artist.identity.location }}</dd>
      </div>
      <div>
        <dt>This demonstration</dt>
        <dd>Fictional, original, and ready to be replaced through guided setup.</dd>
      </div>
    </dl>
    <StructuredSections v-if="page" :sections="page.sections" />
  </article>
</template>
