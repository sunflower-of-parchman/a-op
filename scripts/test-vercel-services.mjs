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

for (const service of ['media_worker', 'document_worker']) {
  assert.equal(config.services[service].root, '.')
  assert.equal(config.services[service].runtime, 'container')
  assert.equal(config.services[service].entrypoint, 'Dockerfile')
  assert.equal(config.services[service].command, undefined)
  assert.ok(existsSync(resolve(projectRoot, 'Dockerfile')), 'Dockerfile is missing')
  const dockerfile = read('Dockerfile')
  assert.match(dockerfile, /COPY workers\/service\.ts \.\/workers\/service\.ts/)
  assert.match(dockerfile, /COPY workers\/shared \.\/workers\/shared/)
  assert.match(dockerfile, /workers\/service\.ts/)
}

assert.match(read('.env.example'), /^NUXT_MEDIA_WORKER_SECRET=/m)
console.log('Vercel Services contract: PASS (one public web service, two private bound containers)')
