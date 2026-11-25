// Loads the generated Pathfinder 2e data (`generated/*.json`, typed in `./types`). Each set
// ships as its own static file and is fetched the first time something asks for it, so the
// feats and spells never weigh down the app bundle. Licensing: `./NOTICE.md`.
import actionsUrl from './generated/actions.json?url'
import ancestriesUrl from './generated/ancestries.json?url'
import armorUrl from './generated/armor.json?url'
import backgroundsUrl from './generated/backgrounds.json?url'
import classesUrl from './generated/classes.json?url'
import conditionsUrl from './generated/conditions.json?url'
import deitiesUrl from './generated/deities.json?url'
import featsUrl from './generated/feats.json?url'
import heritagesUrl from './generated/heritages.json?url'
import shieldsUrl from './generated/shields.json?url'
import spellsUrl from './generated/spells.json?url'
import traitsUrl from './generated/traits.json?url'
import weaponsUrl from './generated/weapons.json?url'
import type {
  Pf2eActionDef,
  Pf2eAncestryDef,
  Pf2eArmorDef,
  Pf2eBackgroundDef,
  Pf2eClassDef,
  Pf2eConditionDef,
  Pf2eDeityDef,
  Pf2eFeatDef,
  Pf2eHeritageDef,
  Pf2eShieldDef,
  Pf2eSpellDef,
  Pf2eTraitDef,
  Pf2eWeaponDef,
} from './types'

export interface Pf2eData {
  actions: Pf2eActionDef[]
  ancestries: Pf2eAncestryDef[]
  armor: Pf2eArmorDef[]
  backgrounds: Pf2eBackgroundDef[]
  classes: Pf2eClassDef[]
  conditions: Pf2eConditionDef[]
  deities: Pf2eDeityDef[]
  feats: Pf2eFeatDef[]
  heritages: Pf2eHeritageDef[]
  shields: Pf2eShieldDef[]
  spells: Pf2eSpellDef[]
  traits: Pf2eTraitDef[]
  weapons: Pf2eWeaponDef[]
}

const URLS: Record<keyof Pf2eData, string> = {
  actions: actionsUrl,
  ancestries: ancestriesUrl,
  armor: armorUrl,
  backgrounds: backgroundsUrl,
  classes: classesUrl,
  conditions: conditionsUrl,
  deities: deitiesUrl,
  feats: featsUrl,
  heritages: heritagesUrl,
  shields: shieldsUrl,
  spells: spellsUrl,
  traits: traitsUrl,
  weapons: weaponsUrl,
}

const cache = new Map<keyof Pf2eData, Promise<unknown>>()

/** One data set, fetched once per page load; a failed fetch rejects and is retried next call. */
export function loadPf2e<K extends keyof Pf2eData>(set: K): Promise<Pf2eData[K]> {
  let pending = cache.get(set)
  if (!pending) {
    pending = fetch(URLS[set]).then((r) => {
      if (!r.ok) throw new Error(`PF2e ${set} data: HTTP ${r.status}`)
      return r.json()
    })
    pending.catch(() => cache.delete(set))
    cache.set(set, pending)
  }
  return pending as Promise<Pf2eData[K]>
}
