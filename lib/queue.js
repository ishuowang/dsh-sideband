import { randomUUID } from 'node:crypto';
function errorText(error) {
    const text = error instanceof Error ? error.message : String(error);
    return text.length <= 1_000 ? text : `${text.slice(0, 999)}…`;
}
function publicView(job) {
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
    });
}
function workView(job) {
    return Object.freeze({
        ...publicView(job),
        snapshot: job.snapshot,
        route: job.route,
    });
}
function terminal(state) {
    return state === 'delivered' || state === 'failed' || state === 'cancelled';
}
// Cancellation may mutate a job while an awaited adapter call is in flight.
function cancelled(job) {
    return job.state === 'cancelled';
}
/** Process-local bounded queue. It intentionally does not use ctx.jobs. */
export class SidebandQueue {
    adapter;
    options;
    jobs = new Map();
    pending = [];
    controllers = new Map();
    running = new Set();
    idleWaiters = new Set();
    active = 0;
    scheduled = false;
    stopped = false;
    constructor(adapter, options) {
        this.adapter = adapter;
        this.options = options;
        if (!Number.isSafeInteger(options.concurrency) || options.concurrency <= 0) {
            throw new Error('sideband queue concurrency must be a positive safe integer');
        }
        if (!Number.isSafeInteger(options.maxRetainedJobs) || options.maxRetainedJobs <= 0) {
            throw new Error('sideband maxRetainedJobs must be a positive safe integer');
        }
    }
    enqueue(input) {
        if (this.stopped)
            throw new Error('sideband queue is stopping');
        this.makeCapacity();
        const createdAt = Date.now();
        const job = {
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
        };
        this.jobs.set(job.id, job);
        this.pending.push(job.id);
        this.schedule();
        return publicView(job);
    }
    get(jobId) {
        const job = this.jobs.get(jobId);
        return job === undefined ? undefined : publicView(job);
    }
    list(sourceSessionId) {
        return [...this.jobs.values()]
            .filter(job => sourceSessionId === undefined || job.sourceSessionId === sourceSessionId)
            .sort((left, right) => right.createdAt - left.createdAt)
            .map(publicView);
    }
    cancel(jobId) {
        const job = this.jobs.get(jobId);
        if (job === undefined || terminal(job.state))
            return false;
        job.state = 'cancelled';
        job.updatedAt = Date.now();
        job.error = 'cancelled by source Session';
        this.controllers.get(jobId)?.abort(new Error(job.error));
        this.resolveIdleIfNeeded();
        return true;
    }
    async whenIdle() {
        if (this.isIdle())
            return;
        await new Promise(resolve => this.idleWaiters.add(resolve));
    }
    async stop() {
        if (!this.stopped) {
            this.stopped = true;
            for (const job of this.jobs.values()) {
                if (!terminal(job.state))
                    this.cancel(job.id);
            }
        }
        await Promise.allSettled([...this.running]);
        this.resolveIdleIfNeeded();
    }
    makeCapacity() {
        if (this.jobs.size < this.options.maxRetainedJobs)
            return;
        for (const [id, job] of this.jobs) {
            if (!terminal(job.state))
                continue;
            this.jobs.delete(id);
            if (this.jobs.size < this.options.maxRetainedJobs)
                return;
        }
        throw new Error(`sideband: ${this.options.maxRetainedJobs} jobs are already retained; wait or cancel one`);
    }
    schedule() {
        if (this.scheduled || this.stopped)
            return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.pump();
        });
    }
    pump() {
        if (this.stopped) {
            this.resolveIdleIfNeeded();
            return;
        }
        while (this.active < this.options.concurrency) {
            const job = this.takeQueued();
            if (job === undefined)
                break;
            this.launch(job);
        }
        this.resolveIdleIfNeeded();
    }
    takeQueued() {
        while (this.pending.length > 0) {
            const id = this.pending.shift();
            if (id === undefined)
                return undefined;
            const job = this.jobs.get(id);
            if (job?.state === 'queued')
                return job;
        }
        return undefined;
    }
    launch(job) {
        const controller = new AbortController();
        this.controllers.set(job.id, controller);
        this.active += 1;
        let running;
        try {
            running = Promise.resolve(this.adapter.detached(() => this.execute(job, controller.signal)));
        }
        catch (error) {
            running = Promise.reject(error);
        }
        this.running.add(running);
        void running.then(() => undefined, (error) => {
            if (!terminal(job.state)) {
                job.state = controller.signal.aborted ? 'cancelled' : 'failed';
                job.error = errorText(error);
                job.updatedAt = Date.now();
            }
            this.adapter.warn?.(`sideband job ${job.id} worker boundary failed: ${errorText(error)}`);
        }).then(() => {
            this.running.delete(running);
            this.controllers.delete(job.id);
            this.active -= 1;
            this.schedule();
            this.resolveIdleIfNeeded();
        });
    }
    async execute(job, signal) {
        try {
            if (cancelled(job))
                return;
            this.transition(job, 'summarizing');
            const summary = await this.adapter.summarize(workView(job), signal);
            signal.throwIfAborted();
            if (cancelled(job))
                return;
            job.summary = summary;
            this.transition(job, 'delivering');
            await this.adapter.deliver(workView(job), summary, signal);
            signal.throwIfAborted();
            if (cancelled(job))
                return;
            this.transition(job, 'delivered');
        }
        catch (error) {
            if (job.state === 'cancelled' || signal.aborted) {
                job.state = 'cancelled';
                job.error = errorText(signal.reason ?? error);
            }
            else {
                job.state = 'failed';
                job.error = errorText(error);
            }
            job.updatedAt = Date.now();
        }
    }
    transition(job, state) {
        job.state = state;
        job.updatedAt = Date.now();
    }
    isIdle() {
        return !this.scheduled && this.active === 0 && !this.pending.some(id => this.jobs.get(id)?.state === 'queued');
    }
    resolveIdleIfNeeded() {
        if (!this.isIdle())
            return;
        for (const resolve of this.idleWaiters)
            resolve();
        this.idleWaiters.clear();
    }
}
//# sourceMappingURL=queue.js.map