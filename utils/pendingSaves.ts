/**
 * Tracks each character's sheet saves in flight, so a fresh load can wait for them. When
 * the board swaps layouts, the old sheet editor saves as it unmounts while the new one
 * loads the character; loading after the save keeps that last change.
 */
export function pendingSaves() {
  const pending = new Map<string, Promise<void>>()

  /** Records a save for `id` and returns it unchanged. */
  function track<T>(id: string, save: Promise<T>): Promise<T> {
    const before = pending.get(id) ?? Promise.resolve()
    // Settles once this save and any earlier one have, whether they failed or not.
    const tail = Promise.all([before, save.then(noop, noop)]).then(noop)
    pending.set(id, tail)
    void tail.then(() => {
      if (pending.get(id) === tail) pending.delete(id)
    })
    return save
  }

  /** Resolves once every save tracked for `id` so far has settled; never rejects. */
  function settled(id: string): Promise<void> {
    return pending.get(id) ?? Promise.resolve()
  }

  return { track, settled }
}

function noop() {}

/** The app's one tracker, shared by the sheet editors and the board's character loads. */
export const sheetSaves = pendingSaves()
