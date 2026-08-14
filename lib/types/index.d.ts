import { Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { Config, type Config as SidebandConfig } from './config.js';
import type { SidebandDelivery, SidebandJobView, SidebandTargetInfo } from './types.js';
export { Config } from './config.js';
export type { Config as SidebandConfig } from './config.js';
export * from './parser.js';
export * from './queue.js';
export * from './snapshot.js';
export * from './summarizer.js';
export type * from './types.js';
export declare const name = "sideband";
declare module '@deepseek-ai/cordis' {
    interface Context {
        sideband: SidebandRuntime;
    }
}
/** Enforce the Agent Team Room leader ACL before a room job is admitted or delivered. */
export declare function assertOwnedRoomTarget(ctx: Context, source: Agent, roomId: string): void;
/** Resolve a target live-first, then through the Host's configured cold-Session resolver. */
export declare function resolveSessionTarget(ctx: Context, sourceSessionId: string, targetSessionId: string): Promise<Agent>;
export declare function deliverSessionMessage(target: Agent, text: string, delivery: SidebandDelivery): void;
/** Host-only Sideband command and process-local background queue. */
export default class SidebandRuntime extends Service {
    private readonly config;
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<Config>;
    private readonly queue;
    constructor(ctx: Context, config: SidebandConfig);
    getJob(jobId: string): SidebandJobView | undefined;
    listJobs(sourceSessionId?: string): SidebandJobView[];
    listTargets(source: Agent): SidebandTargetInfo[];
    private handleCommand;
    private assertSource;
    private assertTarget;
    private statusCommand;
    private cancelCommand;
    private deliver;
}
//# sourceMappingURL=index.d.ts.map