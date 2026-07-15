<script setup lang="ts">
const { data: publishedConfig } = await useFetch('/api/site-config')
if (publishedConfig.value?.config) setArtistConfig(publishedConfig.value.config)

const artist = useArtistConfig()
const theme = useArtistTheme()
const route = useRoute()
const { loadPolicy, trackPage } = useTelemetry()
const hydrated = ref(false)
onMounted(async () => {
  await loadPolicy()
  hydrated.value = true
  await trackPage(route.path)
})

watch(
  () => route.path,
  (path) => void trackPage(path),
)

useSeoMeta({
  titleTemplate: (title) => (title ? `${title} · ${artist.seo.title}` : artist.seo.title),
  description: artist.seo.description,
  ogSiteName: artist.identity.name,
  ogType: 'website',
  ogImage: artist.seo.socialImage.src || undefined,
  ogImageAlt: artist.seo.socialImage.alt || undefined,
})
</script>

<template>
  <div class="site-shell" :style="theme" :data-hydrated="hydrated ? 'true' : 'false'">
    <NuxtRouteAnnouncer />
    <ArtistHeader />
    <main id="main-content" tabindex="-1">
      <NuxtPage />
    </main>
    <GlobalAudioPlayer />
    <ArtistFooter />
    <TelemetryConsent />
  </div>
</template>
