import assert from 'node:assert/strict'
import { readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createVercelFirstDeploymentBootstrap,
  VERCEL_BOOTSTRAP_CONFIRMATION,
  VERCEL_BOOTSTRAP_HEADERS,
} from './vercel-first-deployment-bootstrap.mjs'

const root = join(tmpdir(), `artist-owned-platform-vercel-bootstrap-${process.pid}`)

try {
  const result = await createVercelFirstDeploymentBootstrap(root)
  const config = JSON.parse(await readFile(join(result.outputRoot, 'config.json'), 'utf8'))
  const html = await readFile(join(result.outputRoot, 'static', 'index.html'), 'utf8')
  const manifest = JSON.parse(await readFile(join(root, 'bootstrap-manifest.json'), 'utf8'))
  const configMode = (await stat(join(result.outputRoot, 'config.json'))).mode & 0o777
  const htmlMode = (await stat(join(result.outputRoot, 'static', 'index.html'))).mode & 0o777
  const manifestMode = (await stat(join(root, 'bootstrap-manifest.json'))).mode & 0o777

  assert.deepEqual(config, {
    version: 3,
    routes: [
      {
        src: '/(.*)',
        headers: VERCEL_BOOTSTRAP_HEADERS,
        continue: true,
      },
    ],
  })
  assert.match(html, /Temporary deployment bootstrap/)
  assert.match(html, /No application, credentials, customer data, or media are present/)
  assert.doesNotMatch(html, /NUXT_|SUPABASE|STRIPE|VERCEL_TOKEN|soundformovement/i)
  assert.equal(configMode, 0o600)
  assert.equal(htmlMode, 0o600)
  assert.equal(manifestMode, 0o600)
  assert.deepEqual(manifest, {
    version: 1,
    purpose: 'vercel-first-deployment-bootstrap',
    containsApplication: false,
    containsSecrets: false,
    expectedEnvironment: 'production',
    expectedCustomDomainAssignment: false,
    expectedPlatformManagedUrls: true,
    responseHeadersHardened: true,
    removalRequired: true,
  })
  assert.equal(VERCEL_BOOTSTRAP_CONFIRMATION, 'TEMPORARY_PRODUCTION_BOOTSTRAP')
  await assert.rejects(
    createVercelFirstDeploymentBootstrap(root),
    /already exists; use a fresh disposable directory/,
  )
  await assert.rejects(
    createVercelFirstDeploymentBootstrap(join(process.cwd(), '.bootstrap-test')),
    /must be generated outside the repository/,
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log(
  'Vercel first-deployment bootstrap: PASS (disposable, non-secret, no application payload)',
)
