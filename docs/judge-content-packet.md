# Judge content packet

The local judge packet is a bounded, artist-approved rehearsal dataset for proving that a fresh `a-op` installation can become a working musician Site from one folder. It contains four releases with no more than ten tracks each, ten learning posts arranged into two Courses, five YouTube records, two What's New entries, About copy, four page-opening images, activation answers, rights notes, and checksums.

The generated packet lives at `content/imports/sfm-judge-packet/`. That directory is ignored because it contains Michael Wall's approved music, writing, and images. The public visual rehearsal copies four approved images to the ignored `public/judge-content/` directory. Neither directory is part of the neutral repository distribution.

## Build and verify

Run the builder with explicit local roots:

```sh
node scripts/build-sfm-judge-packet.mjs \
  --sfm-repo /path/to/read-only-sound-for-movement \
  --music-root /path/to/approved-music-root

npm run judge:packet:verify
```

The builder reads public Sound for Movement catalog, Learn, Videos, and What's New endpoints. It copies only the explicitly selected local MP3 files and four explicitly selected images. It does not query or copy accounts, customers, inquiries, mailing lists, orders, subscriptions, entitlements, telemetry, credentials, or private operational records. It performs no remote writes.

## Activation interview

A fresh installation first creates the complete Sites application and core Music, identity, access, and administration system. Setup then asks the artist for:

1. Artist identity, public About wording, and public contact details.
2. The approved local content-folder alias.
3. Optional capabilities to activate: downloads and libraries, licensing, memberships and subscriptions, Courses, Videos, What's New, contact, and consent-based telemetry.
4. Which releases and posts should publish, which Course material is public or subscriber-only, and whether external video consent is enabled.
5. Whether Stripe Test simulation should demonstrate memberships, subscriptions, credits, and licensing.
6. Legal-document review status and telemetry consent language.

Setup then presents the exact D1 records, R2 objects, derivatives, navigation changes, access rules, and public routes it will create. The artist approves that proposal before apply.

## Judge acceptance journey

The rehearsal passes when the same packet can drive these observable results without manual database editing:

- Setup preflight resolves the path alias, validates rights notes, checks media tools, and reports every selected source.
- Apply creates four releases and 25 tracks, publishes approved derivatives to R2, and stores metadata in D1.
- Music displays the releases and tracks. A track starts through an authorized byte-range response, persists in the global player, seeks, pauses, resumes, advances, and shuffles.
- A signed-in customer can favorite a track, create a playlist, add a track, and see durable library state after reload.
- Courses displays Piano with one subscriber lesson and Teaching Music for Dance with nine public lessons. Access is enforced on the server and lesson progress survives reload.
- Videos displays five external YouTube records and requires consent before loading third-party embeds.
- What's New displays two published updates. About uses the approved biography. Courses, Videos, Membership, and Licensing use their approved page-opening images.
- The owner sees the matching releases, tracks, Courses, Videos, updates, access records, and metrics in administration.
- Deactivating an optional capability removes its public navigation and routes while preserving its durable records and access history.
- Dark and light themes, keyboard navigation, reduced motion, tablet and phone layouts, and the production build pass focused verification.
- Export includes the structured records, R2 object inventory, checksums, and restoration information needed for a clean recovery rehearsal.

## Current contract gaps exposed by the packet

The existing setup proposal accepts releases, tracks, approved media, Courses, external Videos, contact settings, navigation, access, and commerce simulation. It does not yet accept individual editorial posts, What's New entries, About-page revisions, or page-presentation media as first-class setup topics. Until those topics are added to validation, preview, apply, verify, export, and restore, the full packet acceptance journey is intentionally red at those four seams.
