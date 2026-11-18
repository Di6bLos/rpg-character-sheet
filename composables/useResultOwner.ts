import type { NimbleSheet } from '~/types/sheets'

export function useResultOwner() {
  const { draft, lastRoll } = useSheet<NimbleSheet>()
  const owner = useState(`nimble-result-owner-${draft.value.id}`, () => ({ key: '', message: '' }))
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
