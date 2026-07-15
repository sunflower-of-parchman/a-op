import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { projectRoot, readJson } from './lib/command.mjs'

function listMarkdown(directory) {
  return readdirSync(resolve(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(projectRoot, directory, entry.name)
    if (entry.isDirectory()) return listMarkdown(relative(projectRoot, path))
    return entry.name.endsWith('.md') ? [relative(projectRoot, path)] : []
  })
}

const markdownFiles = [
  'README.md',
  'SETUP.md',
  'BUILD_WEEK.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  ...listMarkdown('docs'),
  ...listMarkdown('plans'),
]

for (const relativePath of markdownFiles) {
  const absolutePath = resolve(projectRoot, relativePath)
  assert.ok(existsSync(absolutePath), `${relativePath} is missing.`)
  const markdown = readFileSync(absolutePath, 'utf8')
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split(/\s+"/)[0]
    if (/^(?:https?:|mailto:|#|\/)/.test(target)) continue
    const path = decodeURIComponent(target.split('#')[0])
    assert.ok(
      existsSync(resolve(dirname(absolutePath), path)),
      `${relativePath} links to missing ${path}.`,
    )
  }
}

const readme = readFileSync(resolve(projectRoot, 'README.md'), 'utf8')
for (const heading of [
  'What the complete platform includes',
  'Architecture',
  'Judge in five minutes',
  'Requirements and supported environments',
  'Security and recovery model',
  'Deployment and operating costs',
  'Contributing',
  'Troubleshooting',
]) {
  assert.ok(readme.includes(`## ${heading}`), `README is missing ${heading}.`)
}

const packageJson = readJson(resolve(projectRoot, 'package.json'))
for (const script of ['demo:local', 'demo:reset', 'test:docs', 'test:cross-browser']) {
  assert.ok(packageJson.scripts[script], `package.json is missing ${script}.`)
}

for (const submissionDocument of [
  'docs/submission/hosted-test-plan.md',
  'docs/submission/judging-guide.md',
  'docs/submission/project-description.md',
  'docs/submission/demo-script.md',
  'docs/submission/submission-checklist.md',
]) {
  assert.ok(
    existsSync(resolve(projectRoot, submissionDocument)),
    `${submissionDocument} is missing.`,
  )
}

const manifest = readJson(resolve(projectRoot, 'content/demo/assets.json'))
assert.equal(manifest.fictional, true)
assert.ok(manifest.assets.length >= 7)
for (const asset of manifest.assets) {
  assert.equal(asset.original, true, `${asset.id} must be original.`)
  assert.equal(asset.privateMaterial, false, `${asset.id} includes private material.`)
  assert.ok(asset.license, `${asset.id} is missing its license state.`)
  assert.ok(asset.source, `${asset.id} is missing its source.`)
  assert.ok(asset.paths.length > 0, `${asset.id} is missing paths.`)
}

const configuration = readJson(resolve(projectRoot, 'content/demo/bootstrap-config.json'))
assert.equal(configuration.demo.fictional, true)
assert.equal(Object.keys(configuration.features).length, 8)
assert.ok(Object.values(configuration.features).every(Boolean))

for (const screenshot of ['docs/images/daymark-home.png', 'docs/images/daymark-music-mobile.png']) {
  const absolutePath = resolve(projectRoot, screenshot)
  assert.ok(existsSync(absolutePath), `${screenshot} is missing.`)
  assert.ok(statSync(absolutePath).size > 10_000, `${screenshot} is unexpectedly small.`)
}

const publicDemo = [
  readFileSync(resolve(projectRoot, 'content/demo/artist.json'), 'utf8'),
  readFileSync(resolve(projectRoot, 'content/demo/catalog.json'), 'utf8'),
  readFileSync(resolve(projectRoot, 'content/demo/bootstrap-config.json'), 'utf8'),
  readFileSync(resolve(projectRoot, 'content/demo/assets.json'), 'utf8'),
].join('\n')
assert.ok(!publicDemo.includes('Sound for Movement'))
assert.ok(!publicDemo.includes('/Users/'))

console.log('Documentation and fictional asset package: PASS')
