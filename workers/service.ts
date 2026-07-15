import { runDocumentWorker } from './documents/runtime.ts'
import { runMediaWorker } from './media/runtime.ts'
import { startWorkerRouterHttpService } from './shared/httpService.ts'

const secret = process.env.NUXT_MEDIA_WORKER_SECRET
if (!secret)
  throw new Error('Required worker environment variable NUXT_MEDIA_WORKER_SECRET is missing.')

startWorkerRouterHttpService({
  services: [
    {
      service: 'media',
      secret,
      processOne: () => runMediaWorker({ maxJobs: 1 }),
    },
    {
      service: 'documents',
      secret,
      processOne: () => runDocumentWorker({ maxJobs: 1 }),
    },
  ],
})
