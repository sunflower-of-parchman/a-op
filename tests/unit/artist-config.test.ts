import { describe, expect, it } from 'vitest'
import artistConfig from '../../artist.config'
import { artistConfigSchema } from '../../shared/schemas/artistConfig'

describe('artist configuration', () => {
  it('accepts the redistribution-safe bootstrap configuration', () => {
    expect(artistConfigSchema.parse(artistConfig)).toEqual(artistConfig)
    expect(artistConfig.demo.fictional).toBe(true)
  })

  it('rejects unknown configuration fields', () => {
    expect(() => artistConfigSchema.parse({ ...artistConfig, secret: 'not allowed' })).toThrow()
  })

  it('keeps enabled navigation aligned with declared features', () => {
    for (const item of artistConfig.navigation) {
      if (item.feature) {
        expect(artistConfig.features[item.feature]).toBe(true)
      }
    }
  })

  it('does not contain private reference branding', () => {
    const serialized = JSON.stringify(artistConfig).toLowerCase()
    expect(serialized).not.toContain('sound for movement')
    expect(serialized).not.toContain('soundformovement')
  })
})
