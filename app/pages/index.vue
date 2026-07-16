<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'

const artist = useArtistConfig()
const starterMode = useStarterMode()

const principles = computed(() =>
  starterMode ? starterLayoutContent.supportingSection.items : artist.homepage.principles,
)
</script>

<template>
  <div>
    <section class="hero page-frame" aria-labelledby="home-title">
      <div class="hero__copy">
        <p class="eyebrow" :data-starter-placeholder="starterMode ? 'homepage-kicker' : undefined">
          {{ starterMode ? starterLayoutContent.hero.kicker : artist.homepage.kicker }}
        </p>
        <h1
          id="home-title"
          :data-starter-placeholder="starterMode ? 'homepage-headline' : undefined"
        >
          {{ starterMode ? starterLayoutContent.hero.headline : artist.identity.statement }}
        </h1>
        <p
          class="hero__introduction"
          :data-starter-placeholder="starterMode ? 'homepage-introduction' : undefined"
        >
          {{ starterMode ? starterLayoutContent.hero.introduction : artist.homepage.introduction }}
        </p>
        <div class="action-row">
          <NuxtLink
            class="text-action text-action--primary"
            :to="artist.homepage.release.href"
            :data-starter-placeholder="starterMode ? 'primary-action' : undefined"
          >
            {{ starterMode ? starterLayoutContent.hero.primaryAction : 'Explore the release' }}
          </NuxtLink>
          <NuxtLink
            class="text-action"
            to="/about"
            :data-starter-placeholder="starterMode ? 'secondary-action' : undefined"
          >
            {{ starterMode ? starterLayoutContent.hero.secondaryAction : 'Meet the artist' }}
          </NuxtLink>
        </div>
      </div>

      <figure v-if="!starterMode && artist.homepage.heroImage.src" class="hero-image">
        <NuxtImg
          :src="artist.homepage.heroImage.src"
          :alt="artist.homepage.heroImage.alt"
          sizes="sm:100vw lg:50vw"
        />
      </figure>
      <NuxtLink
        v-else
        class="release-sleeve"
        :to="artist.homepage.release.href"
        :aria-label="
          starterMode
            ? 'Featured release or artwork placeholder'
            : `Open ${artist.homepage.release.title}`
        "
        :data-starter-placeholder="starterMode ? 'featured-release-artwork' : undefined"
      >
        <span class="release-sleeve__catalog">
          {{
            starterMode
              ? starterLayoutContent.featuredRelease.metadata
              : `DAY 001 · ${artist.homepage.release.year}`
          }}
        </span>
        <span class="release-sleeve__title">
          {{
            starterMode ? starterLayoutContent.featuredRelease.title : artist.homepage.release.title
          }}
        </span>
        <span class="release-sleeve__format">
          {{
            starterMode
              ? starterLayoutContent.featuredRelease.format
              : artist.homepage.release.format
          }}
        </span>
        <span class="release-sleeve__artist">
          {{ starterMode ? starterLayoutContent.featuredRelease.artist : artist.identity.name }}
        </span>
      </NuxtLink>
    </section>

    <section class="principles page-frame" aria-labelledby="principles-title">
      <p
        class="section-number"
        :data-starter-placeholder="starterMode ? 'supporting-section-label' : undefined"
      >
        {{ starterMode ? starterLayoutContent.supportingSection.label : '01 / Artist-owned' }}
      </p>
      <div class="principles__introduction">
        <h2
          id="principles-title"
          :data-starter-placeholder="starterMode ? 'supporting-section-headline' : undefined"
        >
          {{
            starterMode
              ? starterLayoutContent.supportingSection.headline
              : 'One place for the whole practice.'
          }}
        </h2>
        <p :data-starter-placeholder="starterMode ? 'supporting-section-text' : undefined">
          {{
            starterMode
              ? starterLayoutContent.supportingSection.introduction
              : 'Music can be heard, understood, taught, licensed, and supported without losing the context that gave it meaning.'
          }}
        </p>
      </div>
      <ol class="principle-list">
        <li v-for="(principle, index) in principles" :key="`${index}-${principle.label}`">
          <span>0{{ index + 1 }}</span>
          <h3 :data-starter-placeholder="starterMode ? 'list-item-heading' : undefined">
            {{ principle.label }}
          </h3>
          <p :data-starter-placeholder="starterMode ? 'list-item-description' : undefined">
            {{ principle.text }}
          </p>
        </li>
      </ol>
    </section>

    <section class="ownership-statement page-frame" aria-labelledby="ownership-title">
      <p
        class="section-number"
        :data-starter-placeholder="starterMode ? 'closing-section-label' : undefined"
      >
        {{ starterMode ? starterLayoutContent.closingSection.label : '02 / Portable' }}
      </p>
      <h2
        id="ownership-title"
        :data-starter-placeholder="starterMode ? 'closing-section-headline' : undefined"
      >
        {{
          starterMode
            ? starterLayoutContent.closingSection.headline
            : 'The repository, domain, content, and customer relationship stay with the artist.'
        }}
      </h2>
      <p :data-starter-placeholder="starterMode ? 'closing-section-text' : undefined">
        {{
          starterMode
            ? starterLayoutContent.closingSection.text
            : 'Codex helps operate the installation. The public experience remains a direct encounter between an artist and the people who arrive.'
        }}
      </p>
    </section>
  </div>
</template>
