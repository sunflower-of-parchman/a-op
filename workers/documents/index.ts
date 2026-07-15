import { runDocumentWorker } from './runtime.ts'

await runDocumentWorker({ watch: process.argv.includes('--watch') })
