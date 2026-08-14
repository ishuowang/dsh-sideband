/**
 * Sideband's browser half decorates the existing Host `/sideband` command
 * with DSH's native popupSelect shell. It owns no visual surface.
 */
import type { ClientContext, ISessions, SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client';
import type { CommandDecoration, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client';
export declare const SIDEBAND_COMMAND_NAME = "sideband";
export declare const SIDEBAND_LAST_MESSAGES = 12;
export type SidebandClientSessions = Pick<ISessions, 'binding' | 'list' | 'subagentAddress'>;
/** Conservative ordinary-session check over the retained list projection. */
export declare function isOrdinarySession(sessions: SidebandClientSessions, summary: SessionSummary | undefined): summary is SessionSummary;
/** Build target rows from ordinary Sessions only, excluding the source. */
export declare function sidebandSessionOptions(sessions: SidebandClientSessions, sourceSessionId: SessionId): readonly SelectOption[];
/** Exact command submitted through the source Session's command plane. */
export declare function sidebandSendLine(targetSessionId: string): string;
/** Public for focused contract tests; apply() registers this decoration. */
export declare function createSidebandDecoration(sessions: SidebandClientSessions): CommandDecoration;
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map