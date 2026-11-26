// Library → Feats, Backgrounds and Species: each tab's list for a game system, built once per
// page load from its data (utils/libraryOrigins.ts). PF2e and 5e data are fetched the first
// time a list needs them; a failed fetch is retried on the next call.
import { loadDnd5e } from '~/data/dnd5e'
import { ANCESTRIES } from '~/data/nimble/ancestries'
import { BACKGROUNDS } from '~/data/nimble/backgrounds'
import { loadPf2e } from '~/data/pf2e'
import type { GameSystem } from '~/types'
import type { EntryList, EntryTab } from '~/utils/libraryEntries'
import {
  dnd5eBackgroundList,
  dnd5eFeatList,
  dnd5eSpeciesList,
  nimbleAncestryList,
  nimbleBackgroundList,
  pf2eAncestryList,
  pf2eBackgroundList,
  pf2eFeatList,
} from '~/utils/libraryOrigins'

/** How each tab builds its list per system; `ENTRY_SYSTEMS` names the same systems. */
const BUILDERS: Record<EntryTab, Partial<Record<GameSystem, () => Promise<EntryList>>>> = {
  feats: {
    pf2e: async () => pf2eFeatList(await loadPf2e('feats')),
    dnd5e: async () => dnd5eFeatList(await loadDnd5e('feats')),
  },
  backgrounds: {
    nimble: async () => nimbleBackgroundList(BACKGROUNDS),
    pf2e: async () => pf2eBackgroundList(await loadPf2e('backgrounds')),
    dnd5e: async () => {
      const [backgrounds, feats] = await Promise.all([loadDnd5e('backgrounds'), loadDnd5e('feats')])
      return dnd5eBackgroundList(backgrounds, feats)
    },
  },
  species: {
    nimble: async () => nimbleAncestryList(ANCESTRIES),
    pf2e: async () => {
      const [ancestries, heritages] = await Promise.all([
        loadPf2e('ancestries'),
        loadPf2e('heritages'),
      ])
      return pf2eAncestryList(ancestries, heritages)
    },
    dnd5e: async () => dnd5eSpeciesList(await loadDnd5e('species')),
  },
}

const built = new Map<string, EntryList>()

/** The list for a tab and system: null while it loads, and why it failed if it did. */
export function useLibraryEntries(tab: EntryTab, system: Ref<GameSystem | undefined>) {
  const list = shallowRef<EntryList | null>(null)
  const failed = ref('')
  let run = 0
  async function load() {
    const id = system.value
    const key = `${tab}:${id}`
    const build = id ? BUILDERS[tab][id] : undefined
    const mine = ++run
    failed.value = ''
    list.value = built.get(key) ?? null
    if (list.value || !build) return
    try {
      const made = await build()
      built.set(key, made)
      if (mine === run) list.value = made
    } catch (err) {
      console.error(err)
      if (mine === run) failed.value = 'Could not load this list.'
    }
  }
  watch(system, load, { immediate: true })
  return { list, failed, retry: load }
}
