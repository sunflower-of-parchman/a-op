# Production performance evidence

Date: 2026-07-15  
Runtime: locally started Nuxt production build, headless Chromium, 1440 by 1000 viewport  
Command: `npm run test:hardening`

This gate measures the initial load of four public routes after hydration. It is a deterministic regression budget for this repository, not a claim about global network latency or a hosted provider. The script fails on a non-200 response, failed request, browser console error, eager media preload, autoplay, or any exceeded budget.

## Budgets

| Measure                   | Budget      |
| ------------------------- | ----------- |
| DOM content loaded        | 3,000 ms    |
| Load event                | 5,000 ms    |
| Requests                  | 45          |
| Total transferred         | 1,500,000 B |
| JavaScript transferred    | 700,000 B   |
| Initial media transferred | 600,000 B   |

## Passing baseline

| Route                   | DOM loaded | Load  | Requests | Total bytes | JavaScript bytes | Media bytes |
| ----------------------- | ---------- | ----- | -------- | ----------- | ---------------- | ----------- |
| `/`                     | 60 ms      | 60 ms | 7        | 374,294     | 306,697          | 0           |
| `/music`                | 68 ms      | 68 ms | 8        | 377,205     | 308,877          | 0           |
| `/music/lines-we-carry` | 70 ms      | 70 ms | 7        | 376,831     | 306,741          | 0           |
| `/learn`                | 65 ms      | 65 ms | 8        | 376,776     | 307,616          | 0           |

Every audio element used `preload="metadata"` and no media element autoplayed. The production-backed hardening suite also checked the same application for strict response headers, cross-site mutation refusal, a 2 MB request ceiling, safe internal redirects, keyboard skip navigation, reduced motion, offline notice, one main landmark, viewport containment, and no serious or critical axe violations across ten public and account routes.

Hosted latency, CDN behavior, and field performance remain deployment-specific evidence. They will be measured only after Michael approves the exact deployment action.
