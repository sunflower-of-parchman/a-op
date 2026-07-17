<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { VideoRecord } from '#shared/types/learning'

withDefaults(defineProps<{ video: VideoRecord; starter?: boolean }>(), { starter: false })
const externalLoaded = ref(false)
</script>

<template>
  <div class="video-experience">
    <div v-if="video.provider === 'hosted' && video.mediaUrl" class="video-frame">
      <video
        :src="video.mediaUrl"
        :poster="video.posterUrl ?? undefined"
        controls
        preload="metadata"
      >
        <p>Video playback is unavailable. The complete transcript follows.</p>
      </video>
    </div>
    <div v-else-if="video.embedUrl" class="external-video-consent">
      <iframe
        v-if="externalLoaded"
        class="video-frame"
        :src="video.embedUrl"
        :title="starter ? starterLayoutContent.video.itemTitle : video.title"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <div v-else>
        <img
          v-if="video.posterUrl && !starter"
          class="external-video-poster"
          :src="video.posterUrl"
          alt=""
        />
        <p v-if="starter">{{ starterLayoutContent.video.providerNotice }}</p>
        <p v-else>
          This approved video is hosted by {{ video.provider }}. Loading it shares your request with
          that provider.
        </p>
        <button class="text-action" type="button" @click="externalLoaded = true">
          Load external video
        </button>
      </div>
    </div>
    <details class="video-transcript">
      <summary>Read transcript</summary>
      <p class="preserve-lines">
        {{ starter ? starterLayoutContent.video.transcript : video.transcript }}
      </p>
    </details>
    <dl class="video-credits">
      <div v-for="credit in video.credits" :key="`${credit.role}-${credit.name}`">
        <dt>{{ starter ? starterLayoutContent.video.creditRole : credit.role }}</dt>
        <dd>{{ starter ? starterLayoutContent.video.creditName : credit.name }}</dd>
      </div>
    </dl>
  </div>
</template>
