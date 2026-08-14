import { describe, expect, it, vi } from 'vitest'
import { SidebandQueue, type SidebandQueueAdapter } from '../src/queue.js'
import type { NewSidebandJob } from '../src/types.js'

function input(target = 'target'): NewSidebandJob {
  return {
    sourceSessionId: 'source',
    target: { kind: 'session', id: target },
    scope: { kind: 'last', count: 12 },
    delivery: 'quiet',
    snapshot: {
      sourceSessionId: 'source',
      commandBoundarySeq: 3,
      capturedAt: 1,
      entries: [{ role: 'user', text: 'hello' }],
      scope: { kind: 'last', count: 12 },
      omittedMessages: 0,
      truncated: false,
      containsPartial: false,
    },
    route: { provider: 'provider', model: 'model' },
  }
}

describe('SidebandQueue', () => {
  it('returns a queued job before starting detached LLM work', async () => {
    const seenSignals: AbortSignal[] = []
    const summarize = vi.fn(async (_job, signal: AbortSignal) => {
      seenSignals.push(signal)
      return 'summary'
    })
    const deliver = vi.fn(async () => undefined)
    const detachedSeen = vi.fn()
    const detached = async <T>(operation: () => Promise<T>): Promise<T> => {
      detachedSeen()
      return operation()
    }
    const queue = new SidebandQueue({ summarize, deliver, detached }, {
      concurrency: 1,
      maxRetainedJobs: 10,
    })

    const commandController = new AbortController()
    const job = queue.enqueue(input())

    expect(job.state).toBe('queued')
    expect(summarize).not.toHaveBeenCalled()
    commandController.abort(new Error('command request ended'))
    await queue.whenIdle()

    expect(detachedSeen).toHaveBeenCalledTimes(1)
    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]).not.toBe(commandController.signal)
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ id: job.id }), 'summary', seenSignals[0])
    expect(queue.get(job.id)?.state).toBe('delivered')
  })

  it('cancels an active worker through the queue-owned controller', async () => {
    let workerSignal: AbortSignal | undefined
    const adapter: SidebandQueueAdapter = {
      summarize: (_job, signal) => new Promise((_resolve, reject) => {
        workerSignal = signal
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
      deliver: async () => undefined,
      detached: async operation => operation(),
    }
    const queue = new SidebandQueue(adapter, { concurrency: 1, maxRetainedJobs: 10 })
    const job = queue.enqueue(input())
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe('summarizing'))

    expect(queue.cancel(job.id)).toBe(true)
    await queue.whenIdle()

    expect(workerSignal?.aborted).toBe(true)
    expect(queue.get(job.id)).toMatchObject({ state: 'cancelled' })
    expect(queue.cancel(job.id)).toBe(false)
  })

  it('honors concurrency and prunes only terminal jobs for capacity', async () => {
    const releases: Array<() => void> = []
    const adapter: SidebandQueueAdapter = {
      summarize: () => new Promise<string>(resolve => releases.push(() => resolve('done'))),
      deliver: async () => undefined,
      detached: async operation => operation(),
    }
    const queue = new SidebandQueue(adapter, { concurrency: 1, maxRetainedJobs: 2 })
    const first = queue.enqueue(input('a'))
    const second = queue.enqueue(input('b'))
    await vi.waitFor(() => expect(queue.get(first.id)?.state).toBe('summarizing'))
    expect(queue.get(second.id)?.state).toBe('queued')
    expect(() => queue.enqueue(input('c'))).toThrow('jobs are already retained')

    releases.shift()?.()
    await vi.waitFor(() => expect(queue.get(second.id)?.state).toBe('summarizing'))
    const third = queue.enqueue(input('c'))
    expect(queue.get(first.id)).toBeUndefined()
    expect(third.state).toBe('queued')
    releases.shift()?.()
    await vi.waitFor(() => expect(queue.get(third.id)?.state).toBe('summarizing'))
    releases.shift()?.()
    await queue.whenIdle()
  })
})
