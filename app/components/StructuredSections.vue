<script setup lang="ts">
import type { PageSection } from '#shared/schemas/page'

defineProps<{ sections: PageSection[] }>()
</script>

<template>
  <div class="structured-sections">
    <template v-for="section in sections" :key="section.id">
      <section v-if="section.type === 'prose'" class="structured-section structured-section--prose">
        <p v-if="section.eyebrow" class="section-number">{{ section.eyebrow }}</p>
        <div>
          <h2>{{ section.heading }}</h2>
          <p class="preserve-lines">{{ section.body }}</p>
        </div>
      </section>

      <figure
        v-else-if="section.type === 'image'"
        class="structured-section structured-section--image"
      >
        <NuxtImg :src="section.src" :alt="section.alt" loading="lazy" />
        <figcaption v-if="section.caption">{{ section.caption }}</figcaption>
      </figure>

      <section
        v-else-if="section.type === 'call_to_action'"
        class="structured-section structured-section--action"
      >
        <div>
          <h2>{{ section.heading }}</h2>
          <p v-if="section.body">{{ section.body }}</p>
        </div>
        <NuxtLink class="text-action text-action--primary" :to="section.href">{{
          section.label
        }}</NuxtLink>
      </section>

      <section
        v-else-if="section.type === 'credits'"
        class="structured-section structured-section--credits"
      >
        <h2>{{ section.heading }}</h2>
        <dl>
          <div v-for="item in section.items" :key="`${item.role}-${item.name}`">
            <dt>{{ item.role }}</dt>
            <dd>{{ item.name }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-else-if="section.type === 'links'"
        class="structured-section structured-section--links"
      >
        <h2>{{ section.heading }}</h2>
        <ul>
          <li v-for="item in section.items" :key="item.href">
            <a :href="item.href" rel="noreferrer">{{ item.label }}</a>
          </li>
        </ul>
      </section>

      <section
        v-else-if="section.type === 'featured_release'"
        class="structured-section structured-section--feature"
      >
        <p class="section-number">Featured release</p>
        <div>
          <h2>{{ section.heading }}</h2>
          <NuxtLink class="text-action" :to="`/music/${section.releaseSlug}`"
            >Open the release</NuxtLink
          >
        </div>
      </section>

      <section
        v-else-if="section.type === 'featured_learning'"
        class="structured-section structured-section--feature"
      >
        <p class="section-number">Featured learning</p>
        <div>
          <h2>{{ section.heading }}</h2>
          <NuxtLink class="text-action" :to="`/learn/${section.pathSlug}`">Open the path</NuxtLink>
        </div>
      </section>

      <section
        v-else-if="section.type === 'video'"
        class="structured-section structured-section--video"
      >
        <h2>{{ section.heading }}</h2>
        <video :src="section.url" controls preload="metadata">
          <p>Video playback is unavailable. A transcript follows.</p>
        </video>
        <details>
          <summary>Read transcript</summary>
          <p class="preserve-lines">{{ section.transcript }}</p>
        </details>
      </section>
    </template>
  </div>
</template>
