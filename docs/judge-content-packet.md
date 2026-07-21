# Judge content packet

The local judge packet is a bounded, artist-approved rehearsal dataset for proving that a fresh `a-op` installation can become a working musician Site from one folder. The current album rehearsal contains four releases, 28 tracks, four album covers, nine collection images, rights notes, and checksums. Learning posts and the remaining presentation material can be added when Michael approves them.

The generated packet lives at `content/imports/sfm-judge-packet/`. That directory is ignored because it contains Michael Wall's approved music, writing, and images. The public visual rehearsal copies four approved images to the ignored `public/judge-content/` directory. Neither directory is part of the neutral repository distribution.

## Content intake template

Use the [a-op content intake template](https://docs.google.com/spreadsheets/d/1gaitJoppRGyZEBFsi_ti65Viqt0-kJPqkUVSSHX5nqo/edit?usp=sharing) as the canonical workbook shape. An artist makes a copy, completes any fields they know, and leaves unknown facts blank. Asset references use exact file names from the artist-approved content folder. The Michael Wall workbook retains approved demo rows so the local installation rehearsal remains observable.

Keep `Albums` and `Tracks` as the first two sheets. The current local packet builder reads those positions directly. The remaining sheets describe Collections, Videos, Pricing, Courses, Posts, About, and What's New. The installer imports completed fields and does not invent missing writing, prices, licensing terms, or announcements.

## Build and verify

Run the builder with explicit local roots:

```sh
node scripts/build-sfm-judge-packet.mjs \
  --demo-assets /path/to/MichaelWall_a-op_Demo_Assets

```

The earlier full-content rehearsal remains available with the private Sound for Movement reference roots:

```sh
node scripts/build-sfm-judge-packet.mjs \
  --sfm-repo /path/to/read-only-sound-for-movement \
  --music-root /path/to/approved-music-root

npm run judge:packet:verify
```

The album-demo builder reads only the approved folder and its local metadata workbook. It copies the selected album audio, album covers, and collection images. It does not query Supabase or copy accounts, customers, inquiries, mailing lists, orders, subscriptions, entitlements, telemetry, credentials, or private operational records. It performs no remote writes.

## Real local audio proof

After packet verification, start the bounded read-only audio rehearsal:

```sh
npm run judge:audio:serve
```

Open the printed loopback URL and activate `Play approved track`, or use the download link. Playback acceptance requires a successful byte-range response and decoded audible output. Download acceptance requires the full approved file, an attachment disposition, and the public access decision. The server loads `audio/amiss/amiss.mp3`, creates a disposable in-memory D1 catalog record through the real draft and publication repositories, serves both paths through the real catalog delivery implementation, forbids R2 writes and deletes, and removes all in-memory state when stopped.

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
- Apply creates four releases and 28 tracks, publishes approved derivatives to R2, and stores metadata in D1.
- Music displays the releases and tracks. A track starts through an authorized byte-range response, persists in the global player, seeks, pauses, resumes, advances, and shuffles.
- A signed-in customer can favorite a track, create a playlist, add a track, and see durable library state after reload.
- Courses displays Piano with one subscriber lesson and Teaching Music for Dance with nine public lessons. Access is enforced on the server and lesson progress survives reload.
- Videos displays five external YouTube records and requires consent before loading third-party embeds.
- What's New displays two published updates. About uses the approved biography. Courses, Videos, Membership, and Licensing use their approved page-opening images.
- The owner sees the matching releases, tracks, Courses, Videos, updates, access records, and metrics in administration.
- Deactivating an optional capability removes its public navigation and routes while preserving its durable records and access history.
- Dark and light themes, keyboard navigation, reduced motion, tablet and phone layouts, and the production build pass focused verification.
- Export includes the structured records, R2 object inventory, checksums, and restoration information needed for a clean recovery rehearsal.

## Setup coverage added for the packet

The version 2 setup proposal adds `editorial-presentation` as its fifteenth topic. It validates, previews, applies, verifies, exports, and restores individual editorial posts, What's New entries, the About-page revision, and approved public page heroes. Hero selections bind one approved, ready public image derivative to each active Courses, Videos, Membership, or Licensing module. Public delivery still resolves the private R2 object through a server-owned route.

The generated packet includes this topic at `setup/editorial-presentation.json`. Its manifest and checksum verifier cover that file alongside the selected music, writing, image, activation, and rights records.
