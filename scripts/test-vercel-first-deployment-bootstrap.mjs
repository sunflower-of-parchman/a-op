import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createVercelFirstDeploymentBootstrap,
  VERCEL_BOOTSTRAP_CONFIRMATION,
} from './vercel-first-deployment-bootstrap.mjs'

const root = join(tmpdir(), `artist-owned-platform-vercel-bootstrap-${process.pid}`)

try {
  const result = await createVercelFirstDeploymentBootstrap(root)
  const config = JSON.parse(await readFile(join(result.outputRoot, 'config.json'), 'utf8'))
  const html = await readFile(join(result.outputRoot, 'static', 'index.html'), 'utf8')
  const manifest = JSON.parse(await readFile(join(root, 'bootstrap-manifest.json'), 'utf8'))

  assert.deepEqual(config, { version: 3 })
  assert.match(html, /Temporary deployment bootstrap/)
  assert.match(html, /No application, credentials, customer data, or media are present/)
  assert.doesNotMatch(html, /NUXT_|SUPABASE|STRIPE|VERCEL_TOKEN|soundformovement/i)
  assert.deepEqual(manifest, {
    version: 1,
    purpose: 'vercel-first-deployment-bootstrap',
    containsApplication: false,
    containsSecrets: false,
    expectedEnvironment: 'production',
    expectedDomainAssignment: false,
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
