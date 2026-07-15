<script setup lang="ts">
const artist = useArtistConfig()
</script>

<template>
  <div>
    <section class="hero page-frame" aria-labelledby="home-title">
      <div class="hero__copy">
        <p class="eyebrow">{{ artist.homepage.kicker }}</p>
        <h1 id="home-title">{{ artist.identity.statement }}</h1>
        <p class="hero__introduction">{{ artist.homepage.introduction }}</p>
        <div class="action-row">
          <NuxtLink class="text-action text-action--primary" :to="artist.homepage.release.href">
            Explore the release
          </NuxtLink>
          <NuxtLink class="text-action" to="/about">Meet the artist</NuxtLink>
        </div>
      </div>

      <NuxtLink
        class="release-sleeve"
        :to="artist.homepage.release.href"
        :aria-label="`Open ${artist.homepage.release.title}`"
      >
        <span class="release-sleeve__catalog">DAY 001 · {{ artist.homepage.release.year }}</span>
        <span class="release-sleeve__title">{{ artist.homepage.release.title }}</span>
        <span class="release-sleeve__format">{{ artist.homepage.release.format }}</span>
        <span class="release-sleeve__artist">{{ artist.identity.name }}</span>
      </NuxtLink>
    </section>

    <section class="principles page-frame" aria-labelledby="principles-title">
      <p class="section-number">01 / Artist-owned</p>
      <div class="principles__introduction">
        <h2 id="principles-title">One place for the whole practice.</h2>
        <p>
          Music can be heard, understood, taught, licensed, and supported without losing the context
          that gave it meaning.
        </p>
      </div>
      <ol class="principle-list">
        <li v-for="(principle, index) in artist.homepage.principles" :key="principle.label">
          <span>0{{ index + 1 }}</span>
          <h3>{{ principle.label }}</h3>
          <p>{{ principle.text }}</p>
        </li>
      </ol>
    </section>

    <section class="ownership-statement page-frame" aria-labelledby="ownership-title">
      <p class="section-number">02 / Portable</p>
      <h2 id="ownership-title">
        The repository, domain, content, and customer relationship stay with the artist.
      </h2>
      <p>
        Codex helps operate the installation. The public experience remains a direct encounter
        between an artist and the people who arrive.
      </p>
    </section>
  </div>
</template>
