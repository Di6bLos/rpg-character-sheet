// Rules reference sent to the Lore Master with each question. Built from the
// transcribed rules data in data/nimble (already public in the app bundle);
// campaign secrets never come from here, the Edge Function adds those for GMs.
// Other systems get no pack: the model knows 5e SRD and PF2e well enough.
import { CONDITIONS, REACTIONS } from '~/data/nimble/core'
import { ancestryBySlug } from '~/data/nimble/ancestries'
import { backgroundBySlug } from '~/data/nimble/backgrounds'
import { BESTIARY } from '~/data/nimble/bestiary'
import { NIMBLE_CLASSES, classBySlug, subclassBySlug } from '~/data/nimble/classes'
import { LEGENDARY_TABLE, MONSTER_TABLE, minionDie } from '~/data/nimble/monsters'
import { SPELLS, SPELL_RULES, schoolSpells, spellByName } from '~/data/nimble/spells'
import type { AbilityDef, ClassDef, LevelTable, SpellDef, SpellSchool } from '~/data/nimble/types'
import type { GameSystem } from '~/types'
import type { NimbleSheet } from '~/types/sheets'

export type LoreMode = 'gm' | 'player'

/** Matches MAX_RULES_PACK in the Edge Function. */
export const RULES_PACK_LIMIT = 40_000

const line = (a: AbilityDef) => `- ${a.name}: ${a.desc}`

function coreRules(): string {
  return [
    '# Nimble core rules',
    `Spells: ${SPELL_RULES}`,
    '## Heroic reactions (each costs 1 action, once per round)',
    ...REACTIONS.map(line),
    '## Conditions',
    ...CONDITIONS.map(line),
  ].join('\n')
}

function levels(table: LevelTable): string[] {
  return Object.entries(table).flatMap(([lvl, def]) =>
    def?.abilities.length ? [`Level ${lvl}:`, ...def.abilities.map(line)] : [],
  )
}

function classRules(cls: ClassDef, subclassSlug: string): string {
  const out = [
    `# Class: ${cls.name}`,
    cls.description,
    `Key stats ${cls.keyStats.join(', ')}; Hit Die d${cls.hitDie}; saves: advantage ${cls.saveAdv}, disadvantage ${cls.saveDis}; armor: ${cls.armor}; weapons: ${cls.weapons}.`,
  ]
  if (cls.mana) out.push(`Mana: ${cls.mana.label}.`)
  if (cls.resource) out.push(`Class resource: ${cls.resource.name} (${cls.resource.diceName}).`)
  out.push(line(cls.swapRule), '## Class abilities by level', ...levels(cls.levels))
  for (const pool of cls.pools) {
    out.push(`## ${pool.name}`, ...(pool.note ? [pool.note] : []), ...pool.options.map(line))
  }
  const sub = subclassSlug ? subclassBySlug(cls, subclassSlug) : undefined
  if (sub) {
    out.push(
      `# Subclass: ${sub.name} (${sub.tagline})`,
      ...(sub.intro ?? []).map(line),
      ...levels(sub.levels),
    )
  }
  return out.join('\n')
}

function spellLine(s: SpellDef, unlocked: number): string {
  const tier = s.tier === 0 ? 'cantrip' : `tier ${s.tier}`
  const locked = s.tier > unlocked ? ', not unlocked yet' : ''
  return `- ${s.name} (${s.school} ${tier}${locked}; ${s.cast}): ${s.desc}`
}

function spellRules(sheet: NimbleSheet): string {
  const spells = sheet.spells
  if (!spells) return ''
  const lost = new Set(spells.lost ?? [])
  const known = new Map<string, SpellDef>()
  for (const school of spells.schools ?? []) {
    for (const s of schoolSpells(school as SpellSchool, sheet.classSlug)) known.set(s.name, s)
  }
  for (const name of [...(spells.learned ?? []), ...(spells.utility ?? [])]) {
    const s = spellByName(name)
    if (s) known.set(s.name, s)
  }
  const list = [...known.values()].filter((s) => !lost.has(s.name))
  if (!list.length) return ''
  return ['# The hero’s spells', ...list.map((s) => spellLine(s, spells.tier ?? 0))].join('\n')
}

function playerPack(sheet: NimbleSheet | null): string[] {
  if (!sheet) return []
  const parts: string[] = []
  const cls = sheet.classSlug ? classBySlug(sheet.classSlug) : undefined
  if (cls) parts.push(classRules(cls, sheet.subclassSlug))
  const anc = sheet.ancestrySlug ? ancestryBySlug(sheet.ancestrySlug) : undefined
  if (anc)
    parts.push(`# Ancestry: ${anc.name} (${anc.size})\n${anc.description}\n${line(anc.trait)}`)
  const bg = sheet.backgroundSlug ? backgroundBySlug(sheet.backgroundSlug) : undefined
  if (bg) parts.push(`# Background: ${bg.name}\n${bg.desc}`)
  const spells = spellRules(sheet)
  if (spells) parts.push(spells)
  return parts
}

function gmPack(): string[] {
  const classes = [
    '# Classes',
    ...NIMBLE_CLASSES.map(
      (c) => `- ${c.name}: ${c.tagline} Key stats ${c.keyStats.join('/')}, d${c.hitDie}.`,
    ),
  ]
  const monsters = [
    '# Monster Builder (GM’s Guide): level | HP none/medium/heavy armor | damage per round | sample dice | save DC | ~5e CR',
    ...MONSTER_TABLE.map(
      (r) =>
        `${r.level} | ${r.hpNone}/${r.hpMedium}/${r.hpHeavy} | ${r.damagePerRound} | ${r.sampleDice} | DC ${r.saveDc} | CR ${r.crEquivalent}`,
    ),
    '# Legendary monsters by party level: HP medium/heavy | Last Stand HP | save DC | small/big attack',
    ...LEGENDARY_TABLE.map(
      (r) =>
        `${r.partyLevel} | ${r.hpMedium}/${r.hpHeavy} | ${r.hpLastStand} | DC ${r.saveDc} | ${r.attackSmall}/${r.attackBig}`,
    ),
    `Minion die by party level: 1–3 ${minionDie(1)}, 4–5 ${minionDie(4)}, 6–10 ${minionDie(6)}, 11–13 ${minionDie(11)}, 14–17 ${minionDie(14)}, 18+ ${minionDie(18)}.`,
  ]
  const bestiary = [
    '# Bestiary index (name, level, armor, HP; "minion" has no HP)',
    ...BESTIARY.map(
      (f) =>
        `${f.name}: ${f.monsters
          .map((m) => `${m.name} L${m.level} ${m.armor} ${m.hp ?? 'minion'}`)
          .join('; ')}`,
    ),
  ]
  const spells = ['# Spells', ...SPELLS.map((s) => spellLine(s, 9))]
  return [classes.join('\n'), monsters.join('\n'), bestiary.join('\n'), spells.join('\n')]
}

/** The rules reference for one question, trimmed to the size the function accepts. */
export function buildRulesPack(
  system: GameSystem,
  mode: LoreMode,
  sheet: NimbleSheet | null = null,
): string {
  if (system !== 'nimble') return ''
  const parts = [coreRules(), ...(mode === 'gm' ? gmPack() : playerPack(sheet))]
  const pack = parts.join('\n\n')
  return pack.length > RULES_PACK_LIMIT ? pack.slice(0, RULES_PACK_LIMIT) : pack
}
