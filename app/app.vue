<script setup lang="ts">
const artist = useArtistConfig()
const theme = useArtistTheme()

useSeoMeta({
  titleTemplate: (title) => (title ? `${title} · ${artist.identity.name}` : artist.identity.name),
  description: artist.identity.statement,
  ogSiteName: artist.identity.name,
  ogType: 'website',
})
</script>

<template>
  <div class="site-shell" :style="theme">
    <NuxtRouteAnnouncer />
    <ArtistHeader />
    <main id="main-content" tabindex="-1">
      <NuxtPage />
    </main>
    <ArtistFooter />
  </div>
</template>
