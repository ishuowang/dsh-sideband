import type { Message } from '@deepseek-ai/dsh-llm';
export type SidebandTarget = {
    readonly kind: 'session';
    readonly id: string;
} | {
    readonly kind: 'room';
    readonly id: string;
};
export type SidebandScope = {
    readonly kind: 'all';
} | {
    readonly kind: 'last';
    readonly count: number;
};
export type SidebandDelivery = 'quiet' | 'wakeup';
export type SidebandJobState = 'queued' | 'summarizing' | 'delivering' | 'delivered' | 'failed' | 'cancelled';
export interface SnapshotEntry {
    readonly role: Message['role'];
    readonly text: string;
    /** True only for text reconstructed from the source's currently open stream. */
    readonly partial?: true;
}
export interface ConversationSnapshot {
    readonly sourceSessionId: string;
    readonly commandBoundarySeq: number;
    readonly capturedAt: number;
    readonly entries: readonly SnapshotEntry[];
    readonly scope: SidebandScope;
    readonly omittedMessages: number;
    readonly truncated: boolean;
    readonly containsPartial: boolean;
}
export interface SummaryRoute {
    readonly provider: string;
    readonly model: string;
}
export interface SidebandJobView {
    readonly id: string;
    readonly state: SidebandJobState;
    readonly sourceSessionId: string;
    readonly target: SidebandTarget;
    readonly scope: SidebandScope;
    readonly delivery: SidebandDelivery;
    readonly focus?: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly summary?: string;
    readonly error?: string;
}
export interface SidebandJobWork extends SidebandJobView {
    readonly snapshot: ConversationSnapshot;
    readonly route: SummaryRoute;
}
export interface NewSidebandJob {
    readonly sourceSessionId: string;
    readonly target: SidebandTarget;
    readonly scope: SidebandScope;
    readonly delivery: SidebandDelivery;
    readonly focus?: string;
    readonly snapshot: ConversationSnapshot;
    readonly route: SummaryRoute;
}
export interface SidebandTargetInfo {
    readonly target: SidebandTarget;
    readonly label: string;
    readonly status?: string;
}
//# sourceMappingURL=types.d.ts.map