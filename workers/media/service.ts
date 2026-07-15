import { startWorkerHttpService } from '../shared/httpService.ts'
import { runMediaWorker } from './runtime.ts'

const secret = process.env.NUXT_MEDIA_WORKER_SECRET
if (!secret)
  throw new Error('Required worker environment variable NUXT_MEDIA_WORKER_SECRET is missing.')

startWorkerHttpService({
  service: 'media',
  secret,
  processOne: () => runMediaWorker({ maxJobs: 1 }),
})
