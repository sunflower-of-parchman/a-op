import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, readJson, redactOutput } from './lib/command.mjs'
import {
  confirmationForProjectRef,
  createHostedSqlExecutor,
  performHostedReset,
} from './lib/hosted-reset.mjs'

function parseArguments(arguments_) {
  const [operation, ...rest] = arguments_
  const options = { operation }
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error('Hosted reset arguments are incomplete.')
    if (flag === '--project-ref') options.projectRef = value
    else if (flag === '--confirm') options.confirmation = value
    else if (flag === '--accounts') options.accountsPath = value
    else if (flag === '--env-file') options.environmentPath = value
    else throw new Error(`Unknown hosted reset argument: ${flag}`)
  }
  return options
}

function parseEnvironment(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#'))
    .reduce((environment, line) => {
      const separator = line.indexOf('=')
      if (separator > 0) {
        const key = line.slice(0, separator)
        let value = line.slice(separator + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        environment[key] = value
      }
      return environment
    }, {})
}

try {
  const options = parseArguments(process.argv.slice(2))
  if (!options.projectRef || !options.accountsPath || !options.environmentPath) {
    throw new Error(
      'Usage: npm run hosted:[initialize|check|reset] -- --project-ref REF --accounts PRIVATE_JSON --env-file PRIVATE_ENV [--confirm VALUE]',
    )
  }

  const environment = { ...process.env, ...parseEnvironment(resolve(options.environmentPath)) }
  const status = {
    apiUrl: environment.NUXT_PUBLIC_SUPABASE_URL,
    publishableKey: environment.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: environment.NUXT_SUPABASE_SECRET_KEY,
  }
  const linkedProjectRef = readFileSync(
    resolve(projectRoot, 'supabase/.temp/project-ref'),
    'utf8',
  ).trim()
  const fixture = readJson(resolve(options.accountsPath))

  if (options.operation !== 'check' && !options.confirmation) {
    throw new Error(
      `Exact confirmation required: ${confirmationForProjectRef(options.operation, options.projectRef)}`,
    )
  }

  const result = await performHostedReset({
    operation: options.operation,
    projectRef: options.projectRef,
    confirmation: options.confirmation,
    fixture,
    status,
    linkedProjectRef,
    executeSql: createHostedSqlExecutor({ target: 'linked' }),
  })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: 'fail',
        error: redactOutput(error instanceof Error ? error.message : String(error)),
      },
      null,
      2,
    ),
  )
  process.exit(1)
}
