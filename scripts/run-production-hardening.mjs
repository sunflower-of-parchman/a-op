import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { projectRoot, redactOutput } from './lib/command.mjs'

const port = Number(process.env.HARDENING_PORT ?? 3125)
const baseUrl = `http://127.0.0.1:${port}`
const serverArguments = [
  ...(existsSync(join(projectRoot, '.env')) ? ['--env-file=.env'] : []),
  '.output/server/index.mjs',
]
const server = spawn(process.execPath, serverArguments, {
  cwd: projectRoot,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', (chunk) => (serverOutput += chunk))
server.stderr.on('data', (chunk) => (serverOutput += chunk))

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited early.\n${redactOutput(serverOutput)}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Production server did not become ready.\n${redactOutput(serverOutput)}`)
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: projectRoot,
    env: { ...process.env, BASE_URL: baseUrl },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
}

try {
  await waitForServer()
  run(join(projectRoot, 'node_modules/.bin/playwright'), [
    'test',
    'tests/e2e/hardening.spec.ts',
    '--project=chromium',
    '--project=mobile-chromium',
  ])
  if (!process.exitCode) run(process.execPath, ['scripts/test-performance.mjs'])
} finally {
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve()
    else server.once('exit', resolve)
    setTimeout(resolve, 2_000)
  })
}

if (!process.exitCode) {
  console.log('Production hardening: PASS (desktop, mobile, security, accessibility, performance)')
}
