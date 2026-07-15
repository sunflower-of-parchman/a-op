export type LibraryTrack = {
  id: string
  slug: string
  title: string
  state: string
}

export type LibraryPlaylist = {
  id: string
  title: string
  description: string
  updated_at: string
  tracks: Array<LibraryTrack & { position: number }>
}

export type LibraryResponse =
  | { authenticated: false }
  | {
      authenticated: true
      favoriteTrackIds: string[]
      favorites: Array<LibraryTrack & { favoritedAt: string }>
      playlists: LibraryPlaylist[]
      history: Array<{
        id: string
        listened_at: string
        progress_ms: number
        completed: boolean
        track: LibraryTrack
      }>
    }
