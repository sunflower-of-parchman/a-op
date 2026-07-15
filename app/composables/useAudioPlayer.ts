export type PlayerTrack = {
  id: string
  slug: string
  title: string
  artist: string
  releaseTitle?: string
  href: string
  src: string
}

export function useAudioPlayer() {
  const queue = useState<PlayerTrack[]>('audio-player:queue', () => [])
  const currentIndex = useState<number>('audio-player:index', () => -1)
  const shouldPlay = useState<boolean>('audio-player:should-play', () => false)
  const isPlaying = useState<boolean>('audio-player:is-playing', () => false)
  const currentTime = useState<number>('audio-player:current-time', () => 0)
  const duration = useState<number>('audio-player:duration', () => 0)

  const currentTrack = computed(() => queue.value[currentIndex.value] ?? null)

  function loadQueue(tracks: PlayerTrack[], preferredTrackId?: string) {
    const currentId = currentTrack.value?.id
    queue.value = tracks
    const nextId = preferredTrackId ?? currentId
    const nextIndex = nextId ? tracks.findIndex(({ id }) => id === nextId) : 0
    currentIndex.value = tracks.length ? Math.max(0, nextIndex) : -1
    if (!tracks.length) {
      shouldPlay.value = false
      isPlaying.value = false
    }
  }

  function playAt(index: number) {
    if (!queue.value[index]) return
    if (currentIndex.value !== index) {
      currentIndex.value = index
      currentTime.value = 0
    }
    shouldPlay.value = true
  }

  function playTrack(track: PlayerTrack) {
    const existingIndex = queue.value.findIndex(({ id }) => id === track.id)
    if (existingIndex >= 0) {
      playAt(existingIndex)
      return
    }
    queue.value = [track]
    currentIndex.value = 0
    currentTime.value = 0
    shouldPlay.value = true
  }

  function toggle() {
    if (!currentTrack.value) return
    shouldPlay.value = !shouldPlay.value
  }

  function pause() {
    shouldPlay.value = false
  }

  function previous() {
    if (!queue.value.length) return
    currentIndex.value = currentIndex.value > 0 ? currentIndex.value - 1 : queue.value.length - 1
    currentTime.value = 0
    shouldPlay.value = true
  }

  function next() {
    if (!queue.value.length) return
    currentIndex.value = currentIndex.value < queue.value.length - 1 ? currentIndex.value + 1 : 0
    currentTime.value = 0
    shouldPlay.value = true
  }

  return {
    queue,
    currentIndex,
    currentTrack,
    shouldPlay,
    isPlaying,
    currentTime,
    duration,
    loadQueue,
    playAt,
    playTrack,
    toggle,
    pause,
    previous,
    next,
  }
}
