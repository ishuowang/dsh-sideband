import type { CommandId } from '@deepseek-ai/dsh-commands';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { ConversationSnapshot, SidebandScope } from './types.js';
export interface CaptureSnapshotOptions {
    readonly session: Session;
    readonly commandId: CommandId | string;
    readonly scope: SidebandScope;
    readonly maxInputChars: number;
    readonly capturedAt?: number;
}
/** Reconstruct text from the currently open assistant stream, if one exists. */
export declare function openAssistantText(events: readonly SessionEvent[]): string;
export declare function captureConversationSnapshot(options: CaptureSnapshotOptions): ConversationSnapshot;
//# sourceMappingURL=snapshot.d.ts.map