import { randomUUID } from 'node:crypto'
import type {
  NewSidebandJob,
  SidebandJobView,
  SidebandJobWork,
  SidebandJobState,
} from './types.js'

export interface SidebandQueueAdapter {
  readonly summarize: (job: SidebandJobWork, signal: AbortSignal) => Promise<string>
  readonly deliver: (job: SidebandJobWork, summary: string, signal: AbortSignal) => Promise<void>
  /** Clear any ambient source-agent initiator before a background worker begins. */
  readonly detached: <T>(operation: () => Promise<T>) => Promise<T>
  readonly warn?: (message: string) => void
}

export interface SidebandQueueOptions {
  readonly concurrency: number
  readonly maxRetainedJobs: number
}

interface MutableJob {
  readonly id: string
  state: SidebandJobState
  readonly sourceSessionId: string
  readonly target: NewSidebandJob['target']
  readonly scope: NewSidebandJob['scope']
  readonly delivery: NewSidebandJob['delivery']
  readonly focus?: string
  readonly snapshot: NewSidebandJob['snapshot']
  readonly route: NewSidebandJob['route']
  readonly createdAt: number
  updatedAt: number
  summary?: string
  error?: string
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length <= 1_000 ? text : `${text.slice(0, 999)}…`
}

function publicView(job: MutableJob): SidebandJobView {
  return Object.freeze({
    id: job.id,
    state: job.state,
    sourceSessionId: job.sourceSessionId,
    target: Object.freeze({ ...job.target }),
    scope: Object.freeze({ ...job.scope }),
    delivery: job.delivery,
    ...job.focus === undefined ? {} : { focus: job.focus },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...job.summary === undefined ? {} : { summary: job.summary },
    ...job.error === undefined ? {} : { error: job.error },
  })
}

function workView(job: MutableJob): SidebandJobWork {
  return Object.freeze({
    ...publicView(job),
    snapshot: job.snapshot,
    route: job.route,
  })
}

function terminal(state: SidebandJobState): boolean {
  return state === 'delivered' || state === 'failed' || state === 'cancelled'
}

// Cancellation may mutate a job while an awaited adapter call is in flight.
function cancelled(job: MutableJob): boolean {
  return job.state === 'cancelled'
}

/** Process-local bounded queue. It intentionally does not use ctx.jobs. */
export class SidebandQueue {
  private readonly jobs = new Map<string, MutableJob>()
  private readonly pending: string[] = []
  private readonly controllers = new Map<string, AbortController>()
  private readonly running = new Set<Promise<void>>()
  private readonly idleWaiters = new Set<() => void>()
  private active = 0
  private scheduled = false
  private stopped = false

  constructor(
    private readonly adapter: SidebandQueueAdapter,
    private readonly options: SidebandQueueOptions,
  ) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency <= 0) {
      throw new Error('sideband queue concurrency must be a positive safe integer')
    }
    if (!Number.isSafeInteger(options.maxRetainedJobs) || options.maxRetainedJobs <= 0) {
      throw new Error('sideband maxRetainedJobs must be a positive safe integer')
    }
  }

  enqueue(input: NewSidebandJob): SidebandJobView {
    if (this.stopped) throw new Error('sideband queue is stopping')
    this.makeCapacity()
    const createdAt = Date.now()
    const job: MutableJob = {
      id: `sb-${randomUUID()}`,
      state: 'queued',
      sourceSessionId: input.sourceSessionId,
      target: Object.freeze({ ...input.target }),
      scope: Object.freeze({ ...input.scope }),
      delivery: input.delivery,
      ...input.focus === undefined ? {} : { focus: input.focus },
      snapshot: input.snapshot,
      route: Object.freeze({ ...input.route }),
      createdAt,
      updatedAt: createdAt,
    }
    this.jobs.set(job.id, job)
    this.pending.push(job.id)
    this.schedule()
    return publicView(job)
  }

  get(jobId: string): SidebandJobView | undefined {
    const job = this.jobs.get(jobId)
    return job === undefined ? undefined : publicView(job)
  }

  list(sourceSessionId?: string): SidebandJobView[] {
    return [...this.jobs.values()]
      .filter(job => sourceSessionId === undefined || job.sourceSessionId === sourceSessionId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(publicView)
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (job === undefined || terminal(job.state)) return false
    job.state = 'cancelled'
    job.updatedAt = Date.now()
    job.error = 'cancelled by source Session'
    this.controllers.get(jobId)?.abort(new Error(job.error))
    this.resolveIdleIfNeeded()
    return true
  }

  async whenIdle(): Promise<void> {
    if (this.isIdle()) return
    await new Promise<void>(resolve => this.idleWaiters.add(resolve))
  }

  async stop(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true
      for (const job of this.jobs.values()) {
        if (!terminal(job.state)) this.cancel(job.id)
      }
    }
    await Promise.allSettled([...this.running])
    this.resolveIdleIfNeeded()
  }

  private makeCapacity(): void {
    if (this.jobs.size < this.options.maxRetainedJobs) return
    for (const [id, job] of this.jobs) {
      if (!terminal(job.state)) continue
      this.jobs.delete(id)
      if (this.jobs.size < this.options.maxRetainedJobs) return
    }
    throw new Error(`sideband: ${this.options.maxRetainedJobs} jobs are already retained; wait or cancel one`)
  }

  private schedule(): void {
    if (this.scheduled || this.stopped) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.pump()
    })
  }

  private pump(): void {
    if (this.stopped) {
      this.resolveIdleIfNeeded()
      return
    }
    while (this.active < this.options.concurrency) {
      const job = this.takeQueued()
      if (job === undefined) break
      this.launch(job)
    }
    this.resolveIdleIfNeeded()
  }

  private takeQueued(): MutableJob | undefined {
    while (this.pending.length > 0) {
      const id = this.pending.shift()
      if (id === undefined) return undefined
      const job = this.jobs.get(id)
      if (job?.state === 'queued') return job
    }
    return undefined
  }

  private launch(job: MutableJob): void {
    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    this.active += 1
    let running: Promise<void>
    try {
      running = Promise.resolve(this.adapter.detached(() => this.execute(job, controller.signal)))
    } catch (error: unknown) {
      running = Promise.reject(error)
    }
    this.running.add(running)
    void running.then(
      () => undefined,
      (error: unknown) => {
        if (!terminal(job.state)) {
          job.state = controller.signal.aborted ? 'cancelled' : 'failed'
          job.error = errorText(error)
          job.updatedAt = Date.now()
        }
        this.adapter.warn?.(`sideband job ${job.id} worker boundary failed: ${errorText(error)}`)
      },
    ).then(() => {
      this.running.delete(running)
      this.controllers.delete(job.id)
      this.active -= 1
      this.schedule()
      this.resolveIdleIfNeeded()
    })
  }

  private async execute(job: MutableJob, signal: AbortSignal): Promise<void> {
    try {
      if (cancelled(job)) return
      this.transition(job, 'summarizing')
      const summary = await this.adapter.summarize(workView(job), signal)
      signal.throwIfAborted()
      if (cancelled(job)) return
      job.summary = summary
      this.transition(job, 'delivering')
      await this.adapter.deliver(workView(job), summary, signal)
      signal.throwIfAborted()
      if (cancelled(job)) return
      this.transition(job, 'delivered')
    } catch (error: unknown) {
      if (job.state === 'cancelled' || signal.aborted) {
        job.state = 'cancelled'
        job.error = errorText(signal.reason ?? error)
      } else {
        job.state = 'failed'
        job.error = errorText(error)
      }
      job.updatedAt = Date.now()
    }
  }

  private transition(job: MutableJob, state: SidebandJobState): void {
    job.state = state
    job.updatedAt = Date.now()
  }

  private isIdle(): boolean {
    return !this.scheduled && this.active === 0 && !this.pending.some(id => this.jobs.get(id)?.state === 'queued')
  }

  private resolveIdleIfNeeded(): void {
    if (!this.isIdle()) return
    for (const resolve of this.idleWaiters) resolve()
    this.idleWaiters.clear()
  }
}
