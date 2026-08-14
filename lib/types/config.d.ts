import z from '@deepseek-ai/schemastery';
export interface Config {
    /** Dedicated summarizer provider. Empty uses the source Session route. */
    provider: string;
    /** Dedicated summarizer model. Empty uses the source Session route. */
    model: string;
    /** Safe default when neither --last nor --all is supplied. */
    defaultLastMessages: number;
    /** Hard ceiling for user-selected --last counts. */
    maxLastMessages: number;
    /** Maximum visible transcript characters sent to the summarizer. */
    maxInputChars: number;
    /** Maximum command-authored focus length. */
    maxFocusChars: number;
    /** Maximum model output tokens for one summary. */
    maxOutputTokens: number;
    /** Maximum summary characters delivered after generation. */
    maxSummaryChars: number;
    /** Timeout for each background summarization call. */
    summarizationTimeoutMs: number;
    /** Maximum simultaneous summarization/delivery workers. */
    concurrency: number;
    /** Maximum process-local jobs retained for status. */
    maxRetainedJobs: number;
    /** Whether room:<id> targets may use an optional ctx.rooms service. */
    allowRoomTargets: boolean;
}
export declare const Config: z<Config>;
export declare function assertConfig(config: Config): void;
//# sourceMappingURL=config.d.ts.map