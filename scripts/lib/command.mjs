import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const supabaseBinary = resolve(projectRoot, 'node_modules/.bin/supabase')
export const isolatedSupabaseHome = resolve(tmpdir(), 'artist-owned-platform-supabase-home')

mkdirSync(isolatedSupabaseHome, { recursive: true })

export const supabaseEnvironment = {
  ...process.env,
  HOME: isolatedSupabaseHome,
  DO_NOT_TRACK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1',
}

export function redactOutput(value) {
  return String(value)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
    .replace(
      /((?:service[_ -]?role|secret|password|publishable|anon)[_ -]?(?:key|token)?\s*[:=]\s*)\S+/gi,
      '$1[REDACTED]',
    )
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.capture ? 'pipe' : 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0 && !options.allowFailure) {
    const detail = redactOutput([result.stdout, result.stderr].filter(Boolean).join('\n')).trim()
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}.${detail ? `\n${detail}` : ''}`,
    )
  }

  return result
}

export function runSupabase(args, options = {}) {
  return run(supabaseBinary, args, {
    ...options,
    env: { ...supabaseEnvironment, ...options.env },
  })
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJsonIfChanged(path, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`
  let current = ''

  try {
    current = readFileSync(path, 'utf8')
  } catch {
    // A missing state file is created below.
  }

  if (current !== next) {
    writeFileSync(path, next, 'utf8')
  }
}

export function writePrivateFile(path, value) {
  writeFileSync(path, value, { encoding: 'utf8', mode: 0o600 })
  chmodSync(path, 0o600)
}
