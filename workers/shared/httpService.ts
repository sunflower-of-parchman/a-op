import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export type WorkerRunSummary = {
  processed: number
  failed: number
}

type WorkerHttpServiceOptions = {
  service: 'media' | 'documents'
  processOne: () => Promise<WorkerRunSummary>
  secret: string
}

type WorkerRequest = {
  method?: string
  path: string
  authorization?: string
}

type WorkerResponse = {
  statusCode: number
  payload: object
}

type WorkerRouterOptions = {
  services: WorkerHttpServiceOptions[]
}

function sendJson(response: ServerResponse, statusCode: number, payload: object) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(`${JSON.stringify(payload)}\n`)
}

export function hasValidWorkerAuthorization(header: string | undefined, expectedSecret: string) {
  if (!header?.startsWith('Bearer ') || !expectedSecret) return false
  const supplied = Buffer.from(header.slice('Bearer '.length), 'utf8')
  const expected = Buffer.from(expectedSecret, 'utf8')
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected)
}

export function createWorkerRequestHandler(options: WorkerHttpServiceOptions) {
  let active = false

  return async (request: WorkerRequest): Promise<WorkerResponse> => {
    if (request.method === 'GET' && request.path === '/health') {
      return {
        statusCode: 200,
        payload: { status: 'ok', service: options.service, queue: 'supabase-durable' },
      }
    }
    if (request.method !== 'POST' || request.path !== '/jobs/process-one') {
      return { statusCode: 404, payload: { status: 'not-found' } }
    }
    if (!hasValidWorkerAuthorization(request.authorization, options.secret)) {
      return { statusCode: 401, payload: { status: 'unauthorized' } }
    }
    if (active) {
      return { statusCode: 409, payload: { status: 'busy' } }
    }

    active = true
    try {
      const summary = await options.processOne()
      return {
        statusCode: 200,
        payload: { status: 'complete', service: options.service, ...summary },
      }
    } catch {
      return {
        statusCode: 500,
        payload: { status: 'worker-error', service: options.service },
      }
    } finally {
      active = false
    }
  }
}

export function createWorkerRouterRequestHandler(options: WorkerRouterOptions) {
  const handlers = new Map(
    options.services.map((service) => [service.service, createWorkerRequestHandler(service)]),
  )

  return async (request: WorkerRequest): Promise<WorkerResponse> => {
    const match = request.path.match(/^\/(media|documents)(\/.*)$/)
    if (!match) return { statusCode: 404, payload: { status: 'not-found' } }
    const handler = handlers.get(match[1] as WorkerHttpServiceOptions['service'])
    if (!handler) return { statusCode: 404, payload: { status: 'not-found' } }
    return handler({ ...request, path: match[2] })
  }
}

export function createWorkerHttpService(options: WorkerHttpServiceOptions) {
  const handleRequest = createWorkerRequestHandler(options)
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const result = await handleRequest({
      method: request.method,
      path: new URL(request.url ?? '/', 'http://worker.internal').pathname,
      authorization: request.headers.authorization,
    })
    sendJson(response, result.statusCode, result.payload)
  })
}

export function createWorkerRouterHttpService(options: WorkerRouterOptions) {
  const handleRequest = createWorkerRouterRequestHandler(options)
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const result = await handleRequest({
      method: request.method,
      path: new URL(request.url ?? '/', 'http://worker.internal').pathname,
      authorization: request.headers.authorization,
    })
    sendJson(response, result.statusCode, result.payload)
  })
}

function listenForWorkerRequests(
  server: ReturnType<typeof createServer>,
  service: 'media' | 'documents' | 'worker-runtime',
) {
  const port = Number(process.env.PORT ?? 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('The worker service PORT must be an integer between 1 and 65535.')
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'worker-service-listening', service, port }))
  })
  process.once('SIGTERM', () => server.close())
  return server
}

export function startWorkerHttpService(options: WorkerHttpServiceOptions) {
  return listenForWorkerRequests(createWorkerHttpService(options), options.service)
}

export function startWorkerRouterHttpService(options: WorkerRouterOptions) {
  return listenForWorkerRequests(createWorkerRouterHttpService(options), 'worker-runtime')
}
