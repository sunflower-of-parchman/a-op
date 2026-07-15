import { describe, expect, it, vi } from 'vitest'
import { createWorkerRequestHandler } from '../../workers/shared/httpService'
import { dispatchWorkerService, invokeWorkerService } from '../../server/utils/workerServices'

describe('private worker HTTP service', () => {
  it('keeps health non-sensitive and requires an exact bearer secret for work', async () => {
    const processOne = vi.fn(async () => ({ processed: 1, failed: 0 }))
    const handleRequest = createWorkerRequestHandler({
      service: 'media',
      secret: 'service-secret',
      processOne,
    })

    const health = await handleRequest({ method: 'GET', path: '/health' })
    expect(health.payload).toEqual({
      status: 'ok',
      service: 'media',
      queue: 'supabase-durable',
    })
    expect((await handleRequest({ method: 'POST', path: '/jobs/process-one' })).payload).toEqual({
      status: 'unauthorized',
    })
    expect(
      (
        await handleRequest({
          method: 'POST',
          path: '/jobs/process-one',
          authorization: 'Bearer service-secret',
        })
      ).payload,
    ).toEqual({ status: 'complete', service: 'media', processed: 1, failed: 0 })
    expect(processOne).toHaveBeenCalledTimes(1)
  })

  it('admits one job per service instance at a time', async () => {
    let release: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const handleRequest = createWorkerRequestHandler({
      service: 'documents',
      secret: 'service-secret',
      processOne: async () => {
        markStarted?.()
        await pending
        return { processed: 1, failed: 0 }
      },
    })
    const request = {
      method: 'POST',
      path: '/jobs/process-one',
      authorization: 'Bearer service-secret',
    }
    const first = handleRequest(request)
    await started
    const second = await handleRequest(request)
    expect(second.statusCode).toBe(409)
    expect(second.payload).toEqual({ status: 'busy' })
    release?.()
    expect((await first).statusCode).toBe(200)
  })
})

describe('Nuxt worker binding client', () => {
  it('defers hosted work while retaining the eventual result', async () => {
    let release: (() => void) | undefined
    let deferred: Promise<unknown> | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const result = await dispatchWorkerService({
      url: 'https://worker.internal',
      secret: 'service-secret',
      defer: (promise) => {
        deferred = promise
      },
      fetchImplementation: async () => {
        await pending
        return Response.json({ status: 'complete', processed: 1, failed: 0 })
      },
    })

    expect(result).toEqual({ status: 'scheduled' })
    expect(deferred).toBeInstanceOf(Promise)
    release?.()
    await expect(deferred).resolves.toEqual({ status: 'complete', processed: 1, failed: 0 })
  })

  it('calls the bound service without returning its URL or secret', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://worker.internal/jobs/process-one')
      expect(init?.headers).toEqual({ authorization: 'Bearer service-secret' })
      return Response.json({ status: 'complete', processed: 1, failed: 0 })
    })
    const result = await invokeWorkerService({
      url: 'https://worker.internal',
      secret: 'service-secret',
      fetchImplementation,
    })

    expect(result).toEqual({ status: 'complete', processed: 1, failed: 0 })
    expect(JSON.stringify(result)).not.toContain('worker.internal')
    expect(JSON.stringify(result)).not.toContain('service-secret')
  })

  it('preserves the durable queue when a binding is absent or unavailable', async () => {
    expect(await invokeWorkerService({ secret: 'service-secret' })).toEqual({
      status: 'not-configured',
    })
    expect(await invokeWorkerService({ url: 'https://worker.internal' })).toEqual({
      status: 'misconfigured',
    })
    expect(
      await invokeWorkerService({
        url: 'https://worker.internal',
        secret: 'service-secret',
        fetchImplementation: async () => new Response(null, { status: 503 }),
      }),
    ).toEqual({ status: 'deferred' })
  })
})
