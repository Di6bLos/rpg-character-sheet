import type { NimbleStat } from '~/types/sheets'
import type { ChoiceDef, StatIncrease } from '../types'

export const ALL_STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']

export function inc(...stats: NimbleStat[]): StatIncrease {
  return { stats, count: 1 }
}

/** Level 20 capstone: +1 to any 2 of your stats. */
export const CAPSTONE_STATS: StatIncrease = { stats: ALL_STATS, count: 2 }

export const EPIC_BOON: ChoiceDef = {
  id: 'epic-boon',
  label: 'Choose an Epic Boon (see pg. 23 of the GM’s Guide)',
  count: 1,
  source: { kind: 'text', name: 'Epic Boon', placeholder: 'Epic Boon name and what it does' },
}

export const UPGRADED_CANTRIPS = 'Upgraded Cantrips: your cantrips grow stronger.'

export function tierNote(tier: number): string {
  return `Tier ${tier} spells: you may now cast tier ${tier} spells and upcast spells at tier ${tier}.`
}

/** Shadowmancers always cast at their highest tier. */
export function pactTierNote(tier: number): string {
  return `Tier ${tier} spells: you may now cast tier ${tier} spells; all of your spells are cast at this tier.`
}

export function poolChoice(id: string, label: string, pools: string[], count = 1): ChoiceDef {
  return { id, label, count, source: { kind: 'pool', pools } }
}
