import { waitUntil } from '@vercel/functions'
import type { H3Event } from 'h3'

export type WorkerServiceKind = 'media' | 'documents'
export type WorkerDispatchResult =
  | {
      status: 'not-configured' | 'not-required' | 'misconfigured' | 'deferred' | 'scheduled'
    }
  | { status: 'complete'; processed: number; failed: number }

type WorkerFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

function isWorkerSummary(value: unknown): value is { processed: number; failed: number } {
  if (!value || typeof value !== 'object') return false
  const summary = value as Record<string, unknown>
  return (
    Number.isInteger(summary.processed) &&
    Number(summary.processed) >= 0 &&
    Number.isInteger(summary.failed) &&
    Number(summary.failed) >= 0
  )
}

export async function invokeWorkerService(options: {
  url?: string
  secret?: string
  fetchImplementation?: WorkerFetch
  timeoutMs?: number
}): Promise<WorkerDispatchResult> {
  if (!options.url) return { status: 'not-configured' }
  if (!options.secret) return { status: 'misconfigured' }

  try {
    const baseUrl = new URL(options.url)
    const requestUrl = new URL('jobs/process-one', `${baseUrl.href.replace(/\/$/, '')}/`)
    const response = await (options.fetchImplementation ?? fetch)(requestUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.secret}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 240_000),
    })
    if (!response.ok) return { status: 'deferred' }
    const summary: unknown = await response.json()
    if (!isWorkerSummary(summary)) return { status: 'deferred' }
    return { status: 'complete', processed: summary.processed, failed: summary.failed }
  } catch {
    return { status: 'deferred' }
  }
}

export async function dispatchWorkerService(options: {
  url?: string
  secret?: string
  fetchImplementation?: WorkerFetch
  timeoutMs?: number
  defer?: (promise: Promise<unknown>) => void
  onResult?: (result: WorkerDispatchResult) => void
}): Promise<WorkerDispatchResult> {
  const task = invokeWorkerService(options).then((result) => {
    options.onResult?.(result)
    return result
  })
  if (options.defer && options.url && options.secret) {
    options.defer(task)
    return { status: 'scheduled' }
  }
  return task
}

function logDispatchResult(kind: WorkerServiceKind, result: WorkerDispatchResult) {
  if (result.status === 'misconfigured' || result.status === 'deferred') {
    console.warn(
      JSON.stringify({ event: 'worker-dispatch-deferred', worker: kind, reason: result.status }),
    )
  }
}

export async function requestWorkerRun(
  event: H3Event,
  kind: WorkerServiceKind,
): Promise<WorkerDispatchResult> {
  const config = useRuntimeConfig(event)
  const url =
    kind === 'media'
      ? process.env.MEDIA_WORKER_INTERNAL_URL
      : process.env.DOCUMENT_WORKER_INTERNAL_URL
  return dispatchWorkerService({
    url,
    secret: config.mediaWorkerSecret,
    defer: process.env.VERCEL ? waitUntil : undefined,
    onResult: (result) => logDispatchResult(kind, result),
  })
}

export async function requestDocumentWorkerForOrder(
  event: H3Event,
  orderId: string,
): Promise<WorkerDispatchResult> {
  try {
    const { data, error } = await getAdminSupabase(event)
      .from('issued_licenses')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle()
    if (error) return { status: 'deferred' }
    if (!data) return { status: 'not-required' }
    return requestWorkerRun(event, 'documents')
  } catch {
    return { status: 'deferred' }
  }
}
