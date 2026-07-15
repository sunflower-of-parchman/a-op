import { startWorkerHttpService } from '../shared/httpService.ts'
import { runDocumentWorker } from './runtime.ts'

const secret = process.env.NUXT_MEDIA_WORKER_SECRET
if (!secret)
  throw new Error('Required worker environment variable NUXT_MEDIA_WORKER_SECRET is missing.')

startWorkerHttpService({
  service: 'documents',
  secret,
  processOne: () => runDocumentWorker({ maxJobs: 1 }),
})
