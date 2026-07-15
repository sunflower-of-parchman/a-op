<script setup lang="ts">
const artist = useArtistConfig()

const navigation = computed(() =>
  artist.navigation.filter((item) => !item.feature || artist.features[item.feature]),
)
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <p class="demo-notice">{{ artist.demo.notice }}</p>
  <header class="site-header">
    <NuxtLink class="wordmark" to="/" :aria-label="`${artist.identity.name} home`">
      <NuxtImg
        v-if="artist.design.logo.kind === 'image' && artist.design.logo.assetPath"
        :src="artist.design.logo.assetPath"
        :alt="artist.design.logo.alt"
      />
      <template v-else>{{ artist.design.logo.wordmark }}</template>
    </NuxtLink>
    <nav aria-label="Primary navigation">
      <ul class="primary-navigation">
        <li v-for="item in navigation" :key="item.to">
          <NuxtLink :to="item.to">{{ item.label }}</NuxtLink>
        </li>
        <li><NuxtLink to="/account">Account</NuxtLink></li>
      </ul>
    </nav>
  </header>
</template>
