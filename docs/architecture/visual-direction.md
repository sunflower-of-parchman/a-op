# a-op visual foundation

## Starting point

Every fresh `a-op` installation begins with the visual framework Michael Wall developed for Sound for Movement, rebuilt in React for Sites and presented with plain `a-op` labels and placeholders. The authorization covers the design system, layout, responsive behavior, light and dark themes, interface primitives, motion, and accessibility patterns.

The public product uses general names. `Courses` is the teaching area. `What's New` is the in-app update area. Each artist supplies their own identity, writing, music, artwork, photography, video, course material, collaborators, customer records, prices, and terms.

This foundation is the first working version of the site. After installation, the artist can use ChatGPT Work and Codex to change the visual system, page structure, navigation, language, imagery, and active capabilities through natural-language collaboration.

## Core character

`a-op` is quiet, precise, open, tactile, and artist-led. The interface uses generous space, restrained color, photographic material, and direct language. Dark mode carries the primary visual identity, with a complete light theme.

## Typography

- Use Lato throughout: headings, body text, navigation, controls, and metadata.
- Let Light 300 carry headings and most interface text.
- Use Regular 400 where body or action clarity needs it.
- Reserve heavier emphasis for rare functional needs.
- Type scale:
  - Hero: 36–72px
  - Section heading: 24–48px
  - Card heading: 18–24px
  - Intro text: 16–24px
  - Body: 14–16px
- Keep headings tightly spaced with slightly negative letter spacing.
- Keep body text relaxed and readable.
- Keep headers free of uppercase tracked overlines, eyebrow labels, redundant subtitles, and decorative metadata.

## Color

Use semantic tokens for every visual value. The implementation uses neutral token names while preserving these exact values.

| Role           | Dark theme | Light theme | Use                                         |
| -------------- | ---------: | ----------: | ------------------------------------------- |
| Canvas         |  `#08090B` |   `#F4F6F9` | Page background                             |
| Card           |  `#111215` |   `#FFFFFF` | Meaningful grouped surfaces                 |
| Field          |  `#0F1012` |   `#F8FAFC` | Inputs and compact controls                 |
| Primary ink    |  `#FFFDFC` |   `#14171C` | Primary text                                |
| Muted ink      |  `#D2DAE3` |   `#575E68` | Secondary information                       |
| Slate          |  `#393D3F` |   `#393D3F` | Borders and subdued structure               |
| Action gray    |  `#4C5257` |   `#4C5257` | Standard filled actions                     |
| Accent orange  |  `#C8753D` |   `#9A3F05` | Links, icons, active states, and underlines |
| Orange action  |  `#9A3F05` |   `#9A3F05` | Approved high-priority conversion actions   |
| Editorial blue |  `#102B4B` |   `#102B4B` | Approved editorial chapters                 |

Use fixed off-white `#FFFDFC` over orange actions and editorial blue. The neutral pair `#434351` and `#E6EEF6` swaps roles between themes. Status reds, ambers, and greens remain functional colors. Never use gradients.

## Corners, surfaces, and depth

- 4px: buttons, icon controls, and compact actions.
- 6px: occasional small utility surfaces.
- 8px: inputs and compact panels.
- 12px: cards and meaningful grouped surfaces.
- 16px: exceptional large media or modal boundaries.
- Full radius: circular controls, counters, segmented controls, and genuine pills.

Use open layouts by default. Add a card when it communicates a meaningful group, selectable item, or functional boundary. Keep cards to a solid surface, a subtle 1px slate border, and restrained shadow.

Use four shadow levels: whisper, gentle, elevated, and floating. Elevation communicates interaction or hierarchy.

## Layout

- Maximum content width: 1280px.
- Horizontal gutters: 16px mobile, 24px tablet, 32px desktop.
- Section spacing: 32px mobile, 48px small screens, 64px desktop.
- Use one padding system per section layer.
- Keep pages mobile-first and avoid nested containers that narrow content unintentionally.
- Let imagery, text, controls, and display surfaces live in open space.

Public landing and support pages use open, left-aligned typographic headers. Music, detail pages, course entries, account, authentication, cart, administration, and legal pages use their own functional layouts. The neutral installation contains no temporary image library.

## Controls

- Standard action: action-gray fill with fixed off-white text.
- Secondary action: transparent surface with a restrained slate border.
- Quiet action: ghost treatment.
- High-priority conversion action: fixed accent orange, used selectively.
- Buttons size to their text. Full width is appropriate when aligning with form fields.
- Inputs use the field surface, 8px corners, subtle border, and a visible two-pixel focus ring.
- Use pills when their shape carries functional meaning.
- Keep icons simple and functional. Reuse the established icon and control patterns.

## Imagery

The visual language favors:

- photographic detail, softness, grain, and restrained contrast;
- generous negative space and deliberate scale;
- one decisive gesture, material relationship, or ambiguous event;
- active, specific human presence when people appear;
- controlled palettes including charcoal, cream, gray, maroon, deep blue, cobalt, rust, and muted green; and
- an editorial feeling grounded in the artist's real material.

Choose specific artist-supplied material. Avoid generic dance classes, rehearsal studios, industrial lofts, dancer silhouettes, passive figures, stock arts imagery, and literal music symbolism. Record provenance and permission before an image enters the public library.

A person's photograph stays within conventional image work: cropping, grading, typography, and collage. Generative image tools receive only source material approved for generative use and never receive a person's photograph.

## Language

- Preserve the artist's words, cadence, paragraph structure, and intentional emphasis.
- Write plainly, warmly, and specifically.
- Lead with the practical point.
- Use short paragraphs and affirmative sentences.
- Name actions directly: listen, search, download, make playlists, take a course, subscribe, and license.
- Use verified product facts.
- Keep calls to action few and purposeful.
- Keep language free of taglines, manifestos, agency language, arts-marketing abstractions, audience hierarchies, comma-stacked benefits, emojis, and em dashes.
- Words such as “movement,” “embodied,” “practice,” “process,” “space,” “breath,” “weight,” and “flow” require a source in the artist's writing or explicit approval.
- Preserve blank lines in customer correspondence.

## Motion and accessibility

- Use 200ms transitions for color and compact controls; use 300ms for buttons and interactive surfaces.
- Keep hover movement small: approximately 2–4px.
- Honor reduced-motion preferences.
- Maintain visible focus states, keyboard access, readable contrast, stable mobile controls, meaningful alt text, and approximately 44px touch targets.
- Verify desktop and mobile in dark and light themes.

## Implementation contract

Port the established `Ui*` primitive contract into reusable React components. Preserve semantic utilities equivalent to `tone-action`, `tone-brand-action`, `surface-card-*`, `surface-field-standard`, and `selection-underline-current`.

The first React implementation reproduces this foundation before module-specific visual invention begins. A new visual pattern enters the shared framework through an explicit decision recorded in this document. Artist-specific changes live in the artist's fork and can reshape any part of the foundation while preserving working behavior and accessibility.
