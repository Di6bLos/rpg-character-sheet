/**
 * Runs async tasks one at a time per key, in call order. Quick clicks then all land, in
 * order, instead of the later ones being dropped while the first is in flight.
 */
export function keyedQueue() {
  const tails = new Map<string, Promise<void>>()

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(task)
    // The tail never rejects, so one failed task doesn't block the ones after it.
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    tails.set(key, tail)
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return result
  }

  /** True while a task for `key` is queued or running. */
  function busy(key: string): boolean {
    return tails.has(key)
  }

  return { run, busy }
}
