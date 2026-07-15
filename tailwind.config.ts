import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{vue,ts}', './shared/**/*.{ts,vue}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-background)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted-text)',
        accent: 'var(--color-accent)',
        surface: 'var(--color-surface)',
        rule: 'var(--color-border)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
    },
  },
} satisfies Config
