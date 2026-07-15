<script setup lang="ts">
const online = useOnline()
</script>

<template>
  <p v-if="!online" class="connectivity-notice" role="status">
    You are offline. Published pages already in this browser may remain readable; account changes,
    checkout, and media requests will wait for a connection.
  </p>
</template>
