# a-op

**a-op: artist-owned platform** is an open-source web application for musicians.

At its center is artist-owned music distribution. Artists publish, stream, license, and deliver music through their own site. They control how their catalog is presented, heard, downloaded, licensed, and accessed.

From that music-first foundation, artists can offer memberships and subscriptions, publish Courses, share video, receive inquiries, understand audience activity, and manage customers and access. `a-op` gives artists a complete framework for building and running a business around their work.

## A complete starting point

Every fresh `a-op` installation begins as a composed, working site. Its starting visual framework is the Sound for Movement design system rebuilt for React and Sites: Lato, rigorous open layouts, exact light and dark themes, established controls, and restrained motion.

The installation begins with plain `a-op` labels, placeholders, and general product names. `Courses` is the teaching area. `What's New` carries in-app updates. The artist adds their own music, writing, artwork, photography, video, collaborators, course material, access plans, and terms.

The neutral installation uses open typographic headers and contains no temporary image library. Each artist adds album artwork, course and video imagery, photography, collaborator material, community-donated images with permission, or approved original generated work when those materials are ready for their Site.

## Use the parts you need

`a-op` contains a complete set of connected capabilities. Each installation activates the ones that fit the artist's work.

An artist can begin with music publishing and streaming. They can add customer libraries, downloads, licensing, memberships, subscriptions, Courses, video, What's New, contact, and telemetry as the site grows. Navigation and administration follow the active capabilities, while durable records remain available for later reactivation.

## Own your fork and your work

An artist takes a fork of `a-op` and operates it as their own site. They control their deployment, content, catalog, data, customer relationship, and artist-specific source changes. The shared code is open source under `AGPL-3.0-or-later`.

Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) state that users retain ownership rights in their input and own their output as between themselves and OpenAI.

ChatGPT Work and Codex help the artist change their fork through natural language. The artist can reshape the visual system, rename sections, reorganize pages, activate or deactivate capabilities, and add new functionality while the repository's contracts keep music, access, storage, and recovery working together.

## What a-op offers

- Music publishing and catalog management for releases, albums, tracks, collections, artwork, credits, and media.
- Streaming through the artist's site with a persistent player, queue, playlists, favorites, and listening history.
- Direct music delivery through protected downloads, customer libraries, access grants, and delivery history.
- Artist-defined licensing options, versioned terms, inquiries, approvals, issued licenses, license files, and customer history.
- Memberships and subscriptions with recurring access, benefits, renewal dates, cancellations, download credits, and license credits.
- Customer accounts for saved music, playlists, memberships, subscriptions, licenses, downloads, course progress, and access history.
- Courses and lessons with text, audio, video, images, downloads, access rules, progress, and resume.
- A dedicated video area with artist context, credits, transcripts, and privacy-aware playback.
- Structured pages for the artist's work, navigation, and published information.
- What's New updates with unread state and links into the artist's current activity.
- Contact forms for general messages, booking, teaching, support, and licensing inquiries.
- First-party telemetry with aggregate audience activity, consent settings, and retention controls.
- Editable Privacy Policy and Terms and Conditions starters personalized through guided setup and artist review.
- Administration for music, releases, streaming, downloads, licensing, memberships, subscriptions, customers, access, Courses, video, pages, contact, telemetry, privacy, terms, operations, and updates.

## Music and artist-owned distribution

Artists publish releases, albums, tracks, collections, artwork, and credits. Listeners browse the catalog and stream music through a persistent player.

Artists choose how each track is available: public streaming, customer download, membership access, subscription access, explicit access grant, or licensing. Memberships, subscriptions, licenses, credits, and artist-issued grants create durable access in each customer's account. Protected files are delivered through the artist's Site.

## Visitors and customers

Visitors can explore the artist's work, browse releases, stream music, watch video, read transcripts, open public course material, and send inquiries.

Signed-in customers can build playlists, save favorites, see listening history, claim accessible music, use memberships and subscriptions, download accessible files, obtain licenses, take Courses, track progress, and read updates from the artist.

## Memberships and subscriptions

Artists define each plan, its included access, download credits, license credits, customer benefits, dates, and status rules.

Customers can see their current plan, access, benefits, credits, renewal date, and history. Artists can manage plans, members, subscribers, renewals, cancellations, credits, access, and history through `a-op`.

## Commerce environments and the Build Week presentation

`a-op` has one connected commerce domain for checkout, orders, memberships, subscriptions, licensing, credits, entitlements, and protected delivery. The deployment environment determines whether that domain is simulated or live.

The Build Week presentation demonstrates commerce through Stripe Test mode. It accepts no real payment and moves no money. Test checkout events exercise the same order, licensing, membership, subscription, credit, entitlement, and protected-delivery contracts used by the application. Live commerce is disabled in the ChatGPT Sites deployment.

The Sites installation accepts only Stripe test credentials, uses Stripe-hosted Test Checkout and Stripe-provided test payment methods, verifies webhook signatures, rejects every live-mode event before it can write state, and marks related records as test data. Payment-card fields never enter the React application, D1, logs, telemetry, or audit records. Checkout, return, account, and administration views identify the experience as Stripe Test Mode and state that no real payment will be accepted.

`a-op` keeps live commerce behind an explicit deployment capability. An artist must verify the rules and technical support of their chosen environment before activating real payments. Live activation requires deliberate configuration, validation, and artist approval; it is unavailable from Sites administration and ordinary Sites configuration.

## Licensing

Artists create licensing options for specific tracks and uses. The licensing workflow records the selected music, intended use, customer, terms version, approval or credit source, issued license, related entitlement, and delivery history.

Customers can see their active and past licenses in their account. Artists can manage license options, inquiries, approvals, credit use, issuance, documents, and customer history from administration.

## Courses and video

Artists can publish ordered Courses made from lessons and mixed media. Access can be public, account-based, granted by the artist, licensed, or included with a membership or subscription. Signed-in customers can resume and see their progress.

`a-op` also includes a public video index and individual video pages. Each video can carry a title, summary, poster, source credit, artist context, and transcript. The artist manages drafts, previews, publication, and revisions.

## What's New

Artists publish updates inside `a-op`. Signed-in customers see an unread indicator, and the application remembers what each customer has read.

Updates can lead directly to new music, releases, Courses, videos, licenses, memberships, subscriptions, and other activity.

## Contact

Artists can personalize contact forms with an invitation, consent language, booking information, public contact details, and inquiry categories.

`a-op` stores each submission for the artist. Each submission records the sender's consent to the artist's current language.

## Administration and telemetry

The administration area gives artists one place to publish content, manage customers and access, operate memberships and licensing, review inquiries, edit legal documents, and inspect system status.

First-party telemetry shows aggregate sessions, audience actions, meaningful listens, and active music, video, Courses, contact, and published resources over a selected period. The artist controls collection, consent mode, retention, and the meaningful-listen threshold.

## Privacy and terms

`a-op` includes editable starters for the artist's Privacy Policy and Terms and Conditions. Guided setup asks about data collection, contact submissions, memberships, subscriptions, downloads, licensing, access, and the services involved in running the Site.

Codex prepares personalized drafts from the artist's answers. The artist reviews, revises, approves, and publishes each document, with version history available as the business evolves.

## ChatGPT Work, Codex, and Sites

Artists use ChatGPT Work and Codex to create, configure, personalize, maintain, diagnose, and verify `a-op`. The artist directs their words, media, rights, access plans, licensing terms, and publication.

Sites hosts the React application. Sites-provided D1 stores structured product state, and Sites-provided R2 stores music, images, video, documents, and exports. Sign in with ChatGPT establishes customer and trusted-operator identity, while server-owned roles and access decisions protect private resources.

Artists add music to their Site from an approved local path or through administration. Local tools prepare the approved files, R2 stores the bytes, and D1 stores their metadata and access rules. Current [Sites guidance](https://help.openai.com/en/articles/20001339) states that Sites does not support data residency or inference residency at launch. This applies to deployed Site code, D1 and R2 data and file storage, generated artifacts, and logs.

Ordinary site operation is application-driven and makes no model request. Material enters a ChatGPT Work task only when the artist deliberately shares it there.

OpenAI handling of material shared with ChatGPT Work follows the artist's workspace plan and data controls. Current [ChatGPT Business privacy guidance](https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-and-other-ai-chatbots) states that Business workspace data is excluded from training by default. Individual accounts follow their own Data Controls.
