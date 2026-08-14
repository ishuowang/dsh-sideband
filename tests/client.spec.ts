import { describe, expect, it, vi } from 'vitest'
import type {
  SessionBinding,
  SessionId,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  SIDEBAND_LAST_MESSAGES,
  createSidebandDecoration,
  sidebandSendLine,
  sidebandSessionOptions,
  type SidebandClientSessions,
} from '../src/client/index.js'

const sid = (value: string): SessionId => value as SessionId

function summary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: sid(id),
    displayTitle: id,
    running: false,
    blank: false,
    updatedAt: 1,
    ...overrides,
  }
}

function state(...rows: SessionSummary[]): SessionListState {
  return {
    ids: rows.map(row => row.id),
    byId: Object.fromEntries(rows.map(row => [row.id, row])) as SessionListState['byId'],
    current: rows[0]?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function harness(initial: SessionListState) {
  let snapshot = initial
  const command = vi.fn(async () => ({ ok: true as const, value: { matched: true } }))
  const binding = { session: { command } } as unknown as SessionBinding
  const addressed = new Set<SessionId>()
  const sessions: SidebandClientSessions = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    },
    binding: id => snapshot.byId[id] === undefined ? undefined : binding,
    subagentAddress: id => addressed.has(id)
      ? { parentSessionId: sid('parent'), childSessionId: id, mode: 'continuable' }
      : undefined,
  }
  return {
    sessions,
    command,
    address: (id: string) => { addressed.add(sid(id)) },
    replace: (next: SessionListState) => { snapshot = next },
  }
}

describe('Sideband popupSelect decoration', () => {
  it('lists other ordinary sessions and filters both kinds of known subagent', () => {
    const source = summary('source')
    const ordinary = summary('target', {
      displayTitle: 'Release room',
      cwd: '/work/release',
      parentId: source.id,
    })
    const durableChild = summary('child', { origin: 'subagent', parentId: source.id })
    const addressedChild = summary('addressed-child')
    const blankDraft = summary('blank-draft', { blank: true })
    const h = harness(state(source, ordinary, durableChild, addressedChild, blankDraft))
    h.address('addressed-child')

    expect(sidebandSessionOptions(h.sessions, source.id)).toEqual([{
      id: 'target',
      label: 'Release room',
      detail: 'Idle · target',
    }])
  })

  it('submits the quiet twelve-message command through the source binding', async () => {
    const source = summary('source')
    const target = summary('target')
    const h = harness(state(source, target))
    const decoration = createSidebandDecoration(h.sessions)
    const sourceContext = { sessionId: source.id }
    const options = await decoration.ui.options(sourceContext, new AbortController().signal)

    await decoration.ui.onSelect(options[0]!, sourceContext)

    expect(SIDEBAND_LAST_MESSAGES).toBe(12)
    expect(h.command).toHaveBeenCalledWith(
      '/sideband send session:target --last 12 --delivery quiet',
    )
  })

  it('rejects a target removed after the popup opened', async () => {
    const source = summary('source')
    const target = summary('target')
    const h = harness(state(source, target))
    const decoration = createSidebandDecoration(h.sessions)
    const sourceContext = { sessionId: source.id }
    const options = await decoration.ui.options(sourceContext, new AbortController().signal)
    h.replace(state(source))

    await expect(decoration.ui.onSelect(options[0]!, sourceContext))
      .rejects.toThrow('no longer available')
    expect(h.command).not.toHaveBeenCalled()
  })

  it('constructs only one token for an authoritative Session id', () => {
    expect(sidebandSendLine('session-123')).toBe(
      '/sideband send session:session-123 --last 12 --delivery quiet',
    )
    expect(() => sidebandSendLine('bad id')).toThrow('invalid')
  })
})
