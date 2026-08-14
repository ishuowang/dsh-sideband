export class SidebandCommandError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SidebandCommandError';
    }
}
/** Small shell-like tokenizer: quotes group a value and backslash escapes the next character. */
export function tokenizeSidebandInput(input) {
    const tokens = [];
    let current = '';
    let quote;
    let escaped = false;
    let started = false;
    for (const character of input.trim()) {
        if (escaped) {
            current += character;
            escaped = false;
            started = true;
            continue;
        }
        if (character === '\\') {
            escaped = true;
            started = true;
            continue;
        }
        if (quote !== undefined) {
            if (character === quote)
                quote = undefined;
            else
                current += character;
            started = true;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            started = true;
            continue;
        }
        if (/\s/u.test(character)) {
            if (started) {
                tokens.push(current);
                current = '';
                started = false;
            }
            continue;
        }
        current += character;
        started = true;
    }
    if (escaped)
        throw new SidebandCommandError('input ends with an unfinished escape');
    if (quote !== undefined)
        throw new SidebandCommandError('input contains an unterminated quote');
    if (started)
        tokens.push(current);
    return tokens;
}
function targetFrom(value, maximum) {
    if (value.length > maximum)
        throw new SidebandCommandError(`target exceeds ${maximum} characters`);
    const separator = value.indexOf(':');
    const kind = value.slice(0, separator);
    const id = value.slice(separator + 1);
    if ((kind !== 'session' && kind !== 'room') || separator <= 0 || id.trim().length === 0) {
        throw new SidebandCommandError('target must be session:<id> or room:<id>');
    }
    if (/\s/u.test(id))
        throw new SidebandCommandError('target id cannot contain whitespace');
    return { kind, id };
}
function flagValue(tokens, index, flag) {
    const token = tokens[index];
    if (token === undefined)
        throw new SidebandCommandError(`missing ${flag} value`);
    const equals = token.indexOf('=');
    if (equals >= 0) {
        const value = token.slice(equals + 1);
        if (value.length === 0)
            throw new SidebandCommandError(`missing ${flag} value`);
        return { value, next: index + 1 };
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new SidebandCommandError(`missing ${flag} value`);
    }
    return { value, next: index + 2 };
}
function parsePositiveCount(value, maximum) {
    if (!/^[1-9][0-9]*$/u.test(value)) {
        throw new SidebandCommandError('--last must be a positive integer');
    }
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count > maximum) {
        throw new SidebandCommandError(`--last must not exceed ${maximum}`);
    }
    return count;
}
function parseSend(tokens, options) {
    const targetToken = tokens[0];
    if (targetToken === undefined)
        throw new SidebandCommandError('send requires a target');
    const target = targetFrom(targetToken, options.maxTargetChars ?? 512);
    let scope = { kind: 'last', count: options.defaultLastMessages };
    let delivery = 'quiet';
    let focus;
    let scopeSeen = false;
    for (let index = 1; index < tokens.length;) {
        const token = tokens[index];
        if (token === '--all' || token === '--full') {
            if (scopeSeen)
                throw new SidebandCommandError('choose only one of --all and --last');
            scope = { kind: 'all' };
            scopeSeen = true;
            index += 1;
            continue;
        }
        if (token === '--last' || token?.startsWith('--last=') === true) {
            if (scopeSeen)
                throw new SidebandCommandError('choose only one of --all and --last');
            const parsed = flagValue(tokens, index, '--last');
            scope = { kind: 'last', count: parsePositiveCount(parsed.value, options.maxLastMessages) };
            scopeSeen = true;
            index = parsed.next;
            continue;
        }
        if (token === '--delivery' || token?.startsWith('--delivery=') === true) {
            const parsed = flagValue(tokens, index, '--delivery');
            if (parsed.value !== 'quiet' && parsed.value !== 'wakeup') {
                throw new SidebandCommandError('--delivery must be quiet or wakeup');
            }
            delivery = parsed.value;
            index = parsed.next;
            continue;
        }
        if (token === '--focus' || token?.startsWith('--focus=') === true) {
            if (focus !== undefined)
                throw new SidebandCommandError('--focus may be supplied only once');
            const parsed = flagValue(tokens, index, '--focus');
            const normalized = parsed.value.trim();
            if (normalized.length === 0)
                throw new SidebandCommandError('--focus cannot be empty');
            if (normalized.length > options.maxFocusChars) {
                throw new SidebandCommandError(`--focus exceeds ${options.maxFocusChars} characters`);
            }
            focus = normalized;
            index = parsed.next;
            continue;
        }
        throw new SidebandCommandError(`unknown option: ${String(token)}`);
    }
    return {
        kind: 'send', target, scope, delivery,
        ...focus === undefined ? {} : { focus },
    };
}
export function parseSidebandCommand(rawInput, options) {
    const tokens = tokenizeSidebandInput(rawInput);
    const verb = tokens[0];
    if (verb === undefined || verb === 'help') {
        if (tokens.length > 1)
            throw new SidebandCommandError('help accepts no arguments');
        return { kind: 'help' };
    }
    if (verb === 'status') {
        if (tokens.length > 2)
            throw new SidebandCommandError('status accepts at most one job id');
        const jobId = tokens[1];
        return { kind: 'status', ...jobId === undefined ? {} : { jobId } };
    }
    if (verb === 'cancel') {
        const jobId = tokens[1];
        if (jobId === undefined || tokens.length !== 2) {
            throw new SidebandCommandError('cancel requires exactly one job id');
        }
        return { kind: 'cancel', jobId };
    }
    if (verb === 'targets') {
        if (tokens.length !== 1)
            throw new SidebandCommandError('targets accepts no arguments');
        return { kind: 'targets' };
    }
    if (verb === 'send')
        return parseSend(tokens.slice(1), options);
    if (verb.startsWith('session:') || verb.startsWith('room:'))
        return parseSend(tokens, options);
    throw new SidebandCommandError(`unknown subcommand: ${verb}`);
}
//# sourceMappingURL=parser.js.map