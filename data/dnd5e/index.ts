// Loads the generated 5e data (`generated/*.json`, typed in `./types`). Each set ships as its
// own static file and is fetched the first time something asks for it, so the spells and magic
// items never weigh down the app bundle. Licensing: `./NOTICE.md` (SRD 5.2.1 text, plus the
// Player's Handbook 2024 and Forge of the Artificer options as mechanics and summaries only).
import armorUrl from './generated/armor.json?url'
import backgroundsUrl from './generated/backgrounds.json?url'
import classesUrl from './generated/classes.json?url'
import conditionsUrl from './generated/conditions.json?url'
import featsUrl from './generated/feats.json?url'
import gearUrl from './generated/gear.json?url'
import magicItemsUrl from './generated/magicItems.json?url'
import masteriesUrl from './generated/masteries.json?url'
import optionsUrl from './generated/options.json?url'
import speciesUrl from './generated/species.json?url'
import spellsUrl from './generated/spells.json?url'
import subclassesUrl from './generated/subclasses.json?url'
import weaponsUrl from './generated/weapons.json?url'
import type {
  Dnd5eArmorDef,
  Dnd5eBackgroundDef,
  Dnd5eClassDef,
  Dnd5eConditionDef,
  Dnd5eFeatDef,
  Dnd5eGearDef,
  Dnd5eMagicItemDef,
  Dnd5eMasteryDef,
  Dnd5eOptionGroup,
  Dnd5eSpeciesDef,
  Dnd5eSpellDef,
  Dnd5eSubclassDef,
  Dnd5eWeaponDef,
} from './types'

export interface Dnd5eData {
  armor: Dnd5eArmorDef[]
  backgrounds: Dnd5eBackgroundDef[]
  classes: Dnd5eClassDef[]
  conditions: Dnd5eConditionDef[]
  feats: Dnd5eFeatDef[]
  gear: Dnd5eGearDef[]
  magicItems: Dnd5eMagicItemDef[]
  masteries: Dnd5eMasteryDef[]
  /** Invocations, metamagic, maneuvers and artificer plans, one group each. */
  options: Dnd5eOptionGroup[]
  species: Dnd5eSpeciesDef[]
  spells: Dnd5eSpellDef[]
  subclasses: Dnd5eSubclassDef[]
  weapons: Dnd5eWeaponDef[]
}

const URLS: Record<keyof Dnd5eData, string> = {
  armor: armorUrl,
  backgrounds: backgroundsUrl,
  classes: classesUrl,
  conditions: conditionsUrl,
  feats: featsUrl,
  gear: gearUrl,
  magicItems: magicItemsUrl,
  masteries: masteriesUrl,
  options: optionsUrl,
  species: speciesUrl,
  spells: spellsUrl,
  subclasses: subclassesUrl,
  weapons: weaponsUrl,
}

const cache = new Map<keyof Dnd5eData, Promise<unknown>>()

/** One data set, fetched once per page load; a failed fetch rejects and is retried next call. */
export function loadDnd5e<K extends keyof Dnd5eData>(set: K): Promise<Dnd5eData[K]> {
  let pending = cache.get(set)
  if (!pending) {
    pending = fetch(URLS[set]).then((r) => {
      if (!r.ok) throw new Error(`5e ${set} data: HTTP ${r.status}`)
      return r.json()
    })
    pending.catch(() => cache.delete(set))
    cache.set(set, pending)
  }
  return pending as Promise<Dnd5eData[K]>
}
