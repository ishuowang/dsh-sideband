import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LlmRuntime, {
  LlmAdapter,
  createUserMessage,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import SidebandRuntime from '../src/index.js'
import type { Config } from '../src/config.js'

const config: Config = {
  provider: 'fake',
  model: 'summarizer',
  defaultLastMessages: 12,
  maxLastMessages: 500,
  maxInputChars: 80_000,
  maxFocusChars: 4_000,
  maxOutputTokens: 1_200,
  maxSummaryChars: 24_000,
  summarizationTimeoutMs: 10_000,
  concurrency: 1,
  maxRetainedJobs: 20,
  allowRoomTargets: true,
}

function stubAgent(idText: string, sessionStore: SessionStore): Agent & {
  send: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
} {
  const id = SessionId(idText)
  const session = sessionStore.create(id)
  const send = vi.fn()
  const followup = vi.fn()
  return {
    id,
    options: { provider: 'fake', model: 'conversation' },
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send,
    followup,
    steer: vi.fn(),
    inject: vi.fn(),
    cancel: vi.fn(),
    runMaintenance: (task: Parameters<Agent['runMaintenance']>[0]) => task(new AbortController().signal),
    whenIdle: async () => undefined,
  } as unknown as Agent & { send: ReturnType<typeof vi.fn>; followup: ReturnType<typeof vi.fn> }
}

describe('Sideband host command', () => {
  it('snapshots and returns a job id without awaiting the detached summarizer', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(CommandRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(TypertRegistry)

    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let summarizerOptions: GenerateOptions | undefined
    class BlockingAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        summarizerOptions = options
        await gate
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'handoff summary' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'handoff summary' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['fake'], new BlockingAdapter())

    const source = stubAgent('source', ctx.sessions)
    const target = stubAgent('target', ctx.sessions)
    ctx.agents.register(source)
    ctx.agents.register(target)
    source.session.append('turn/start', { turn: 1 })
    source.session.append('user/message', createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'live source context' }],
    }), { surfaceOp: 'append' })
    const runtime = new SidebandRuntime(ctx, config)
    const commandSignal = new AbortController()

    const execution = await ctx.commands.execute(
      source,
      '/sideband send session:target --last 1',
      commandSignal.signal,
    )

    expect(execution?.result).toMatchObject({
      kind: 'success',
      text: expect.stringMatching(/^Sideband queued: sb-/u),
    })
    const jobId = execution?.result.text?.replace('Sideband queued: ', '')
    expect(jobId).toBeTruthy()
    await vi.waitFor(() => expect(runtime.getJob(jobId!)?.state).toBe('summarizing'))
    expect(summarizerOptions?.signal).not.toBe(commandSignal.signal)
    expect(source.session.events.map(event => event.type)).toContain('command/run')
    expect(source.session.deriveMessages().map(message => message.content)).toEqual([
      [{ type: 'text', text: 'live source context' }],
    ])
    expect(target.send).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(runtime.getJob(jobId!)?.state).toBe('delivered'))
    expect(target.send).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'plugin', plugin: 'dsh-sideband', form: 'recall' },
    }), 'next-turn', false)
    const delivered = target.send.mock.calls[0]?.[0]
    expect(delivered?.content[0]?.text).toContain(`Sideband job: ${jobId}`)
    expect(delivered?.content[0]?.text).toContain('Job created:')
    expect(delivered?.content[0]?.text).toContain('Delivery option: quiet')
    expect(target.followup).not.toHaveBeenCalled()
  })
})
