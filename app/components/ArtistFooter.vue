<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const artist = useArtistConfig()
const starterMode = useStarterMode()
</script>

<template>
  <footer class="site-footer">
    <p :data-starter-placeholder="starterMode ? 'footer-artist-name' : undefined">
      {{ starterMode ? starterLayoutContent.footer.artist : artist.identity.name }}
    </p>
    <p
      class="site-footer__statement"
      :data-starter-placeholder="starterMode ? 'footer-statement' : undefined"
    >
      {{ starterMode ? starterLayoutContent.footer.statement : artist.footer.statement }}
    </p>
    <div
      v-if="
        !starterMode &&
        (artist.identity.socialLinks.length || artist.identity.distributionLinks.length)
      "
    >
      <a
        v-for="link in [...artist.identity.socialLinks, ...artist.identity.distributionLinks]"
        :key="link.url"
        :href="link.url"
        rel="noreferrer"
        >{{ link.label }}</a
      >
    </div>
    <p
      class="site-footer__meta"
      :data-starter-placeholder="starterMode ? 'footer-metadata' : undefined"
    >
      {{ starterMode ? starterLayoutContent.footer.metadata : artist.footer.copyright }}
    </p>
  </footer>
</template>
