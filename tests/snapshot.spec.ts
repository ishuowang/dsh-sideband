import { CommandId } from '@deepseek-ai/dsh-commands'
import { CallId, createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { captureConversationSnapshot } from '../src/snapshot.js'

function appendUser(session: Session, text: string): void {
  session.append('user/message', createUserMessage({
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  }), { surfaceOp: 'append' })
}

describe('conversation snapshot', () => {
  it('uses the command boundary, keeps visible text, and captures only the current partial attempt', () => {
    const session = Session.create(SessionId('source-session'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    appendUser(session, 'first request')
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        source: { kind: 'model', provider: 'test', model: 'test' },
        content: [
          { type: 'reasoning', text: 'private chain of thought' },
          { type: 'text', text: 'first visible answer' },
          { type: 'tool-call', id: CallId('call-1'), name: 'secret_tool', arguments: '{"secret":true}' },
        ],
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    session.append('turn/start', { turn: 2 })
    session.append('step/start', { turn: 2, step: 1 })
    appendUser(session, 'second request')
    session.append('user/message', createUserMessage({
      source: { kind: 'plugin', plugin: 'workspace-instructions', form: 'instructions' },
      content: [{ type: 'text', text: 'hidden plugin context' }],
    }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      source: { kind: 'tool', callId: CallId('tool-result-source') },
      content: [{ type: 'text', text: 'hidden tool result text' }],
    }), { surfaceOp: 'append' })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'block-start', index: 0, blockType: 'text' },
    })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'discarded failed attempt' },
    })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: {
        type: 'finish',
        reason: { kind: 'error', failure: { code: 'TEST', message: 'retry' } },
      },
    })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'reasoning-delta', index: 1, text: 'new private reasoning' },
    })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'partial before boundary' },
    })
    const commandId = CommandId('cmd-test')
    const boundary = session.append('command/run', {
      commandId,
      name: 'sideband',
      args: ' send session:target',
      source: { kind: 'user' },
    })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: ' after boundary' },
    })

    const snapshot = captureConversationSnapshot({
      session,
      commandId,
      scope: { kind: 'all' },
      maxInputChars: 10_000,
      capturedAt: 123,
    })

    expect(snapshot.commandBoundarySeq).toBe(boundary.seq)
    expect(snapshot.capturedAt).toBe(123)
    expect(snapshot.containsPartial).toBe(true)
    expect(snapshot.entries).toEqual([
      { role: 'user', text: 'first request' },
      { role: 'assistant', text: 'first visible answer' },
      { role: 'user', text: 'second request' },
      { role: 'assistant', text: 'partial before boundary', partial: true },
    ])
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(JSON.stringify(snapshot)).not.toContain('secret_tool')
    expect(JSON.stringify(snapshot)).not.toContain('hidden plugin context')
    expect(JSON.stringify(snapshot)).not.toContain('hidden tool result text')
    expect(JSON.stringify(snapshot)).not.toContain('after boundary')
    expect(JSON.stringify(snapshot)).not.toContain('failed attempt')
  })

  it('applies last-N before a newest-first character bound', () => {
    const session = Session.create(SessionId('bounded-source'))
    session.append('turn/start', { turn: 1 })
    appendUser(session, 'old')
    appendUser(session, '0123456789')
    const commandId = CommandId('cmd-bound')
    session.append('command/run', {
      commandId,
      name: 'sideband',
      source: { kind: 'user' },
    })

    const snapshot = captureConversationSnapshot({
      session,
      commandId,
      scope: { kind: 'last', count: 1 },
      maxInputChars: 5,
    })

    expect(snapshot.entries).toEqual([{ role: 'user', text: '56789' }])
    expect(snapshot.omittedMessages).toBe(1)
    expect(snapshot.truncated).toBe(true)
  })

  it('fails closed if the command lifecycle boundary is unavailable', () => {
    const session = Session.create(SessionId('missing-boundary'))
    expect(() => captureConversationSnapshot({
      session,
      commandId: 'missing',
      scope: { kind: 'last', count: 12 },
      maxInputChars: 100,
    })).toThrow('command/run boundary')
  })
})
