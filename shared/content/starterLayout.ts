export const starterLayoutContent = {
  notice: 'Starter layout · each label names an editable site element.',
  brand: 'Artist Name / Logo',
  hero: {
    kicker: 'Homepage Kicker / Eyebrow',
    headline: 'Primary Homepage Headline',
    introduction: 'Introductory Text',
    primaryAction: 'Primary Action',
    secondaryAction: 'Secondary Action',
  },
  featuredRelease: {
    metadata: 'Release Metadata',
    title: 'Featured Release / Artwork',
    format: 'Release Format / Description',
    artist: 'Artist Name',
  },
  trackDetail: {
    title: 'Track Title',
    description: 'Track Description',
    detailsLabel: 'Track Details',
    detailsHeading: 'Track Metadata',
    libraryLabel: 'Listener Library',
    libraryHeading: 'Favorites and Playlists',
    returnAction: 'Return to Album',
  },
  supportingSection: {
    label: 'Section Label / Number',
    headline: 'Supporting Section Headline',
    introduction: 'Supporting Section Text',
    items: Array.from({ length: 3 }, () => ({
      label: 'List Item Heading',
      text: 'List Item Description',
    })),
  },
  closingSection: {
    label: 'Section Label / Number',
    headline: 'Secondary Section Headline',
    text: 'Supporting Text',
  },
  footer: {
    artist: 'Footer Artist Name',
    statement: 'Footer Statement',
    metadata: 'Footer Metadata',
  },
  seo: {
    title: 'Artist-Owned Site Starter',
    description: 'A guided first-clone layout that labels each artist-editable site element.',
  },
} as const
