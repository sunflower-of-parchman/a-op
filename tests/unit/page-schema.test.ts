import { describe, expect, it } from 'vitest'
import { pageInputSchema } from '../../shared/schemas/page'

const basePage = {
  slug: 'about',
  title: 'About the artist',
  navigationLabel: 'About',
  seo: { title: 'About', description: 'A clear description of the artist.' },
  sections: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      type: 'prose',
      heading: 'Practice and place',
      body: 'A structured body remains plain text.',
    },
  ],
}

describe('structured page schema', () => {
  it('accepts an ordered, script-free page contract', () => {
    expect(pageInputSchema.parse(basePage).sections).toHaveLength(1)
  })

  it('requires alternative text for image sections', () => {
    const result = pageInputSchema.safeParse({
      ...basePage,
      sections: [
        {
          id: '30000000-0000-4000-8000-000000000002',
          type: 'image',
          src: '/artwork/example.webp',
          alt: '',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects external call-to-action paths', () => {
    const result = pageInputSchema.safeParse({
      ...basePage,
      sections: [
        {
          id: '30000000-0000-4000-8000-000000000003',
          type: 'call_to_action',
          heading: 'Continue',
          label: 'Open',
          href: 'https://example.com',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects protocol-relative paths and insecure external media', () => {
    expect(
      pageInputSchema.safeParse({
        ...basePage,
        sections: [
          {
            id: '30000000-0000-4000-8000-000000000004',
            type: 'call_to_action',
            heading: 'Continue',
            label: 'Open',
            href: '//malicious.example',
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      pageInputSchema.safeParse({
        ...basePage,
        sections: [
          {
            id: '30000000-0000-4000-8000-000000000005',
            type: 'video',
            heading: 'Watch',
            url: 'http://media.example/video.mp4',
            transcript: 'A complete transcript.',
          },
        ],
      }).success,
    ).toBe(false)
  })
})
