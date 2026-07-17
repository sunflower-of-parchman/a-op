export type SiteColorMode = 'light' | 'dark'

export function useSiteColorMode() {
  const preference = useCookie<SiteColorMode>('aop-color-mode', {
    default: () => 'light',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  const colorMode = computed<SiteColorMode>({
    get: () => (preference.value === 'dark' ? 'dark' : 'light'),
    set: (value) => {
      preference.value = value
    },
  })

  function toggleColorMode() {
    colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
  }

  return { colorMode, toggleColorMode }
}
