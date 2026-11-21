import { describe, expect, it } from 'vitest'
import { keyedQueue } from '../utils/keyedQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('keyedQueue', () => {
  it('runs every task for one key, one at a time, in call order', async () => {
    const q = keyedQueue()
    const sent: number[] = []
    let running = 0
    let most = 0
    const gate = deferred()
    const send = (n: number) =>
      q.run('hero', async () => {
        running++
        most = Math.max(most, running)
        if (n === -1 && sent.length === 0) await gate.promise
        sent.push(n)
        running--
      })
    // Three quick −1 clicks while the first is still in flight: none are dropped.
    const all = Promise.all([send(-1), send(-1), send(-1)])
    expect(q.busy('hero')).toBe(true)
    gate.resolve()
    await all
    expect(sent).toEqual([-1, -1, -1])
    expect(sent.reduce((a, b) => a + b, 0)).toBe(-3)
    expect(most).toBe(1)
    await Promise.resolve()
    expect(q.busy('hero')).toBe(false)
  })

  it('keeps going after a failed task and passes the failure to its caller', async () => {
    const q = keyedQueue()
    const order: string[] = []
    const failed = q.run('hero', async () => {
      order.push('a')
      throw new Error('nope')
    })
    const next = q.run('hero', async () => {
      order.push('b')
      return 2
    })
    await expect(failed).rejects.toThrow('nope')
    await expect(next).resolves.toBe(2)
    expect(order).toEqual(['a', 'b'])
  })

  it('does not hold one key behind another', async () => {
    const q = keyedQueue()
    const gate = deferred()
    const order: string[] = []
    const slow = q.run('a', async () => {
      await gate.promise
      order.push('a')
    })
    await q.run('b', async () => {
      order.push('b')
    })
    gate.resolve()
    await slow
    expect(order).toEqual(['b', 'a'])
  })
})
