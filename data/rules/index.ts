// Library → Rules: basic rules for each game system, one markdown file per topic in
// `<system>/<nn>-<slug>.md`. They're our own summaries of the books with a page cite under
// every section, rendered with `loreHtml` after `expandRules` (utils/rulesText.ts) fills in
// the tables that come straight from the game data. Each file is its own chunk, fetched the
// first time a reader opens that topic or searches its system.
//
// Licensing (.claude/skills/rpg-rules/references/licensing.md): PF2e is ORC Remaster content
// from Player Core and GM Core only, with no Golarion proper nouns; Nimble is referenced under
// the Nimble 3rd Party Creator License. 5e is the SRD 5.2.1's own text (CC-BY-4.0), written by
// `npm run dnd5e:rules`. A system with no topics yet shows as "coming soon".
import type { GameSystem } from '~/types'

export interface RulesTopic {
  slug: string
  title: string
  /** The file under data/rules, e.g. `pf2e/03-combat.md`. */
  file: string
  /** One line under the title in the topic list. */
  blurb: string
}

export interface RulesSystem {
  id: GameSystem
  label: string
  /** The books the summaries come from, as cited on the page. */
  sources: string
  /** The license notice the tab's footer shows. */
  attribution: string
  topics: RulesTopic[]
}

const topic = (system: GameSystem, nn: string, slug: string, title: string, blurb: string) => ({
  slug,
  title,
  file: `${system}/${nn}-${slug}.md`,
  blurb,
})

export const RULES_SYSTEMS: RulesSystem[] = [
  {
    id: 'nimble',
    label: 'Nimble',
    sources: 'Nimble Core Rules, Heroes and GM’s Guide',
    attribution:
      'Lantern is an independent product published under the Nimble 3rd Party Creator License and is not affiliated with Nimble Co. Nimble © 2025 Nimble Co.',
    topics: [
      topic('nimble', '01', 'core-rules', 'Core rules', 'Stats, checks, saves, advantage'),
      topic(
        'nimble',
        '02',
        'character-basics',
        'Character basics',
        'Stat arrays, skills, languages',
      ),
      topic('nimble', '03', 'combat', 'Combat', 'Initiative, attacks, crits, armor'),
      topic('nimble', '04', 'actions', 'Actions & reactions', 'Attack, Assess, Defend, Interpose'),
      topic('nimble', '05', 'conditions', 'Conditions', 'Every condition and minor status'),
      topic(
        'nimble',
        '06',
        'spells-and-magic',
        'Spells & magic',
        'Schools, tiers, mana, upcasting',
      ),
      topic('nimble', '07', 'healing-and-rest', 'Healing & rest', 'Hit Dice, field and safe rests'),
      topic('nimble', '08', 'dying-and-death', 'Dying & death', 'Wounds, Dying, death at 6'),
      topic(
        'nimble',
        '09',
        'movement-and-exploration',
        'Movement & exploration',
        'Speed, terrain, light',
      ),
      topic('nimble', '10', 'equipment', 'Equipment', 'Armor, weapons, inventory slots'),
      topic('nimble', '11', 'leveling-up', 'Leveling up', 'What each level brings'),
      topic(
        'nimble',
        '12',
        'running-encounters',
        'Running encounters',
        'For the GM: monsters and budgets',
      ),
    ],
  },
  {
    id: 'pf2e',
    label: 'Pathfinder 2e',
    sources: 'Player Core and GM Core (Remaster)',
    attribution:
      'This page contains Licensed Material from Paizo Inc. under the ORC License, located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense and azoralaw.com/orclicense. All warranties are disclaimed as set forth therein. Attribution: this page is based on the following Licensed Material, each © Paizo Inc.: Player Core; GM Core. Paizo’s trademarks and setting material are Reserved Material and are not included. Pathfinder is a registered trademark of Paizo Inc., named here only to say which game these rules are for; Lantern is not published, endorsed or specifically approved by Paizo Inc.',
    topics: [
      topic('pf2e', '01', 'core-rules', 'Core rules', 'Checks, degrees of success, DCs'),
      topic(
        'pf2e',
        '02',
        'character-basics',
        'Character basics',
        'Attributes, proficiency, skills',
      ),
      topic('pf2e', '03', 'combat', 'Combat', 'Initiative, MAP, damage, cover, flanking'),
      topic('pf2e', '04', 'actions', 'Actions', 'Basic, specialty and skill actions'),
      topic('pf2e', '05', 'conditions', 'Conditions', 'Every condition, as a table'),
      topic('pf2e', '06', 'spells-and-magic', 'Spells & magic', 'Slots, heightening, focus, saves'),
      topic('pf2e', '07', 'healing-and-rest', 'Healing & rest', 'Rest, Treat Wounds, first aid'),
      topic('pf2e', '08', 'dying-and-death', 'Dying & death', 'Dying, recovery checks, wounded'),
      topic(
        'pf2e',
        '09',
        'movement-and-exploration',
        'Movement & exploration',
        'Speed, terrain, travel',
      ),
      topic('pf2e', '10', 'equipment', 'Equipment', 'Bulk, armor, shields, money'),
      topic('pf2e', '11', 'leveling-up', 'Leveling up', 'XP, advancement, retraining'),
      topic('pf2e', '12', 'running-encounters', 'Running encounters', 'For the GM: XP budgets'),
    ],
  },
  {
    id: 'dnd5e',
    label: '5e',
    sources: 'System Reference Document 5.2.1',
    attribution:
      'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
    topics: [
      topic('dnd5e', '01', 'core-rules', 'Core rules', 'Abilities, D20 Tests, proficiency'),
      topic(
        'dnd5e',
        '02',
        'character-basics',
        'Character creation',
        'Class, origin, ability scores',
      ),
      topic('dnd5e', '03', 'combat', 'Combat', 'Initiative, movement, attacks, cover'),
      topic('dnd5e', '04', 'actions', 'Actions', 'Every action, bonus actions, reactions'),
      topic('dnd5e', '05', 'conditions', 'Conditions', 'Every condition, exhaustion'),
      topic(
        'dnd5e',
        '06',
        'spells-and-magic',
        'Spells & magic',
        'Slots, components, concentration',
      ),
      topic('dnd5e', '07', 'healing-and-rest', 'Damage, healing & rest', 'Damage types, resting'),
      topic('dnd5e', '08', 'dying-and-death', 'Dying & death', 'Death saving throws, stabilizing'),
      topic(
        'dnd5e',
        '09',
        'movement-and-exploration',
        'Movement & exploration',
        'Light, hiding, travel, hazards',
      ),
      topic('dnd5e', '10', 'equipment', 'Equipment', 'Coins, properties, masteries, armor'),
      topic('dnd5e', '11', 'leveling-up', 'Leveling up', 'Advancement, multiclassing'),
      topic(
        'dnd5e',
        '12',
        'running-encounters',
        'Running encounters',
        'For the GM: difficulty, traps',
      ),
      topic('dnd5e', '13', 'magic-items', 'Magic items', 'Rarity, attunement, crafting'),
      topic('dnd5e', '14', 'rules-glossary', 'Rules glossary', 'Every defined term, A to Z'),
    ],
  },
]

export function rulesSystem(id: string | null | undefined): RulesSystem | undefined {
  return RULES_SYSTEMS.find((s) => s.id === id)
}

const FILES = import.meta.glob<string>('./*/*.md', { query: '?raw', import: 'default' })

/** Every topic file on disk, as `<system>/<file>.md` (for the test that checks the index). */
export const RULES_FILES = Object.keys(FILES).map((k) => k.slice(2))

/** A topic's raw markdown (placeholders not yet filled in). */
export function loadRulesFile(file: string): Promise<string> {
  const load = FILES[`./${file}`]
  if (!load) return Promise.reject(new Error(`Rules: no file ${file}`))
  return load()
}
