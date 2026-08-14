import z from '@deepseek-ai/schemastery'

export interface Config {
  /** Dedicated summarizer provider. Empty uses the source Session route. */
  provider: string
  /** Dedicated summarizer model. Empty uses the source Session route. */
  model: string
  /** Safe default when neither --last nor --all is supplied. */
  defaultLastMessages: number
  /** Hard ceiling for user-selected --last counts. */
  maxLastMessages: number
  /** Maximum visible transcript characters sent to the summarizer. */
  maxInputChars: number
  /** Maximum command-authored focus length. */
  maxFocusChars: number
  /** Maximum model output tokens for one summary. */
  maxOutputTokens: number
  /** Maximum summary characters delivered after generation. */
  maxSummaryChars: number
  /** Timeout for each background summarization call. */
  summarizationTimeoutMs: number
  /** Maximum simultaneous summarization/delivery workers. */
  concurrency: number
  /** Maximum process-local jobs retained for status. */
  maxRetainedJobs: number
  /** Whether room:<id> targets may use an optional ctx.rooms service. */
  allowRoomTargets: boolean
}

export const Config: z<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  defaultLastMessages: z.natural().min(1).max(500).default(12),
  maxLastMessages: z.natural().min(1).max(5_000).default(500),
  maxInputChars: z.natural().min(1_000).max(1_000_000).default(80_000),
  maxFocusChars: z.natural().min(64).max(100_000).default(4_000),
  maxOutputTokens: z.natural().min(64).max(32_768).default(1_200),
  maxSummaryChars: z.natural().min(256).max(1_000_000).default(24_000),
  summarizationTimeoutMs: z.natural().min(1_000).max(1_800_000).default(120_000),
  concurrency: z.natural().min(1).max(16).default(2),
  maxRetainedJobs: z.natural().min(10).max(10_000).default(200),
  allowRoomTargets: z.boolean().default(true),
})

export function assertConfig(config: Config): void {
  const hasProvider = config.provider.trim().length > 0
  const hasModel = config.model.trim().length > 0
  if (hasProvider !== hasModel) {
    throw new Error('sideband: configure both provider and model, or leave both empty')
  }
  if (config.defaultLastMessages > config.maxLastMessages) {
    throw new Error('sideband: defaultLastMessages cannot exceed maxLastMessages')
  }
}
