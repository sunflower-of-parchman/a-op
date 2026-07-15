import { resolve } from 'node:path'
import {
  assertPortableValue,
  readPortableExport,
  verifyBundledMedia,
  verifyPortableRelationships,
} from './lib/portability.ts'

const directory = process.argv[2]
if (!directory) throw new Error('Usage: npm run export:verify -- <export-directory> [--json]')
const exportDirectory = resolve(directory)
const portable = await readPortableExport(exportDirectory)
assertPortableValue(portable)
verifyPortableRelationships(portable.content, portable.media)
await verifyBundledMedia(exportDirectory, portable.media)

const result = {
  event: 'artist-export-verified',
  exportId: portable.manifest.exportId,
  snapshotHash: portable.manifest.snapshotHash,
  artifacts: Object.keys(portable.manifest.artifacts).length,
  media: portable.media.entries.length,
  externalAccounts: portable.operations.restore.externalAccounts,
}
if (process.argv.includes('--json')) console.log(JSON.stringify(result))
else {
  console.log(`Artist export verification: PASS — ${result.exportId}`)
  console.log(`Structured artifacts: ${result.artifacts}`)
  console.log(`Bundled media objects: ${result.media}`)
  console.log('External accounts: reconnect after restore through the approval-gated runbooks')
}
