import { describe, expect, it } from 'vitest'
import { pendingSaves } from '../utils/pendingSaves'

function deferred() {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('pendingSaves', () => {
  it('settles at once when nothing is saving', async () => {
    const saves = pendingSaves()
    let done = false
    void saves.settled('hero').then(() => (done = true))
    await flush()
    expect(done).toBe(true)
  })

  it('makes a load wait for the save the old editor started as it unmounted', async () => {
    const saves = pendingSaves()
    const write = deferred()
    const order: string[] = []
    void saves.track(
      'hero',
      write.promise.then(() => order.push('saved')),
    )
    const load = saves.settled('hero').then(() => order.push('loaded'))
    await flush()
    expect(order).toEqual([])
    write.resolve()
    await load
    expect(order).toEqual(['saved', 'loaded'])
  })

  it('waits for every save tracked so far, and settles even when one fails', async () => {
    const saves = pendingSaves()
    const first = deferred()
    const second = deferred()
    const tracked = saves.track('hero', first.promise)
    void saves.track('hero', second.promise)
    let done = false
    void saves.settled('hero').then(() => (done = true))
    second.resolve()
    await flush()
    expect(done).toBe(false)
    first.reject(new Error('offline'))
    await expect(tracked).rejects.toThrow('offline')
    await flush()
    expect(done).toBe(true)
  })

  it('keeps characters apart', async () => {
    const saves = pendingSaves()
    const write = deferred()
    void saves.track('hero', write.promise)
    let other = false
    void saves.settled('rival').then(() => (other = true))
    await flush()
    expect(other).toBe(true)
    write.resolve()
  })
})
