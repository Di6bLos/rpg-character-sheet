import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import type { GameSystem } from '~/types'
import { DND5E_CONDITIONS } from '~/utils/sheetDefaults'
import { PF2E_CONDITION_DEFS } from '~/utils/pf2ePlay'
import { SPELL_STATUSES } from '~/utils/nimbleConditions'

/** What the battle board offers for a campaign's game system. */
export interface BattleFeatures {
  /** The sheet-editor hero column, action tiles and turn steps (HeroScope): Nimble and 5e. */
  heroEditor: boolean
  /** Nimble's own hero rules on the board (Armor, Wounds, mana, condition ends). */
  nimbleHero: boolean
  /** Action pips on cards. */
  pips: boolean
  /** Sync summons and summon tokens. */
  summons: boolean
  /** The GM's Nimble / classic initiative switch. */
  initiativeModes: boolean
  /** PF2e hero and focus points on the GM's party cards and hero vitals (Nimble shows mana). */
  gmPoints: boolean
}

/**
 * Nimble's features (pips, summons, initiative modes) and PF2e's points; the hero editor for
 * Nimble and 5e; PF2e otherwise gets the plain board (HeroBasic, TurnBasic). The GM's HP and condition controls on a hero are
 * on for every system (each sheet applies them with its own rules), so they have no flag.
 */
export function battleFeatures(system: GameSystem): BattleFeatures {
  const on = system === 'nimble'
  return {
    heroEditor: on || system === 'dnd5e',
    nimbleHero: on,
    pips: on,
    summons: on,
    initiativeModes: on,
    gmPoints: system === 'pf2e',
  }
}

/**
 * The condition names the board's picker offers for a system. Nimble: the core conditions and
 * spell statuses, minus the ones HP shows (Bloodied, Dying, Wounded) and Helped (an ally's
 * Help sets it).
 */
export function conditionNames(system: GameSystem): string[] {
  if (system === 'dnd5e') return [...DND5E_CONDITIONS]
  if (system === 'pf2e') return PF2E_CONDITION_DEFS.map((d) => d.name)
  return [...CONDITIONS, ...SPELL_STATUSES]
    .filter((x) => !AUTO_CONDITIONS.includes(x.name) && x.name !== 'Helped')
    .map((x) => x.name)
}
