import type { CSSProperties } from 'vue'
import { artistConfigSchema, type ArtistConfig } from '#shared/schemas/artistConfig'

export function useArtistConfig(): ArtistConfig {
  const runtimeConfig = useRuntimeConfig()
  const config = useState<ArtistConfig>('artist-config', () =>
    artistConfigSchema.parse(runtimeConfig.public.artist),
  )
  return config.value
}

export function setArtistConfig(value: unknown): ArtistConfig {
  const parsed = artistConfigSchema.parse(value)
  const config = useState<ArtistConfig>('artist-config')
  config.value = parsed
  return parsed
}

export function useArtistTheme(): CSSProperties {
  return artistThemeFromConfig(useArtistConfig())
}

export function artistThemeFromConfig({ design }: ArtistConfig): CSSProperties {
  return {
    '--color-background': design.colors.background,
    '--color-text': design.colors.text,
    '--color-muted-text': design.colors.mutedText,
    '--color-accent': design.colors.accent,
    '--color-surface': design.colors.surface,
    '--color-border': design.colors.border,
    '--color-focus': design.colors.focus,
    '--font-display': design.typography.displayFamily,
    '--font-body': design.typography.bodyFamily,
    '--font-base-size': design.typography.baseSize,
    '--font-display-weight': String(design.typography.displayWeight),
    '--font-body-weight': String(design.typography.bodyWeight),
    '--space-unit': design.spacing.baseUnit,
    '--content-max': design.spacing.contentMax,
    '--reading-max': design.spacing.readingMax,
    '--corner-control': design.corners.control,
    '--corner-media': design.corners.media,
    '--border-width': design.surface.borderWidth,
    '--motion-fast': `${design.motion.fastMs}ms`,
    '--motion-base': `${design.motion.baseMs}ms`,
    '--motion-distance': design.motion.entranceDistance,
  } as CSSProperties
}
