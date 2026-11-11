import type { ClassDef, SubclassDef } from '../types'
import { berserker } from './berserker'
import { cheat } from './cheat'
import { commander } from './commander'
import { hunter } from './hunter'
import { mage } from './mage'
import { oathsworn } from './oathsworn'
import { shadowmancer } from './shadowmancer'
import { shepherd } from './shepherd'
import { songweaver } from './songweaver'
import { stormshifter } from './stormshifter'
import { zephyr } from './zephyr'

/** In the order the Heroes book lists them. */
export const NIMBLE_CLASSES: ClassDef[] = [
  berserker,
  cheat,
  commander,
  hunter,
  mage,
  oathsworn,
  shadowmancer,
  shepherd,
  songweaver,
  stormshifter,
  zephyr,
]

export function classBySlug(slug: string): ClassDef | undefined {
  return NIMBLE_CLASSES.find((c) => c.slug === slug)
}

/** Max Wounds a picked pool option adds (Mighty Endurance: +4); 0 when it adds none. */
export function poolOptionWounds(cls: ClassDef, name: string): number {
  for (const pool of cls.pools) {
    const option = pool.options.find((o) => o.name === name)
    if (option) return option.woundsMax ?? 0
  }
  return 0
}

export function subclassBySlug(cls: ClassDef, slug: string): SubclassDef | undefined {
  return cls.subclasses.find((s) => s.slug === slug)
}
