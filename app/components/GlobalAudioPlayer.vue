<script setup lang="ts">
const { currentTrack, shouldPlay, isPlaying, currentTime, duration, toggle, previous, next } =
  useAudioPlayer()
const audio = useTemplateRef<HTMLAudioElement>('audio')
const { policy, track } = useTelemetry()
const ready = ref(false)
const lastHistorySignature = ref('')
const lastMediaStartTrack = ref('')
const meaningfulTracks = ref<string[]>([])

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
  const trackId = currentTrack.value?.id
  const trackSlug = currentTrack.value?.slug
  if (!trackId || !trackSlug || meaningfulTracks.value.includes(trackId)) return
  const configuredThreshold = policy.value?.meaningfulListenSeconds ?? 10
  const durationThreshold =
    duration.value > 0 ? Math.max(0.5, duration.value * 0.8) : configuredThreshold
  const threshold = Math.min(configuredThreshold, durationThreshold)
  if (currentTime.value >= threshold) {
    meaningfulTracks.value = [...meaningfulTracks.value, trackId]
    void track('meaningful_listen', {
      resourceType: 'track',
      resourceKey: trackSlug,
      value: Math.max(1, Math.round(currentTime.value)),
    })
  }
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

async function recordHistory(completed: boolean) {
  if (!currentTrack.value) return
  const progressMs = Math.max(0, Math.round(currentTime.value * 1000))
  if (!completed && progressMs === 0) return
  const signature = `${currentTrack.value.id}:${Math.floor(progressMs / 5000)}:${completed}`
  if (signature === lastHistorySignature.value) return
  try {
    await $fetch('/api/library/history', {
      method: 'POST',
      body: { trackId: currentTrack.value.id, progressMs, completed },
    })
    lastHistorySignature.value = signature
  } catch {
    // Public listening remains available when there is no signed-in library.
  }
}

function handlePause() {
  isPlaying.value = false
  void recordHistory(false)
}

function handleEnded() {
  void recordHistory(true)
  next()
}

function handlePlay() {
  isPlaying.value = true
  if (!currentTrack.value || lastMediaStartTrack.value === currentTrack.value.id) return
  lastMediaStartTrack.value = currentTrack.value.id
  void track('media_start', {
    resourceType: 'track',
    resourceKey: currentTrack.value.slug,
  })
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
    @play="handlePlay"
    @pause="handlePause"
    @ended="handleEnded"
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
