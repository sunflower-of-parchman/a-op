# OpenAI Build Week Submission

This repository is the working home for Michael Wall's OpenAI Build Week submission.

## Participation status

- Devpost registration: Confirmed by the "OpenAI Build Week: You're in!" email on July 14, 2026.
- Devpost Hackathons plugin: Installed.
  - Plugin URI: `plugin://app-6a330a7730c081919892632d5baaec58@openai-curated-remote`
- Local repository: Initialized during the submission period with no pre-existing project files or commits.
- OpenAI and Codex access: Available.
- Free-credit request: Submitted; approval or credit receipt has not yet been independently confirmed.

## Official references

- [Event overview](https://openai.devpost.com/)
- [Official rules](https://openai.devpost.com/rules)
- [Schedule](https://openai.devpost.com/details/dates)
- [Resources](https://openai.devpost.com/resources)
- [Manage submissions](https://devpost.com/submit-to/30223-openai-build-week/manage/submissions)
- [Supported countries and territories](https://platform.openai.com/docs/supported-countries)
- [GPT-5.6 documentation](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
- [Codex quickstart](https://learn.chatgpt.com/docs/quickstart)

If the overview and official rules differ, follow the official rules.

## Key dates

| Milestone                            | Pacific time                                    | Mountain time                                   |
| ------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Submission period opened             | July 13, 2026 at 9:00 AM                        | July 13, 2026 at 10:00 AM                       |
| Free-credit request deadline         | July 17, 2026 at 12:00 PM                       | July 17, 2026 at 1:00 PM                        |
| Registration and submission deadline | July 21, 2026 at 5:00 PM                        | July 21, 2026 at 6:00 PM                        |
| Judging period                       | July 22 at 10:00 AM through August 5 at 5:00 PM | July 22 at 11:00 AM through August 5 at 6:00 PM |
| Winners expected                     | Around August 12, 2026 at 2:00 PM               | Around August 12, 2026 at 3:00 PM               |

## Build requirements

The submission must be a working project built with Codex and GPT-5.6. It must fit one track:

1. Apps for Your Life
2. Work and Productivity
3. Developer Tools
4. Education

A project may be an app, agent, website, game, workflow, developer tool, plugin, skill, MCP, or another functional form.

Pre-existing work is permitted only when it is meaningfully extended during the submission period. Only the new work is judged. Keep dated commits, Codex session evidence, and clear documentation separating earlier work from competition work.

Third-party code, APIs, data, media, trademarks, and other materials must be used with appropriate authorization and licenses.

## Required submission artifacts

- A working, consistently runnable project
- One selected track
- A project description explaining what it does and how it works
- A public YouTube demo shorter than three minutes
  - Show the project working
  - Include audio explaining how Codex and GPT-5.6 were used
  - Use only media and other materials we have permission to publish
- A code repository URL
  - Public with appropriate licensing, or
  - Private and shared with `testing@devpost.com` and `build-week-event@openai.com`
- A README containing:
  - Setup and running instructions
  - Sample data when needed
  - Where Codex accelerated the work
  - The important product, engineering, and design decisions made by Michael
  - How GPT-5.6 and Codex contributed to the result
- The `/feedback` Codex Session ID from the task where most core functionality was built
- Free and unrestricted judging access through the end of the judging period
  - Website, functioning demo, test build, sandbox, or test account as appropriate
- For a plugin or developer tool:
  - Installation instructions
  - Supported platforms
  - A way to test it without rebuilding it from scratch
- English-language submission materials or complete English translations

Do not submit the project, publish the video, make a repository public, share a private repository, or perform another external publication step without Michael's explicit approval.

## Judging criteria

### Technological implementation

Use Codex thoroughly and skillfully. Deliver a working, non-trivial implementation that reflects genuine effort.

### Design

Deliver a complete, coherent product experience rather than a technical proof of concept.

### Potential impact

Identify a real audience and problem, make a credible and specific case for the project's value, and demonstrate that the product addresses the problem.

### Quality of the idea

Show creativity and a genuine understanding of the problem space.

## Evidence and working practices

- Use this repository for the submission and preserve its Git history.
- Build core functionality in a primary Codex task so its `/feedback` session ID represents the project accurately.
- Record meaningful product, engineering, and design decisions as they are made.
- Record where GPT-5.6 and Codex materially contributed.
- Keep the project runnable throughout development.
- Preserve evidence that competition work occurred during the submission period.
- Treat the demo, README, repository access, and judging instructions as parts of the product experience.

## Primary implementation task

- Primary implementation task: This Codex task.
- Primary Codex task/thread ID: `019f6291-c1c9-7cf3-9da7-be2a19b7154c`
- Primary models: GPT-5.6 Sol and GPT-5.6 Pro, confirmed by Michael on July 14, 2026.
- Purpose: Architecture integration, core implementation, milestone decisions, and full verification.
- Supporting tasks: Bounded research and isolated investigations only; their results must return here for integration and verification.
- Model and agent evidence: `docs/submission/model-and-agent-use.md`
- Capability evidence: `docs/submission/capability-evidence.md`
- Final `/feedback` Session ID: Pending completion and confirmation through `/feedback`; do not assume it is identical to the task/thread ID.

## Project brief

This section will develop as we discuss the idea.

- Working title: Artist-Owned Platform (provisional)
- Track: Developer Tools. The personalized artist site is the proof; the transferable, agent-operable repository is the product.
- Audience: Independent musicians first, with an architecture that can also serve accompanists, dancers, choreographers, teachers, and other performing artists.
- Problem: Artists can distribute through large platforms but still lack an approachable way to own and operate the permanent digital home of their work, audience relationships, direct commerce, licensing, membership, and teaching.
- Core idea: A complete open-source Nuxt platform that Codex can configure and maintain with a nontechnical artist. Each deployment belongs to one artist or artist-led organization and connects to the artist's own Supabase, Stripe, hosting, and domain.
- Why this matters: Codex can make sophisticated, bespoke, artist-owned infrastructure transferable without requiring the artist to become a developer or surrender control to another hosted platform.
- What the working demo must prove: From a fresh clone, Codex can guide an artist through identity and local setup, import an approved release, launch a personalized site, and support listening, direct commerce or licensing, account entitlements, education, video, and artist-facing operations.
- Role of GPT-5.6 Sol and GPT-5.6 Pro: Reason across the private reference architecture and new product requirements, generalize the system, implement the application, write tests and migrations, create safe setup automation, and explain technical checkpoints in language an artist can use. Record the exact task-level contribution of each model from session metadata as implementation proceeds.
- Role of Codex: Serve as the artist's implementation and maintenance partner while preserving human control over creative identity, rights, business rules, service accounts, costs, and publication.
- Technical shape: A web-only Nuxt 4 and TypeScript application using Supabase for database, authentication, authorization, and media storage; Stripe for transactions and subscriptions; Vercel as the first documented hosting path; and agent-readable setup, validation, and recovery documentation.
- Scope for Build Week: The complete single-artist platform described in `plans/artistOwnedPlatform.md`, including identity and pages, catalog and audio, commerce, licensing, memberships and entitlements, learning paths, video, telemetry, Codex-guided setup, verification, and submission artifacts.
- Execution focus: Use Codex to make the complete proven system transferable in one week, with secure authorization and payment fulfillment, safe media and secret handling, guided external-service setup, clear provenance, approachable onboarding, and end-to-end verification across every module.

## Submission progress

| Item                            | Status                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registration                    | Confirmed                                                                                                                                                                                  |
| Devpost plugin                  | Installed                                                                                                                                                                                  |
| Free-credit request             | Submitted; approval not yet confirmed                                                                                                                                                      |
| Project idea and track          | Product direction and Developer Tools track selected; final name pending                                                                                                                   |
| Working implementation          | Milestones 0–8 and Integration Gate A implemented locally; identity, catalog, media, listening, commerce, memberships, licensing, learning, publishing, telemetry, and operations verified |
| Repository history and evidence | Planning through Milestone 8 commits, capability evidence, model record, provenance, runbooks, and living ExecPlan recorded                                                                |
| README                          | Product introduction and verified local quickstart complete                                                                                                                                |
| Demo and judging access         | Not started                                                                                                                                                                                |
| Demo video                      | Not started                                                                                                                                                                                |
| `/feedback` session ID          | Primary task/thread ID recorded; final `/feedback` confirmation pending                                                                                                                    |
| Devpost submission              | Not started                                                                                                                                                                                |
