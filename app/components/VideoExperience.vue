<script setup lang="ts">
import type { VideoRecord } from '#shared/types/learning'

defineProps<{ video: VideoRecord }>()
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
        :title="video.title"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <div v-else>
        <img v-if="video.posterUrl" class="external-video-poster" :src="video.posterUrl" alt="" />
        <p>
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
      <p class="preserve-lines">{{ video.transcript }}</p>
    </details>
    <dl class="video-credits">
      <div v-for="credit in video.credits" :key="`${credit.role}-${credit.name}`">
        <dt>{{ credit.role }}</dt>
        <dd>{{ credit.name }}</dd>
      </div>
    </dl>
  </div>
</template>
