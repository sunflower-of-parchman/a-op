import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { projectRoot } from './lib/command.mjs'

export const VERCEL_BOOTSTRAP_CONFIRMATION = 'TEMPORARY_PRODUCTION_BOOTSTRAP'

export const VERCEL_BOOTSTRAP_HEADERS = Object.freeze({
  'cache-control': 'private, no-store, max-age=0',
  'content-security-policy':
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
})

const bootstrapHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Temporary deployment bootstrap</title>
  </head>
  <body>
    <main>
      <h1>Temporary deployment bootstrap</h1>
      <p>No application, credentials, customer data, or media are present.</p>
    </main>
  </body>
</html>
`

function isInsideProject(path) {
  const relationship = relative(projectRoot, path)
  return relationship === '' || (!relationship.startsWith('..') && !isAbsolute(relationship))
}

export async function createVercelFirstDeploymentBootstrap(root) {
  const absoluteRoot = resolve(root)
  if (isInsideProject(absoluteRoot)) {
    throw new Error('The Vercel bootstrap must be generated outside the repository.')
  }

  const outputRoot = join(absoluteRoot, '.vercel', 'output')
  if (existsSync(outputRoot)) {
    throw new Error('The Vercel bootstrap output already exists; use a fresh disposable directory.')
  }

  const staticRoot = join(outputRoot, 'static')
  await mkdir(staticRoot, { recursive: true, mode: 0o700 })
  await writeFile(
    join(outputRoot, 'config.json'),
    `${JSON.stringify(
      {
        version: 3,
        routes: [
          {
            src: '/(.*)',
            headers: VERCEL_BOOTSTRAP_HEADERS,
            continue: true,
          },
        ],
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
  await writeFile(join(staticRoot, 'index.html'), bootstrapHtml, { mode: 0o600 })
  await writeFile(
    join(absoluteRoot, 'bootstrap-manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        purpose: 'vercel-first-deployment-bootstrap',
        containsApplication: false,
        containsSecrets: false,
        expectedEnvironment: 'production',
        expectedCustomDomainAssignment: false,
        expectedPlatformManagedUrls: true,
        responseHeadersHardened: true,
        removalRequired: true,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )

  return { absoluteRoot, outputRoot }
}

function readOption(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function main() {
  const args = process.argv.slice(2)
  const output = readOption(args, '--output')
  const confirmation = readOption(args, '--confirm')
  if (!output || confirmation !== VERCEL_BOOTSTRAP_CONFIRMATION) {
    throw new Error(
      `Usage: node scripts/vercel-first-deployment-bootstrap.mjs --output [DISPOSABLE_DIRECTORY] --confirm ${VERCEL_BOOTSTRAP_CONFIRMATION}`,
    )
  }

  const result = await createVercelFirstDeploymentBootstrap(output)
  console.log(
    JSON.stringify({
      status: 'ready',
      outputRoot: result.outputRoot,
      containsApplication: false,
      containsSecrets: false,
      responseHeadersHardened: true,
      remoteMutationPerformed: false,
    }),
  )
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (entrypoint === import.meta.url) {
  await main()
}
