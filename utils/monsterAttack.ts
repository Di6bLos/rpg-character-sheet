import type { StatBlock, StatEntry } from '~/types'

/**
 * How a Nimble stat block entry's dice roll on the GM's Roll button.
 *
 * - `attack`: a normal attack. A 1 on the Primary Die misses; its max is a crit that
 *   rolls again and keeps exploding (Core Rules p. 12, "Attack" and "Exploding Critical
 *   Hits": "Any spell or ability that can harm an enemy counts as an attack").
 * - `nocrit`: still misses on a 1 but never crits: flunkies ("like regular monsters, but
 *   … they can't crit") and minions ("cannot crit, and misses on a roll of 1"), GM's
 *   Guide p. 24.
 * - `plain`: just the dice: traits, saves ("DC 12 DEX save"), area damage, heals, and
 *   anything that says it doesn't miss (BEEES! "5d4 damage (doesn't miss)").
 */
export type MonsterRollKind = 'attack' | 'nocrit' | 'plain'

/** Sections whose entries are never attack rolls. */
const PASSIVE_SECTIONS = /^(traits?|notes?)$/i
/** Text that rolls without a miss or crit: saves, areas, healing, never-miss attacks. */
const PLAIN_TEXT =
  /\b(doesn[’']?t|does not|can[’']?t|cannot|never) miss\b|\bsave\b|\bheals?\b|\bregains?\b|\btemp(orary)? hp\b|\barea\b|\bcone\b/i
const MINION = /\bminion\b/i
const FLUNKY = /\bflunk(y|ies)\b/i

function isNoCrit(block: StatBlock | null | undefined, entry: StatEntry): boolean {
  // "1d6 (follows minion rules)": the entry itself says so.
  if (/\bminion rules\b/i.test(entry.t)) return true
  if (!block) return false
  if ((block.top ?? []).some(([k, v]) => /^hp$/i.test(k) && MINION.test(v))) return true
  return (block.sections ?? []).some(
    (s) =>
      PASSIVE_SECTIONS.test(s.title.trim()) &&
      s.items.some((it) => MINION.test(it.n) || FLUNKY.test(it.n)),
  )
}

export function monsterRollKind(
  sectionTitle: string,
  entry: StatEntry,
  block?: StatBlock | null,
): MonsterRollKind {
  if (PASSIVE_SECTIONS.test(sectionTitle.trim())) return 'plain'
  if (PLAIN_TEXT.test(entry.t)) return 'plain'
  return isNoCrit(block, entry) ? 'nocrit' : 'attack'
}
