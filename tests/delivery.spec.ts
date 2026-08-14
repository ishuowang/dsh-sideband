import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { assertOwnedRoomTarget, deliverSessionMessage, resolveSessionTarget } from '../src/index.js'

function deliveryAgent(id: string): Agent & {
  send: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
} {
  return {
    id: SessionId(id),
    send: vi.fn(),
    followup: vi.fn(),
  } as unknown as Agent & { send: ReturnType<typeof vi.fn>; followup: ReturnType<typeof vi.fn> }
}

describe('Session delivery', () => {
  it('queues quiet recall context without waking, while wakeup uses followup', () => {
    const quiet = deliveryAgent('quiet')
    deliverSessionMessage(quiet, 'capsule', 'quiet')
    expect(quiet.send).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      source: { kind: 'plugin', plugin: 'dsh-sideband', form: 'recall' },
    }), 'next-turn', false)
    expect(quiet.followup).not.toHaveBeenCalled()

    const wakeup = deliveryAgent('wakeup')
    deliverSessionMessage(wakeup, 'capsule', 'wakeup')
    expect(wakeup.followup).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      source: { kind: 'plugin', plugin: 'dsh-sideband', form: 'recall' },
    }))
    expect(wakeup.send).not.toHaveBeenCalled()
  })

  it('falls back to the configured Agent lookup for a cold root Session', async () => {
    const target = deliveryAgent('cold-target')
    const live = new Map<string, Agent>()
    const resolve = vi.fn(async (id: unknown) => {
      expect(String(id)).toBe('cold-target')
      live.set('cold-target', target)
      return target
    })
    const ctx = {
      agents: {
        get: (id: unknown) => live.get(String(id)),
        roots: () => [...live.values()],
      },
      typert: { lookups: { get: (key: string) => key === 'agent' ? { resolve } : undefined } },
    } as unknown as Context

    await expect(resolveSessionTarget(ctx, 'source', 'cold-target')).resolves.toBe(target)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('rejects self and resolver results that are not exact live roots', async () => {
    const child = deliveryAgent('child')
    const ctx = {
      agents: {
        get: (id: unknown) => String(id) === 'child' ? child : undefined,
        roots: () => [],
      },
      typert: { lookups: { get: () => undefined } },
    } as unknown as Context
    await expect(resolveSessionTarget(ctx, 'same', 'same')).rejects.toThrow('itself')
    await expect(resolveSessionTarget(ctx, 'source', 'child')).rejects.toThrow('not a root Session')
  })

  it('accepts only open rooms returned by the source leader ACL', () => {
    const source = deliveryAgent('source')
    const listRooms = vi.fn((agent: Agent) => agent === source
      ? [{ id: 'owned-room', name: 'Owned', status: 'open' }]
      : [])
    const ctx = {
      get: (name: string) => name === 'rooms' ? { listRooms, broadcast: vi.fn() } : undefined,
    } as unknown as Context

    expect(() => assertOwnedRoomTarget(ctx, source, 'owned-room')).not.toThrow()
    expect(() => assertOwnedRoomTarget(ctx, source, 'someone-elses-room')).toThrow('not open and owned')
    expect(listRooms).toHaveBeenCalledWith(source, false)
  })
})
