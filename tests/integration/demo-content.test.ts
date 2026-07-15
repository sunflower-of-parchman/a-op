import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import artistConfig from '../../artist.config'

describe('demonstration content', () => {
  it('keeps the bootstrap identity and catalog aligned', async () => {
    const root = resolve(import.meta.dirname, '../..')
    const artist = JSON.parse(await readFile(resolve(root, 'content/demo/artist.json'), 'utf8'))
    const catalog = JSON.parse(await readFile(resolve(root, 'content/demo/catalog.json'), 'utf8'))

    expect(artist.fictional).toBe(true)
    expect(artist.name).toBe(artistConfig.identity.name)
    expect(catalog.fictional).toBe(true)
    expect(catalog.release.title).toBe(artistConfig.homepage.release.title)
    expect(catalog.media).toHaveLength(3)
    expect(catalog.media[0]).toMatchObject({
      kind: 'preview_audio',
      path: 'preview-media/gate-a/first-light-repeated-preview.wav',
    })
    expect(catalog.rights).toContain('code-generated audio')
  })
})
