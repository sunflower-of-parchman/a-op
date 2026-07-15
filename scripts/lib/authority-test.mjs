import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { projectRoot, readJson } from './command.mjs'
import { getLocalStatus } from './local-supabase.mjs'

const accountsPath = resolve(projectRoot, 'content/demo/accounts.json')

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getAuthorityTestContext() {
  const status = getLocalStatus()
  const fixture = readJson(accountsPath)
  const accounts = Object.fromEntries(fixture.accounts.map((account) => [account.key, account]))
  const anonymous = client(status.apiUrl, status.publishableKey)
  const admin = client(status.apiUrl, status.secretKey)
  const authenticated = {}

  for (const account of fixture.accounts) {
    const accountClient = client(status.apiUrl, status.publishableKey)
    const { data, error } = await accountClient.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (error || !data.user) throw new Error(`Could not sign in the ${account.key} fixture.`)
    authenticated[account.key] = { account, client: accountClient, user: data.user }
  }

  return { status, accounts, anonymous, admin, authenticated }
}

export function requireNoError(error, message) {
  if (error) throw new Error(`${message}: ${error.message}`)
}
