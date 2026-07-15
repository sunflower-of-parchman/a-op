import { describe, expect, it } from 'vitest'
import { oauthProviderLabels, parseOAuthProviders } from '../../shared/utils/oauth'

describe('optional OAuth configuration', () => {
  it('accepts only supported providers, normalizes case, and removes duplicates', () => {
    expect(parseOAuthProviders(' Google,github,GOOGLE,unknown, spotify ')).toEqual([
      'google',
      'github',
      'spotify',
    ])
  })

  it('stays disabled for absent or malformed configuration', () => {
    expect(parseOAuthProviders(undefined)).toEqual([])
    expect(parseOAuthProviders('unknown,')).toEqual([])
  })

  it('provides an explicit label for every supported provider', () => {
    expect(oauthProviderLabels).toEqual({
      google: 'Google',
      apple: 'Apple',
      github: 'GitHub',
      spotify: 'Spotify',
    })
  })
})
