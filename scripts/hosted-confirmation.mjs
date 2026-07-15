import { confirmationForProjectRef } from './lib/hosted-reset.mjs'

const [operation, projectRef] = process.argv.slice(2)
if (!['initialize', 'reset'].includes(operation) || !/^[a-z0-9]{20}$/.test(projectRef ?? '')) {
  console.error('Usage: npm run hosted:confirmation -- [initialize|reset] [PROJECT_REF]')
  process.exit(1)
}

console.log(confirmationForProjectRef(operation, projectRef))
