import type { NewSidebandJob, SidebandJobView, SidebandJobWork } from './types.js';
export interface SidebandQueueAdapter {
    readonly summarize: (job: SidebandJobWork, signal: AbortSignal) => Promise<string>;
    readonly deliver: (job: SidebandJobWork, summary: string, signal: AbortSignal) => Promise<void>;
    /** Clear any ambient source-agent initiator before a background worker begins. */
    readonly detached: <T>(operation: () => Promise<T>) => Promise<T>;
    readonly warn?: (message: string) => void;
}
export interface SidebandQueueOptions {
    readonly concurrency: number;
    readonly maxRetainedJobs: number;
}
/** Process-local bounded queue. It intentionally does not use ctx.jobs. */
export declare class SidebandQueue {
    private readonly adapter;
    private readonly options;
    private readonly jobs;
    private readonly pending;
    private readonly controllers;
    private readonly running;
    private readonly idleWaiters;
    private active;
    private scheduled;
    private stopped;
    constructor(adapter: SidebandQueueAdapter, options: SidebandQueueOptions);
    enqueue(input: NewSidebandJob): SidebandJobView;
    get(jobId: string): SidebandJobView | undefined;
    list(sourceSessionId?: string): SidebandJobView[];
    cancel(jobId: string): boolean;
    whenIdle(): Promise<void>;
    stop(): Promise<void>;
    private makeCapacity;
    private schedule;
    private pump;
    private takeQueued;
    private launch;
    private execute;
    private transition;
    private isIdle;
    private resolveIdleIfNeeded;
}
//# sourceMappingURL=queue.d.ts.map