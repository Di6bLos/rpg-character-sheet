// Stat block schema and prompt for generate-npc. The output shape matches the
// app's StatBlock (types/index.ts) so the draft drops straight into the
// manual builder; field labels match TOP_FIELDS / STAT_KEYS in utils/npcStatBlock.ts.

export type GameSystem = 'dnd5e' | 'pf2e' | 'nimble'
export type NpcKind = 'monster' | 'humanoid'
export type Threat = 'Minion' | 'Standard' | 'Elite' | 'Boss'

const pair = {
  type: 'object',
  properties: { k: { type: 'string' }, v: { type: 'string' } },
  required: ['k', 'v'],
  additionalProperties: false,
}

/** Strict-mode friendly: every property required, no extra keys, no numeric/string constraints. */
export const NPC_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The creature or character name' },
    kind: { type: 'string', enum: ['monster', 'humanoid'] },
    level: { type: 'string', description: 'Level, or Challenge for 5e, e.g. "1/2", "3"' },
    type: { type: 'string', description: 'Creature type, e.g. "Undead", "Humanoid (human)"' },
    size: { type: 'string' },
    alignment: { type: 'string', description: 'Empty string unless the system uses alignment' },
    top: {
      type: 'array',
      items: pair,
      description: 'Headline lines, using the exact labels given',
    },
    stats: { type: 'array', items: pair, description: 'Ability row; empty for Nimble' },
    lines: {
      type: 'array',
      items: pair,
      description: 'Senses, languages, skills, immunities, resistances, weaknesses',
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { n: { type: 'string' }, t: { type: 'string' } },
              required: ['n', 't'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'items'],
        additionalProperties: false,
      },
    },
    hp: { type: 'integer', description: 'Hit points as a number' },
    ac: { type: 'integer', description: 'Armor class as a number; 0 for Nimble' },
    initMod: { type: 'integer', description: 'Initiative modifier; 0 for Nimble' },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short notes on judgement calls the GM should check',
    },
  },
  required: [
    'name',
    'kind',
    'level',
    'type',
    'size',
    'alignment',
    'top',
    'stats',
    'lines',
    'sections',
    'hp',
    'ac',
    'initMod',
    'assumptions',
  ],
  additionalProperties: false,
} as const

export interface NpcDraft {
  name: string
  kind: NpcKind
  level: string
  type: string
  size: string
  alignment: string
  top: { k: string; v: string }[]
  stats: { k: string; v: string }[]
  lines: { k: string; v: string }[]
  sections: { title: string; items: { n: string; t: string }[] }[]
  hp: number
  ac: number
  initMod: number
  assumptions: string[]
}

const SYSTEM_RULES: Record<GameSystem, string> = {
  nimble: `Game system: Nimble (5e-compatible, fast and lethal).
- "top" uses exactly these labels in order: "Armor" (None, Medium or Heavy), "HP", "Speed" (in spaces, e.g. "6").
- "stats" is an empty array. ac and initMod are 0.
- Sections: "Traits" (passives and the group's one flavour ability), "Actions" (one action, or one clearly best action), "Bloodied" (optional phase change; leave out for minions). Bosses may add "Last Stand".
- Write actions as damage dice plus effects, e.g. "1d6+2. On hit: the target is Grappled." Ranges and reach are in spaces.
- Design rules (Nimble Creator's Kit): one action or one clearly best action; attacks that fight together share a die size; make monsters distinct with Automatic / On Hit / On Crit / On Death effects; no healing, no kiting, not too verbose.
- Armor: Medium armor ignores damage modifiers, Heavy halves dice; give Medium/Heavy armor about 0.8x / 0.6x the HP an unarmored creature would have.
- Minions die to any damage and can't crit: give them low HP and say "Minion" in Traits.`,
  dnd5e: `Game system: fifth edition (5e), using SRD 5.2 conventions.
- "top" uses exactly these labels in order: "Armor Class" (e.g. "13 (leather armor)"), "Hit Points" (e.g. "22 (5d8)"), "Speed" (e.g. "30 ft."), "Challenge" (e.g. "1 (200 XP)").
- "stats" uses labels STR, DEX, CON, INT, WIS, CHA with scores as strings, e.g. "15".
- "lines": Saving Throws, Skills, Damage Resistances/Immunities, Condition Immunities, Senses, Languages (only those that apply).
- Sections: "Traits", "Actions", "Reactions" (omit empty ones). Attacks read like "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage."
- level is the challenge rating ("1/2", "3"). initMod is the DEX modifier. Follow the SRD's CR guidelines for HP, AC, attack bonus and damage.
- Don't use non-SRD named creatures or setting names.`,
  pf2e: `Game system: Pathfinder Second Edition (remaster, ORC-licensed rules).
- "top" uses exactly these labels in order: "Perception" (e.g. "+6; darkvision"), "AC", "Saves" (e.g. "Fort +8, Ref +4, Will +5"), "HP" (e.g. "20" plus immunities if any), "Speed" (e.g. "25 feet").
- "stats" uses labels Str, Dex, Con, Int, Wis, Cha with modifiers as strings, e.g. "+3".
- "lines": Skills, Languages, Immunities, Weaknesses, Resistances, Items (only those that apply).
- Sections: "Abilities" (passives and reactions marked [reaction]), "Actions" (prefix each with the action cost: ◆, ◆◆, ◆◆◆ or ◇ for free).
- Follow the GM Core creature-building tables for the level (Perception, AC, saves, HP, strike bonus, damage). initMod is the Perception modifier.
- Don't use Golarion-specific names (deities, nations, named NPCs).`,
}

const THREAT: Record<Threat, string> = {
  Minion: 'a minion: weak alone, meant to come in groups, low HP',
  Standard: 'a standard foe for a party of four of the given level',
  Elite: 'an elite foe, roughly two standard foes in one, with a signature ability',
  Boss: 'a solo boss for a party of four, with phases (Bloodied / Last Stand for Nimble, legendary-style for 5e, an extreme-threat solo for PF2e)',
}

const LABEL: Record<GameSystem, string> = { nimble: 'Nimble', dnd5e: '5e', pf2e: 'Pathfinder 2e' }

export function systemPrompt(system: GameSystem): string {
  return `You write stat blocks for tabletop RPG game masters in Lantern, a campaign app.
Return one stat block as JSON matching the schema. Keep it playable at the table: short, concrete rules text with numbers, no flavour paragraphs.

${SYSTEM_RULES[system]}

If the GM uploads a stat block from another system, convert it to ${LABEL[system]}: keep the concept, signature abilities and threat, and rebuild the numbers with ${LABEL[system]} math rather than copying them. If they upload art, design the creature from what it shows.
Write original text. Never reproduce copyrighted text verbatim; summarise mechanics in your own words.
List every judgement call (level picked, numbers derived rather than taken from a table, abilities dropped or merged in a conversion) in "assumptions", one short line each.`
}

export function userPrompt(input: {
  description: string
  kind: NpcKind
  threat: Threat
  system: GameSystem
  sourceSystem: string
  fileNames: string[]
}): string {
  const lines = [
    `Make ${input.kind === 'humanoid' ? 'a humanoid NPC' : 'a monster'} for ${LABEL[input.system]}.`,
    `Threat: ${THREAT[input.threat]}.`,
  ]
  if (input.description) lines.push(`The GM describes it as:\n${input.description}`)
  if (input.fileNames.length) {
    const src =
      input.sourceSystem === 'auto'
        ? 'detect which system it is from'
        : input.sourceSystem === 'other'
          ? 'it is from another game system'
          : `it is from ${LABEL[input.sourceSystem as GameSystem] ?? input.sourceSystem}`
    lines.push(`Attached: ${input.fileNames.join(', ')}. If it is a stat block, ${src}.`)
  }
  return lines.join('\n\n')
}
