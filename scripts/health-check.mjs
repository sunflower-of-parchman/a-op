const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000'

try {
  const response = await fetch(baseUrl, { redirect: 'error' })
  const body = await response.text()
  const healthy = response.ok && body.includes('Daymark Assembly')

  console.log(`Public application: ${healthy ? 'PASS' : 'FAIL'} (HTTP ${response.status})`)
  if (!healthy) process.exit(1)
} catch (error) {
  console.error(
    `Public application: FAIL (${error instanceof Error ? error.message : String(error)})`,
  )
  process.exit(1)
}
