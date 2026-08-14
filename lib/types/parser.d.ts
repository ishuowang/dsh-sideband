import type { SidebandDelivery, SidebandScope, SidebandTarget } from './types.js';
export type SidebandCommand = {
    readonly kind: 'help';
} | {
    readonly kind: 'send';
    readonly target: SidebandTarget;
    readonly scope: SidebandScope;
    readonly delivery: SidebandDelivery;
    readonly focus?: string;
} | {
    readonly kind: 'status';
    readonly jobId?: string;
} | {
    readonly kind: 'cancel';
    readonly jobId: string;
} | {
    readonly kind: 'targets';
};
export interface ParseOptions {
    readonly defaultLastMessages: number;
    readonly maxLastMessages: number;
    readonly maxFocusChars: number;
    readonly maxTargetChars?: number;
}
export declare class SidebandCommandError extends Error {
    constructor(message: string);
}
/** Small shell-like tokenizer: quotes group a value and backslash escapes the next character. */
export declare function tokenizeSidebandInput(input: string): string[];
export declare function parseSidebandCommand(rawInput: string, options: ParseOptions): SidebandCommand;
//# sourceMappingURL=parser.d.ts.map