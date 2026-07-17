<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { PageSection } from '#shared/schemas/page'

withDefaults(defineProps<{ sections: PageSection[]; starter?: boolean }>(), { starter: false })
</script>

<template>
  <div class="structured-sections">
    <template v-for="section in sections" :key="section.id">
      <section v-if="section.type === 'prose'" class="structured-section structured-section--prose">
        <p v-if="starter || section.eyebrow" class="section-number">
          {{ starter ? starterLayoutContent.structuredSection.label : section.eyebrow }}
        </p>
        <div>
          <h2>
            {{ starter ? starterLayoutContent.structuredSection.heading : section.heading }}
          </h2>
          <p class="preserve-lines">
            {{ starter ? starterLayoutContent.structuredSection.body : section.body }}
          </p>
        </div>
      </section>

      <figure
        v-else-if="section.type === 'image'"
        class="structured-section structured-section--image"
      >
        <NuxtImg
          :src="section.src"
          :alt="starter ? starterLayoutContent.structuredSection.imageAlt : section.alt"
          loading="lazy"
        />
        <figcaption v-if="starter || section.caption">
          {{ starter ? starterLayoutContent.structuredSection.imageCaption : section.caption }}
        </figcaption>
      </figure>

      <section
        v-else-if="section.type === 'call_to_action'"
        class="structured-section structured-section--action"
      >
        <div>
          <h2>
            {{ starter ? starterLayoutContent.structuredSection.heading : section.heading }}
          </h2>
          <p v-if="starter || section.body">
            {{ starter ? starterLayoutContent.structuredSection.body : section.body }}
          </p>
        </div>
        <NuxtLink class="text-action text-action--primary" :to="section.href">
          {{ starter ? starterLayoutContent.structuredSection.action : section.label }}
        </NuxtLink>
      </section>

      <section
        v-else-if="section.type === 'credits'"
        class="structured-section structured-section--credits"
      >
        <h2>{{ starter ? starterLayoutContent.structuredSection.heading : section.heading }}</h2>
        <dl>
          <div v-for="item in section.items" :key="`${item.role}-${item.name}`">
            <dt>{{ starter ? starterLayoutContent.structuredSection.creditRole : item.role }}</dt>
            <dd>{{ starter ? starterLayoutContent.structuredSection.creditName : item.name }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-else-if="section.type === 'links'"
        class="structured-section structured-section--links"
      >
        <h2>{{ starter ? starterLayoutContent.structuredSection.heading : section.heading }}</h2>
        <ul>
          <li v-for="item in section.items" :key="item.href">
            <a :href="item.href" target="_blank" rel="noopener noreferrer">
              {{ starter ? starterLayoutContent.structuredSection.link : item.label }}
            </a>
          </li>
        </ul>
      </section>

      <section
        v-else-if="section.type === 'featured_release'"
        class="structured-section structured-section--feature"
      >
        <p class="section-number">
          {{
            starter
              ? starterLayoutContent.structuredSection.featuredReleaseLabel
              : 'Featured release'
          }}
        </p>
        <div>
          <h2>
            {{
              starter
                ? starterLayoutContent.structuredSection.featuredReleaseHeading
                : section.heading
            }}
          </h2>
          <NuxtLink class="text-action" :to="`/music/${section.releaseSlug}`">
            {{
              starter
                ? starterLayoutContent.structuredSection.featuredReleaseAction
                : 'Open the release'
            }}
          </NuxtLink>
        </div>
      </section>

      <section
        v-else-if="section.type === 'featured_learning'"
        class="structured-section structured-section--feature"
      >
        <p class="section-number">
          {{
            starter
              ? starterLayoutContent.structuredSection.featuredLearningLabel
              : 'Featured learning'
          }}
        </p>
        <div>
          <h2>
            {{
              starter
                ? starterLayoutContent.structuredSection.featuredLearningHeading
                : section.heading
            }}
          </h2>
          <NuxtLink class="text-action" :to="`/learn/${section.pathSlug}`">
            {{
              starter
                ? starterLayoutContent.structuredSection.featuredLearningAction
                : 'Open the path'
            }}
          </NuxtLink>
        </div>
      </section>

      <section
        v-else-if="section.type === 'video'"
        class="structured-section structured-section--video"
      >
        <h2>
          {{ starter ? starterLayoutContent.structuredSection.videoHeading : section.heading }}
        </h2>
        <video :src="section.url" controls preload="metadata">
          <p>Video playback is unavailable. A transcript follows.</p>
        </video>
        <details>
          <summary>Read transcript</summary>
          <p class="preserve-lines">
            {{
              starter ? starterLayoutContent.structuredSection.videoTranscript : section.transcript
            }}
          </p>
        </details>
      </section>

      <section
        v-else-if="section.type === 'contact'"
        class="structured-section structured-section--contact"
      >
        <p class="section-number">Contact form</p>
        <div>
          <h2>{{ starter ? 'Contact Page Heading' : section.heading }}</h2>
          <p>{{ starter ? 'Contact Page Introduction' : section.introduction }}</p>
          <p class="field-help">
            {{ starter ? 'Contact Form Consent Text' : section.consentLabel }}
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
