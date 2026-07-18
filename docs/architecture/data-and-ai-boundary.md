# Data, storage, ownership, and ChatGPT Work

## Artist ownership

Artists retain ownership of their music, images, writing, video, course material, code, and business data. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) state that users retain ownership rights in their input and own their output as between themselves and OpenAI.

## Durable application storage

`a-op` uses storage supplied through Sites:

- D1 stores structured product state: artist settings, module configuration, catalog records, accounts, roles, memberships, subscriptions, entitlements, licenses, Courses, contact submissions, telemetry, and operational state.
- R2 stores bytes: original audio, streaming and download derivatives, artwork, images, video, documents, and exports.
- Git stores the open-source application, the artist's code changes, schemas, migrations, and non-secret configuration defaults.
- Server-managed runtime values store secrets.

The current official [Sites persistence guidance](https://learn.chatgpt.com/docs/sites#choose-a-supported-site-shape) assigns durable structured data to D1 and uploaded file bytes to R2. Sites provisions and connects those logical bindings through `.openai/hosting.json`.

D1 and R2 are Sites-provided storage inside the Sites service boundary. Current official [Sites limits guidance](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) includes deployed Sites, Site code, D1 and R2 data and file storage, generated artifacts, and logs in that boundary. Sites does not support data residency or inference residency at launch.

## How music reaches the site

The artist identifies a local file or folder and confirms the rights and intended use. Codex invokes the repository's local media command against that approved path. The command inspects and converts the media locally, presents the resulting files and metadata for approval, and sends the approved outputs to the artist's Site. R2 receives the bytes and D1 receives their metadata, ownership, processing state, and access rules.

The administration upload flow follows the same destination. Its upload handler streams approved bytes into R2 and records the durable D1 state. Original media receives an immutable versioned object key.

Use this product language:

- Add music to your site.
- Prepare approved media locally.
- Publish the approved files to your Site.
- Store media in Sites-provided R2 and product records in Sites-provided D1.

## Application and model boundary

Ordinary visitor, customer, and administrator operation is application-driven. Browsing, streaming, memberships, subscriptions, licensing, Courses, contact, telemetry, and administration execute through the Site, D1, and R2. These ordinary Site journeys make no model request.

ChatGPT Work and Codex provide the artist's natural-language development and operating environment. A file or record enters a model request only when the artist deliberately shares it in a task. Local media commands keep audio bytes inside the local processing and Site publication path. Logs and proposals use stable identifiers and redact full local paths, credentials, signed URLs, and customer data.

`a-op` uses artist media and customer data to operate the artist's Site. Model training is outside the application's runtime pipeline.

OpenAI handling of material deliberately shared with ChatGPT Work follows the artist's workspace plan, configuration, feature, region, agreement, and data controls. Current [ChatGPT Business privacy guidance](https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-and-other-ai-chatbots) states that Business workspace data is excluded from training by default. Individual accounts follow their own Data Controls. Current [Enterprise Work mode guidance](https://learn.chatgpt.com/docs/enterprise/work-admin-faq#how-does-work-mode-support-enterprise-privacy-and-data-commitments) applies workspace privacy commitments subject to the active plan and configuration.

## Public language

Public and setup copy describes the artist's Site as the destination for music, images, video, documents, and customer records. ChatGPT Work is where the artist directs code and operations through natural language. Storage, model sharing, workspace data controls, and artist approval remain distinct facts.

## Required verification

- Trace a local audio file from an artist-approved path through local processing, approval, R2 storage, D1 metadata, publication, range streaming, and protected download.
- Confirm that browser-bundle secret scans return zero storage credentials, full local paths, or private object keys.
- Confirm that the network trace for ordinary public, account, and administration journeys contains zero model requests.
- Confirm that setup and diagnostic output identifies the active Sites bindings and the workspace data-control checkpoint while protected values remain redacted.
