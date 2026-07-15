<script setup lang="ts">
const { currentTrack, shouldPlay, isPlaying, currentTime, duration, toggle, previous, next } =
  useAudioPlayer()
const audio = useTemplateRef<HTMLAudioElement>('audio')
const ready = ref(false)

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function updateMetadata() {
  if (!audio.value) return
  ready.value = audio.value.readyState >= HTMLMediaElement.HAVE_METADATA
  duration.value = Number.isFinite(audio.value.duration) ? audio.value.duration : 0
  currentTime.value = audio.value.currentTime
}

function seek(event: Event) {
  if (!audio.value) return
  const target = event.target as HTMLInputElement
  audio.value.currentTime = Number(target.value)
  currentTime.value = audio.value.currentTime
}

function skip(seconds: number) {
  if (!audio.value) return
  const upperBound = Number.isFinite(audio.value.duration) ? audio.value.duration : 0
  audio.value.currentTime = Math.min(Math.max(audio.value.currentTime + seconds, 0), upperBound)
  currentTime.value = audio.value.currentTime
}

async function synchronizePlayback() {
  if (!audio.value || !currentTrack.value) return
  if (shouldPlay.value) {
    try {
      await audio.value.play()
    } catch {
      shouldPlay.value = false
      isPlaying.value = false
    }
  } else {
    audio.value.pause()
  }
}

watch(
  () => currentTrack.value?.src,
  async () => {
    ready.value = false
    duration.value = 0
    currentTime.value = 0
    await nextTick()
    audio.value?.load()
    await synchronizePlayback()
  },
)

watch(shouldPlay, synchronizePlayback)

function handleKeydown(event: KeyboardEvent) {
  if (!currentTrack.value || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
  if (event.code === 'Space') {
    event.preventDefault()
    toggle()
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault()
    skip(-5)
  } else if (event.code === 'ArrowRight') {
    event.preventDefault()
    skip(5)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <audio
    ref="audio"
    :src="currentTrack?.src"
    preload="metadata"
    @loadedmetadata="updateMetadata"
    @durationchange="updateMetadata"
    @timeupdate="updateMetadata"
    @play="isPlaying = true"
    @pause="isPlaying = false"
    @ended="next"
  />
  <section v-if="currentTrack" class="global-player" aria-label="Persistent audio player">
    <div class="global-player__identity">
      <p class="section-number">Now playing</p>
      <NuxtLink :to="currentTrack.href">{{ currentTrack.title }}</NuxtLink>
      <span>{{ currentTrack.artist }}</span>
    </div>
    <div class="global-player__transport">
      <button
        type="button"
        aria-label="Previous track"
        aria-keyshortcuts="ArrowUp"
        @click="previous"
      >
        Previous
      </button>
      <button
        type="button"
        :aria-label="isPlaying ? 'Pause current track' : 'Play current track'"
        aria-keyshortcuts="Space"
        :disabled="!ready"
        @click="toggle"
      >
        {{ isPlaying ? 'Pause' : 'Play' }}
      </button>
      <button type="button" aria-label="Next track" aria-keyshortcuts="ArrowDown" @click="next">
        Next
      </button>
    </div>
    <label class="global-player__timeline">
      <span class="sr-only">Playback position</span>
      <span aria-hidden="true">{{ formatTime(currentTime) }}</span>
      <input
        type="range"
        min="0"
        :max="duration || 0"
        step="0.01"
        :value="currentTime"
        :disabled="!ready"
        @input="seek"
      />
      <span aria-hidden="true">{{ formatTime(duration) }}</span>
    </label>
  </section>
</template>
