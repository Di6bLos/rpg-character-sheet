import type { BestiaryFamily, BestiaryMonster } from '~/data/nimble/bestiary'
import type { NpcKind, StatBlock, StatEntry } from '~/types'

/** An official `npcs` row built from the GM's Guide data (see `scripts/bestiary-seed.ts`). */
export interface BestiaryRow {
  system: 'nimble'
  kind: NpcKind
  name: string
  level: string
  slug: string
  source: 'official'
  source_ref: string
  stat_block: StatBlock
}

/** Same shape the manual builder stores for Nimble (`utils/npcStatBlock.ts`). */
export function bestiaryStatBlock(family: BestiaryFamily, m: BestiaryMonster): StatBlock {
  const top: [string, string][] = [
    ['Armor', m.armor],
    ['HP', m.hp === null ? 'Minion' : String(m.hp)],
  ]
  if (m.speed) top.push(['Speed', m.speed])
  const lines: [string, string][] = []
  if (m.saves) lines.push(['Saves', m.saves])
  if (family.section === 'bestiary') lines.push(['Family', family.name])
  const sections: { title: string; items: StatEntry[] }[] = [
    { title: 'Traits', items: [...family.traits, ...(m.traits ?? [])] },
    { title: 'Actions', items: m.actions },
    { title: 'Bloodied', items: m.bloodied ?? [] },
    { title: 'Last Stand', items: m.lastStand ?? [] },
  ].filter((s) => s.items.length)
  return {
    creatureType: m.creatureType,
    type: m.type,
    size: m.size,
    top,
    stats: [],
    lines,
    sections,
    hp: m.hp ?? undefined,
  }
}

export function bestiaryRow(family: BestiaryFamily, m: BestiaryMonster): BestiaryRow {
  return {
    system: 'nimble',
    kind: m.kind,
    name: m.name,
    level: m.level,
    slug: m.slug,
    source: 'official',
    source_ref: `Nimble GM's Guide p. ${m.page}`,
    stat_block: bestiaryStatBlock(family, m),
  }
}

export function bestiaryRows(families: BestiaryFamily[]): BestiaryRow[] {
  return families.flatMap((f) => f.monsters.map((m) => bestiaryRow(f, m)))
}
