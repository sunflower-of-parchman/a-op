import { accessSync, constants, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, run, runSupabase } from './lib/command.mjs'

const checks = []

function record(name, passed, detail) {
  checks.push({ name, passed, detail })
  console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`)
}

const [major, minor] = process.versions.node.split('.').map(Number)
record('Node 24', major === 24 && minor >= 11, process.version)

const npm = run('npm', ['--version'], { capture: true, allowFailure: true })
record('npm', npm.status === 0, npm.status === 0 ? `v${npm.stdout.trim()}` : 'not available')

const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], {
  capture: true,
  allowFailure: true,
})
record(
  'Docker daemon',
  docker.status === 0,
  docker.status === 0 ? `v${docker.stdout.trim()}` : 'start Docker Desktop',
)

record(
  'Supabase CLI',
  existsSync(resolve(projectRoot, 'node_modules/.bin/supabase')),
  'pinned project dependency',
)

const supabase = runSupabase(['--version'], { capture: true, allowFailure: true })
record(
  'Supabase CLI execution',
  supabase.status === 0,
  supabase.status === 0 ? supabase.stdout.trim() : 'run npm ci',
)

try {
  accessSync(projectRoot, constants.R_OK | constants.W_OK)
  record('Workspace access', true, 'readable and writable')
} catch {
  record('Workspace access', false, 'repository root is not writable')
}

const envExists = existsSync(resolve(projectRoot, '.env'))
console.log(`Local environment: ${envExists ? 'CONFIGURED' : 'created by npm run setup:local'}`)

if (checks.some((check) => !check.passed)) {
  console.error('Preflight: FAIL')
  process.exit(1)
}

console.log('Preflight: PASS')
