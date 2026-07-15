<script setup lang="ts">
const artist = useArtistConfig()
const year = new Date().getUTCFullYear()
</script>

<template>
  <footer class="site-footer">
    <p>{{ artist.identity.name }}</p>
    <p class="site-footer__statement">{{ artist.identity.statement }}</p>
    <p class="site-footer__meta">Fictional demonstration · {{ year }}</p>
  </footer>
</template>
