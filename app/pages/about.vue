<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data: page } = await useFetch('/api/pages/about')
useSeoMeta({
  title: starterMode ? 'About' : (page.value?.seo.title ?? 'About'),
  description: starterMode ? starterLayoutContent.seo.description : page.value?.seo.description,
})
</script>

<template>
  <article class="page-frame interior-page about-page">
    <header class="page-heading">
      <h1>{{ starterMode ? starterLayoutContent.about.title : artist.identity.name }}</h1>
      <p>
        {{ starterMode ? starterLayoutContent.about.introduction : artist.identity.biography }}
      </p>
    </header>
    <dl class="artist-facts">
      <div>
        <dt>{{ starterMode ? starterLayoutContent.about.locationLabel : 'Based in' }}</dt>
        <dd>{{ starterMode ? starterLayoutContent.about.location : artist.identity.location }}</dd>
      </div>
      <div>
        <dt>{{ starterMode ? starterLayoutContent.about.factLabel : 'This demonstration' }}</dt>
        <dd>
          {{
            starterMode
              ? starterLayoutContent.about.fact
              : 'Fictional, original, and ready to be replaced through guided setup.'
          }}
        </dd>
      </div>
    </dl>
    <StructuredSections v-if="page" :sections="page.sections" :starter="starterMode" />
  </article>
</template>
