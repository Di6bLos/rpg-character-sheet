/**
 * Which panel or row made the last result, so it shows where it was made (Nimble and PF2e
 * sheets): `claim` runs a roll under a key, `resultFor` / `resultIn` give it back there, and
 * `unclaimed` is any other result.
 */
export function useResultOwner() {
  const { draft, lastRoll } = useSheet()
  const owner = useState(`result-owner-${draft.value.id}`, () => ({ key: '', message: '' }))
  const claimed = computed(() => !!owner.value.key && owner.value.message === lastRoll.value)

  function claim(key: string, run: () => void) {
    run()
    owner.value = { key, message: lastRoll.value }
  }

  function resultFor(key: string): string {
    return claimed.value && owner.value.key === key ? lastRoll.value : ''
  }

  function resultIn(prefix: string): string {
    return claimed.value && owner.value.key.startsWith(prefix) ? lastRoll.value : ''
  }

  const unclaimed = computed(() => (claimed.value ? '' : lastRoll.value))

  return { claim, resultFor, resultIn, unclaimed }
}
