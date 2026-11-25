import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import type { GameSystem } from '~/types'
import { DND5E_CONDITIONS, PF2E_CONDITIONS } from '~/utils/sheetDefaults'
import { SPELL_STATUSES } from '~/utils/nimbleConditions'

/** What the battle board offers for a campaign's game system. */
export interface BattleFeatures {
  /** The sheet-editor hero column, action tiles and turn steps (HeroScope). */
  nimbleHero: boolean
  /** Action pips on cards. */
  pips: boolean
  /** Sync summons and summon tokens. */
  summons: boolean
  /** The GM's Nimble / classic initiative switch. */
  initiativeModes: boolean
  /** The GM's HP and condition controls on a hero (every system; each applies its own rules). */
  gmHeroControls: boolean
  /** PF2e hero and focus points on the GM's party cards and hero vitals (Nimble shows mana). */
  gmPoints: boolean
}

/**
 * Nimble's features (the hero editor, pips, summons, initiative modes); the GM's hero controls
 * for every system; PF2e's points. 5e and PF2e otherwise get the plain board.
 */
export function battleFeatures(system: GameSystem): BattleFeatures {
  const on = system === 'nimble'
  return {
    nimbleHero: on,
    pips: on,
    summons: on,
    initiativeModes: on,
    gmHeroControls: true,
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
  if (system === 'pf2e') return [...PF2E_CONDITIONS]
  return [...CONDITIONS, ...SPELL_STATUSES]
    .filter((x) => !AUTO_CONDITIONS.includes(x.name) && x.name !== 'Helped')
    .map((x) => x.name)
}
