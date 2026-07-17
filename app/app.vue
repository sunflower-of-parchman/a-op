<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const { data: publishedConfig } = await useFetch('/api/site-config')
if (publishedConfig.value?.config) setArtistConfig(publishedConfig.value.config)

const artist = useArtistConfig()
const starterMode = useStarterMode()
const artistTheme = useArtistTheme()
const { colorMode } = useSiteColorMode()
const theme = computed(() => ({
  ...artistTheme,
  ...(starterMode
    ? {
        '--font-display': 'Lato, sans-serif',
        '--font-body': 'Lato, sans-serif',
        '--font-display-weight': '300',
        '--font-body-weight': '300',
      }
    : {}),
  ...(colorMode.value === 'dark'
    ? {
        '--color-background': '#0b0d0e',
        '--color-text': '#f4f1ea',
        '--color-muted-text': '#a7a39b',
        '--color-accent': '#df6b35',
        '--color-surface': '#15181a',
        '--color-border': '#363a3d',
        '--color-focus': '#76cbc8',
      }
    : {}),
}))
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

useHead(() => ({
  htmlAttrs: { 'data-color-mode': colorMode.value },
  meta: [
    {
      key: 'theme-color',
      name: 'theme-color',
      content: colorMode.value === 'dark' ? '#0b0d0e' : artist.design.colors.background,
    },
    { key: 'color-scheme', name: 'color-scheme', content: 'light dark' },
  ],
}))
</script>

<template>
  <div
    class="site-shell"
    :style="theme"
    :data-hydrated="hydrated ? 'true' : 'false'"
    :data-starter-layout="starterMode ? 'true' : 'false'"
    :data-color-mode="colorMode"
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
