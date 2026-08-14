/**
 * Sideband's browser half decorates the existing Host `/sideband` command
 * with DSH's native popupSelect shell. It owns no visual surface.
 */

import type {
  ClientContext,
  ISessions,
  SessionBinding,
  SessionId,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CommandDecoration,
  CommandUiContract,
  SelectOption,
} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

export const SIDEBAND_COMMAND_NAME = 'sideband'
export const SIDEBAND_LAST_MESSAGES = 12

export type SidebandClientSessions = Pick<ISessions, 'binding' | 'list' | 'subagentAddress'>

/** Conservative ordinary-session check over the retained list projection. */
export function isOrdinarySession(
  sessions: SidebandClientSessions,
  summary: SessionSummary | undefined,
): summary is SessionSummary {
  return summary !== undefined
    && summary.origin !== 'subagent'
    && sessions.subagentAddress(summary.id) === undefined
}

/** Build target rows from ordinary Sessions only, excluding the source. */
export function sidebandSessionOptions(
  sessions: SidebandClientSessions,
  sourceSessionId: SessionId,
): readonly SelectOption[] {
  const state = sessions.list.getSnapshot()
  const options: SelectOption[] = []

  for (const id of state.ids) {
    if (id === sourceSessionId) continue
    const summary = state.byId[id]
    if (!isOrdinarySession(sessions, summary)) continue
    // Blank drafts are not durable handoff destinations yet and make the
    // native picker noisy; the source itself may still be a blank draft.
    if (summary.blank) continue
    options.push({
      id: String(summary.id),
      label: summary.displayTitle,
      detail: [
        summary.running ? 'Running' : 'Idle',
        String(summary.id),
      ].join(' · '),
    })
  }

  return options
}

/** Exact command submitted through the source Session's command plane. */
export function sidebandSendLine(targetSessionId: string): string {
  if (targetSessionId.length === 0 || /\s/u.test(targetSessionId)) {
    throw new Error('Sideband target Session id is invalid')
  }
  return `/sideband send session:${targetSessionId} --last ${SIDEBAND_LAST_MESSAGES} --delivery quiet`
}

function sourceBinding(
  sessions: SidebandClientSessions,
  source: ClientSessionContext,
): SessionBinding | undefined {
  const summary = sessions.list.getSnapshot().byId[source.sessionId]
  if (!isOrdinarySession(sessions, summary)) return undefined
  return sessions.binding(source.sessionId)
}

/** Public for focused contract tests; apply() registers this decoration. */
export function createSidebandDecoration(
  sessions: SidebandClientSessions,
): CommandDecoration {
  return {
    name: SIDEBAND_COMMAND_NAME,
    available: source => sourceBinding(sessions, source) !== undefined,
    ui: {
      kind: 'popupSelect',
      options: (source, signal) => {
        signal.throwIfAborted()
        return Promise.resolve(sidebandSessionOptions(sessions, source.sessionId))
      },
      onSelect: async (option, source) => {
        const binding = sourceBinding(sessions, source)
        if (binding === undefined) {
          throw new Error('The source Session is no longer an ordinary live Session')
        }
        const targetStillEligible = sidebandSessionOptions(sessions, source.sessionId)
          .some(candidate => candidate.id === option.id)
        if (!targetStillEligible) {
          throw new Error('The selected target Session is no longer available')
        }

        const result = await binding.session.command(sidebandSendLine(option.id))
        if (!result.ok) {
          throw new Error(`Sideband dispatch failed: ${result.error.code}: ${result.error.message}`)
        }
        if (!result.value.matched) {
          throw new Error('This Host does not offer the /sideband command')
        }
      },
    },
  }
}

export const inject = ['commandUi', 'sessions']

export function apply(ctx: ClientContext): void {
  const commandUi = ctx.get('commandUi') as CommandUiContract
  const sessions = ctx.get('sessions') as unknown as SidebandClientSessions
  ctx.effect(
    () => commandUi.decorate(createSidebandDecoration(sessions)),
    'sideband: /sideband popupSelect decoration',
  )
}
