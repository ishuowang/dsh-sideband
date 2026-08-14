import { describe, expect, it } from 'vitest'
import {
  parseSidebandCommand,
  SidebandCommandError,
  tokenizeSidebandInput,
} from '../src/parser.js'

const options = {
  defaultLastMessages: 12,
  maxLastMessages: 100,
  maxFocusChars: 80,
}

describe('Sideband command parser', () => {
  it('uses a bounded last-12 and quiet Session delivery by default', () => {
    expect(parseSidebandCommand('send session:target-1', options)).toEqual({
      kind: 'send',
      target: { kind: 'session', id: 'target-1' },
      scope: { kind: 'last', count: 12 },
      delivery: 'quiet',
    })
  })

  it('supports the short target form, all-history opt-in, focus quoting, and wakeup', () => {
    expect(parseSidebandCommand(
      'session:target-2 --all --focus "decisions and unresolved risks" --delivery=wakeup',
      options,
    )).toEqual({
      kind: 'send',
      target: { kind: 'session', id: 'target-2' },
      scope: { kind: 'all' },
      delivery: 'wakeup',
      focus: 'decisions and unresolved risks',
    })
    expect(parseSidebandCommand('send room:room-1 --full', options)).toMatchObject({
      target: { kind: 'room', id: 'room-1' },
      scope: { kind: 'all' },
    })
  })

  it('parses status, cancel, and targets without accepting trailing input', () => {
    expect(parseSidebandCommand('status', options)).toEqual({ kind: 'status' })
    expect(parseSidebandCommand('status sb-1', options)).toEqual({ kind: 'status', jobId: 'sb-1' })
    expect(parseSidebandCommand('cancel sb-1', options)).toEqual({ kind: 'cancel', jobId: 'sb-1' })
    expect(parseSidebandCommand('targets', options)).toEqual({ kind: 'targets' })
    expect(() => parseSidebandCommand('targets extra', options)).toThrow(SidebandCommandError)
  })

  it('handles quoting and rejects unsafe or ambiguous inputs', () => {
    expect(tokenizeSidebandInput("send session:x --focus 'one two'")).toEqual([
      'send', 'session:x', '--focus', 'one two',
    ])
    expect(() => tokenizeSidebandInput('send session:x --focus "open')).toThrow('unterminated quote')
    expect(() => parseSidebandCommand('send self:x', options)).toThrow('target must be')
    expect(() => parseSidebandCommand('send session:x --last 0', options)).toThrow('positive integer')
    expect(() => parseSidebandCommand('send session:x --last 101', options)).toThrow('must not exceed 100')
    expect(() => parseSidebandCommand('send session:x --all --last 2', options)).toThrow('choose only one')
    expect(() => parseSidebandCommand('send session:x --delivery now', options)).toThrow('quiet or wakeup')
  })
})
