<script setup lang="ts">
const artist = useArtistConfig()
</script>

<template>
  <footer class="site-footer">
    <p>{{ artist.identity.name }}</p>
    <p class="site-footer__statement">{{ artist.footer.statement }}</p>
    <div v-if="artist.identity.socialLinks.length || artist.identity.distributionLinks.length">
      <a
        v-for="link in [...artist.identity.socialLinks, ...artist.identity.distributionLinks]"
        :key="link.url"
        :href="link.url"
        rel="noreferrer"
        >{{ link.label }}</a
      >
    </div>
    <p class="site-footer__meta">{{ artist.footer.copyright }}</p>
  </footer>
</template>
