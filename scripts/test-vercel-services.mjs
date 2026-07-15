import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot } from './lib/command.mjs'

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

const config = JSON.parse(read('vercel.json'))
assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json')
assert.deepEqual(Object.keys(config.services).sort(), ['document_worker', 'media_worker', 'web'])
assert.equal(config.services.web.root, '.')
assert.equal(config.services.web.framework, 'nuxtjs')
assert.deepEqual(config.services.web.bindings, [
  {
    type: 'service',
    service: 'media_worker',
    format: 'url',
    env: 'MEDIA_WORKER_INTERNAL_URL',
  },
  {
    type: 'service',
    service: 'document_worker',
    format: 'url',
    env: 'DOCUMENT_WORKER_INTERNAL_URL',
  },
])
assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: { service: 'web' } }])

for (const [service, entrypoint, module] of [
  ['media_worker', 'Dockerfile.media', 'media'],
  ['document_worker', 'Dockerfile.documents', 'documents'],
]) {
  assert.equal(config.services[service].root, '.')
  assert.equal(config.services[service].runtime, 'container')
  assert.equal(config.services[service].entrypoint, entrypoint)
  assert.ok(existsSync(resolve(projectRoot, entrypoint)), `${entrypoint} is missing`)
  assert.equal(resolve(projectRoot, entrypoint, '..'), projectRoot)
  const dockerfile = read(entrypoint)
  assert.match(dockerfile, /COPY workers\/shared \.\/workers\/shared/)
  assert.match(dockerfile, new RegExp(`workers/${module}/service\\.ts`))
}

assert.match(read('.env.example'), /^NUXT_MEDIA_WORKER_SECRET=/m)
console.log('Vercel Services contract: PASS (one public web service, two private bound containers)')
