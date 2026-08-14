import type { Message } from '@deepseek-ai/dsh-llm'
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import type { ConversationSnapshot, SidebandScope, SnapshotEntry } from './types.js'

export interface CaptureSnapshotOptions {
  readonly session: Session
  readonly commandId: CommandId | string
  readonly scope: SidebandScope
  readonly maxInputChars: number
  readonly capturedAt?: number
}

function commandBoundary(events: readonly SessionEvent[], commandId: CommandId | string): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'command/run' && String(event.data.commandId) === String(commandId)) return event.seq
  }
  throw new Error(`sideband: command/run boundary ${String(commandId)} is missing`)
}

function visibleText(message: Message): string {
  return message.content
    .filter((block): block is Extract<(typeof message.content)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function isHumanOrModelMessage(message: Message): boolean {
  return (message.role === 'user' && message.source.kind === 'user')
    || (message.role === 'assistant' && message.source.kind === 'model')
}

function visibleEntries(messages: readonly Message[]): SnapshotEntry[] {
  const entries: SnapshotEntry[] = []
  for (const message of messages) {
    // v0.1 transfers human/model-visible dialogue only. Tool output and
    // plugin-injected context (instructions, prior recalls, notices, etc.)
    // must not silently propagate into another security/context boundary.
    if (!isHumanOrModelMessage(message)) continue
    const text = visibleText(message)
    if (text.length > 0) entries.push({ role: message.role, text })
  }
  return entries
}

/** Reconstruct text from the currently open assistant stream, if one exists. */
export function openAssistantText(events: readonly SessionEvent[]): string {
  let openTurn: number | undefined
  let openStep: { turn: number; step: number; startIndex: number } | undefined
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined) continue
    if (event.type === 'turn/start') openTurn = event.data.turn
    else if (event.type === 'turn/end' && event.data.turn === openTurn) {
      openTurn = undefined
      openStep = undefined
    } else if (event.type === 'step/start' && event.data.turn === openTurn) {
      openStep = { turn: event.data.turn, step: event.data.step, startIndex: index + 1 }
    } else if (event.type === 'step/end'
      && openStep !== undefined
      && event.data.turn === openStep.turn
      && event.data.step === openStep.step) {
      openStep = undefined
    }
  }
  if (openStep === undefined) return ''

  const stepEvents = events.slice(openStep.startIndex).filter(event => {
    if (event.type === 'assistant/chunk' || event.type === 'assistant/message') {
      return event.data.turn === openStep.turn && event.data.step === openStep.step
    }
    return false
  })
  // Once an assembled assistant message exists, its visible text is already in the surface snapshot.
  if (stepEvents.some(event => event.type === 'assistant/message')) return ''

  let attemptStart = 0
  for (let index = 0; index < stepEvents.length; index += 1) {
    const event = stepEvents[index]
    if (event?.type !== 'assistant/chunk' || event.data.chunk.type !== 'finish') continue
    const reason = event.data.chunk.reason.kind
    if (reason === 'error' || reason === 'aborted') attemptStart = index + 1
  }

  const blocks = new Map<number, { order: number; text: string; kind?: string }>()
  let order = 0
  for (const event of stepEvents.slice(attemptStart)) {
    if (event.type !== 'assistant/chunk') continue
    const chunk = event.data.chunk
    if (chunk.type === 'block-start') {
      if (!blocks.has(chunk.index)) blocks.set(chunk.index, { order: order++, text: '', kind: chunk.blockType })
    } else if (chunk.type === 'text-delta') {
      const block = blocks.get(chunk.index) ?? { order: order++, text: '', kind: 'text' }
      if (block.kind === undefined || block.kind === 'text') block.text += chunk.text
      blocks.set(chunk.index, block)
    } else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
      const block = blocks.get(chunk.index) ?? { order: order++, text: '', kind: 'text' }
      block.kind = 'text'
      block.text = chunk.block.text
      blocks.set(chunk.index, block)
    }
  }
  return [...blocks.values()]
    .filter(block => block.kind === 'text' && block.text.length > 0)
    .sort((left, right) => left.order - right.order)
    .map(block => block.text)
    .join('')
    .trim()
}

function prefixMessages(session: Session, events: readonly SessionEvent[], boundarySeq: number): Message[] {
  if (events.at(-1)?.seq === boundarySeq) return session.deriveMessages()
  const prefix = events.slice(0, boundarySeq + 1)
  return foldSurface(prefix).nodes
    .map(seq => prefix[seq])
    .filter((event): event is SessionEvent => event !== undefined)
    .map(event => session.deriveEventMessage(event))
    .filter((message): message is Message => message !== null)
}

function applyScope(entries: readonly SnapshotEntry[], scope: SidebandScope): SnapshotEntry[] {
  return scope.kind === 'all' ? [...entries] : entries.slice(-scope.count)
}

function boundEntries(entries: readonly SnapshotEntry[], maximum: number): {
  entries: SnapshotEntry[]
  omitted: number
  truncated: boolean
} {
  const selected: SnapshotEntry[] = []
  let remaining = maximum
  let truncated = false
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    if (entry.text.length <= remaining) {
      selected.push(entry)
      remaining -= entry.text.length
      continue
    }
    if (remaining > 0) {
      selected.push({
        role: entry.role,
        text: entry.text.slice(-remaining),
        ...entry.partial === true ? { partial: true as const } : {},
      })
    }
    truncated = true
    break
  }
  selected.reverse()
  return {
    entries: selected,
    omitted: entries.length - selected.length,
    truncated,
  }
}

export function captureConversationSnapshot(options: CaptureSnapshotOptions): ConversationSnapshot {
  if (!Number.isSafeInteger(options.maxInputChars) || options.maxInputChars <= 0) {
    throw new Error('sideband: maxInputChars must be a positive safe integer')
  }
  const events = options.session.events
  const boundarySeq = commandBoundary(events, options.commandId)
  const prefix = events.slice(0, boundarySeq + 1)
  const entries = visibleEntries(prefixMessages(options.session, events, boundarySeq))
  const partialText = openAssistantText(prefix)
  if (partialText.length > 0) entries.push({ role: 'assistant', text: partialText, partial: true })
  const scoped = applyScope(entries, options.scope)
  const bounded = boundEntries(scoped, options.maxInputChars)
  const scopeOmitted = entries.length - scoped.length
  const omittedMessages = scopeOmitted + bounded.omitted
  return Object.freeze({
    sourceSessionId: String(options.session.id),
    commandBoundarySeq: boundarySeq,
    capturedAt: options.capturedAt ?? Date.now(),
    entries: Object.freeze(bounded.entries.map(entry => Object.freeze({ ...entry }))),
    scope: options.scope,
    omittedMessages,
    truncated: omittedMessages > 0 || bounded.truncated,
    containsPartial: bounded.entries.some(entry => entry.partial === true),
  })
}
