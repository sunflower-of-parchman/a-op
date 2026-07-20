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

| Role           | Dark theme | Light theme | Use                                        |
| -------------- | ---------: | ----------: | ------------------------------------------ |
| Canvas         |  `#08090B` |   `#F4F6F9` | Page background                            |
| Card           |  `#111215` |   `#FFFFFF` | Meaningful grouped surfaces                |
| Field          |  `#0F1012` |   `#F8FAFC` | Inputs and compact controls                |
| Primary ink    |  `#FFFDFC` |   `#14171C` | Primary text                               |
| Muted ink      |  `#D2DAE3` |   `#575E68` | Secondary information                      |
| Slate          |  `#393D3F` |   `#393D3F` | Borders and subdued structure              |
| Action gray    |  `#4C5257` |   `#4C5257` | Standard filled actions                    |
| Accent orange  |  `#C8753D` |   `#9A3F05` | Icons, borders, focus, and active controls |
| Orange action  |  `#9A3F05` |   `#9A3F05` | Approved high-priority conversion actions  |
| Editorial blue |  `#102B4B` |   `#102B4B` | Approved editorial chapters                |

Use primary and muted ink for every word, link, label, and text status. Orange never colors or underlines words. Use fixed off-white `#FFFDFC` over orange actions and editorial blue. The neutral pair `#434351` and `#E6EEF6` swaps roles between themes. Status colors may remain on non-text indicators and boundaries. Never use gradients.

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
- Use a broad, responsive public footer directory grouped by functional purpose. Artist-configured external and social links appear only when supplied, while legal links, copyright, and the theme control remain in a separate utility row.
- Keep the public brand at left, the primary navigation centered, and one separate Account action at right. Compact layouts place Account inside the hamburger menu.
- Keep About, Contact, and What's New in the footer directory rather than the primary header navigation. The header meets the page without a divider line. Public functional pages use a screen-reader page name and begin visually with their working content rather than a large title banner.
- Build Music as a complete library workspace from the first empty installation. A persistent icon-free library rail exposes Explore, Tracks, Collections, Albums, Favorites, automatically applying search and compact collapsible Meter, Tempo, Key, and Duration filters, playlists, and listening history. Controls use the visual system's restrained corners and reveal no redundant nested labels. Playlists and listening history remain anchored at the bottom of the open rail, stay visually empty until real customer records exist, and grow upward from those records. Below desktop width, the sidebar leaves the layout entirely. Its eight essential destinations and tools form one compact tablet row and a four-by-two phone grid; Search and Filters reveal the same automatically applying controls in place. The main surface gives each library view its own honest empty state, keeps Sort and the live result count together on one line, and keeps each track on one horizontal row with a quiet field-color hover and focus-within state. Interactive catalog items and compact actions may lift by one pixel on hover, with that movement removed under reduced motion. Tempo, Meter, and Key appear once as column headings above the track list, align to a bounded metadata column independently of the sidebar width, then disappear with their values before the row needs to wrap. Before music exists, five interface-only Track rows demonstrate the layout without creating D1 records; their empty artwork positions reveal a triangular play control on hover and focus and open the real persistent player in a zero-duration preview state. Every preview row retains Download, Buy Track, License Track, Favorite, and Add to Playlist actions. Download is a single slender downward arrow beside the heart, with no tray or text label. Favorite uses the slender, round-jointed outlined heart from the visual reference and fills with accent orange when active. Add to Playlist opens a modal chooser that can add the published track to an existing playlist or advance to the playlist name and optional description form; both paths use the server-owned customer-library mutations. On phones, Buy Track remains visible and a three-dot control opens the complete track action sheet. Track names use client navigation to a neutral Track detail surface with Artist / Album and the same action set, preserving the player across navigation. Unavailable playback creates no status label. The empty installation also shows three blank Album cards and two blank Collection cards that lead to interface-only detail previews. Album and Collection previews reuse the same five-row Track list and create no catalog, playlist, history, artwork, or metadata records. Published catalog cards continue to use only D1 records and artist-approved artwork. The root-persistent player uses labeled thin-line previous, play or pause, next, repeat, queue, volume, and close icons while retaining its keyboard, queue, and live-status behavior.
- Build Courses as both a teaching library and an ordered learning experience. Before an artist publishes course material, the interface shows two blank Course paths with `0 of 10 completed`, ten generic Posts, and three generic Category filters without creating D1 records or temporary media. Each Course opens a horizontally scrollable, keyboard-operable ten-Post filmstrip; the active Post carries visible position, and the same generic Post collection remains available below it. Individual Post previews demonstrate a public reading surface and a membership or subscription access boundary using only `Course`, `Post`, `Title`, `Blurb`, and `Category`. Published Courses replace the preview and continue to use the real ordered section, lesson, mixed-media, central-access, D1 progress, completion, and resume contracts.
- Present Membership as a compact plan summary beside a linked benefit composition. The neutral installation uses `Membership` and `Price` without inventing an offer or customer relationship; a published membership or subscription product replaces those labels with its real name, description, cadence, and test price. Courses, Music, Download credits, Playlists, Favorites, account management, and Licensing link to their existing application routes. The linked benefit areas remain image-free until the artist approves media for the Site.
- Build Videos as an open viewing room with one player and one selectable playlist. Before an artist publishes video, the interface shows a blank player and four blank playlist items using only `Video`, `Now Playing`, `Title`, `Subheading`, `Date`, and `Playlist`. Selecting an item updates the viewing room through a shareable URL. The blank player provides an accessible local play or pause preview without requesting media or creating D1, R2, history, or telemetry records. Published video replaces the preview automatically: artist-hosted sources continue through protected delivery, and YouTube or Vimeo sources retain click-to-consent playback and a direct provider link. The desktop viewing room uses two columns and becomes one column below 960px.
- Build Licensing as a long, open sequence led by license choices rather than explanation. Before the artist publishes offers or recurring products, show three blank One-Time Licenses, two blank Licensing Subscriptions, and three blank Education Plans using the requested generic `Price` and `Benefit` labels without creating product, price, plan, license, entitlement, or checkout records. Meaningful selectable offer tiles use restrained borders, field surfaces, compact corners, and a one-pixel hover lift; they become one column on phones. Published license offers and recurring products replace their matching previews and retain exact artist-authored terms, intended-use requests, customer authority, and Stripe Test simulation boundaries. Custom Licensing displays the complete form surface immediately. Until the artist publishes a Contact form and consent version, its inputs and submission action remain disabled; once configured, the same surface submits through the stored-only, idempotent, consent-versioned inquiry backend. Five native `details` disclosures labeled `Question` and `Answer` demonstrate the Licensing FAQ with keyboard behavior and no durable records.
- Keep the personal account on one page: greet the registered user with `Hello [name]`, show a compact role-scoped Dashboard action for owners and editors, and place live summary totals, a compact What's New view, Downloads, Licenses, and Profile directly in the page flow. When active, What's New sits beside the summary and links to the complete update feed. Download and license credit balances appear once in the summary. Downloads list the customer's currently entitled tracks with protected delivery actions. Licenses list issued licenses with protected PDF delivery when the document is ready. Account pages use no eyebrow heading or secondary tab navigation.

Public landing and support pages use open, left-aligned typographic headers. Music, detail pages, course entries, account, authentication, cart, administration, and legal pages use their own functional layouts. The neutral installation contains no temporary image library.

## Controls

- Standard action: action-gray fill with fixed off-white text.
- Secondary action: transparent surface with a restrained slate border.
- Quiet action: ghost treatment.
- Standalone controls use the quiet treatment by default and live directly in open space without an enclosing border or surface. Add a border only when it communicates a field, selection, state, group, or functional boundary.
- High-priority conversion action: fixed accent orange, used selectively.
- Buttons size to their text. Full width is appropriate when aligning with form fields.
- Inputs use the field surface, 8px corners, subtle border, and a visible two-pixel focus ring.
- Use pills when their shape carries functional meaning.
- Keep icons simple and functional. Reuse the established icon and control patterns.
- At compact widths, replace the horizontal public navigation with a borderless accent-orange hamburger control. Opening it transforms the same three lines into an X and reveals the full navigation below the header; closing, choosing a link, pressing Escape, or activating the backdrop restores the page.

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
