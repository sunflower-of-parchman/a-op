<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const { data: publishedConfig } = await useFetch('/api/site-config')
if (publishedConfig.value?.config) setArtistConfig(publishedConfig.value.config)

const artist = useArtistConfig()
const starterMode = useStarterMode()
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
  titleTemplate: (title) =>
    starterMode
      ? title
        ? `${title} · ${starterLayoutContent.seo.title}`
        : starterLayoutContent.seo.title
      : title
        ? `${title} · ${artist.seo.title}`
        : artist.seo.title,
  description: starterMode ? starterLayoutContent.seo.description : artist.seo.description,
  ogSiteName: starterMode ? starterLayoutContent.brand : artist.identity.name,
  ogType: 'website',
  ogImage: artist.seo.socialImage.src || undefined,
  ogImageAlt: artist.seo.socialImage.alt || undefined,
})

if (starterMode) useSeoMeta({ robots: 'noindex, nofollow' })
</script>

<template>
  <div
    class="site-shell"
    :style="theme"
    :data-hydrated="hydrated ? 'true' : 'false'"
    :data-starter-layout="starterMode ? 'true' : 'false'"
  >
    <NuxtRouteAnnouncer />
    <ArtistHeader />
    <ConnectivityNotice />
    <main id="main-content" tabindex="-1">
      <NuxtPage />
    </main>
    <GlobalAudioPlayer />
    <ArtistFooter />
    <TelemetryConsent />
  </div>
</template>
