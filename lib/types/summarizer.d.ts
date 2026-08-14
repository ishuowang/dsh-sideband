import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Config } from './config.js';
import type { ConversationSnapshot, SidebandJobWork, SummaryRoute } from './types.js';
export declare function resolveSummaryRoute(config: Config, agent: Agent): SummaryRoute;
export declare function renderSnapshot(snapshot: ConversationSnapshot, focus?: string): string;
export declare function summarizeJob(ctx: Context, config: Config, job: SidebandJobWork, workerSignal: AbortSignal): Promise<string>;
//# sourceMappingURL=summarizer.d.ts.map