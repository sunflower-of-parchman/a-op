import { runMediaWorker } from './runtime.ts'

await runMediaWorker({ watch: process.argv.includes('--watch') })
