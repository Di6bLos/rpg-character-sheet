// Writes the Library → Rules topics for 5e (`data/rules/dnd5e/*.md`) from the SRD 5.2.1's rules
// chapters: Playing the Game, Character Creation, Equipment, the Spells chapter's opening, the
// Rules Glossary, the Gameplay Toolbox and the Magic Items rules. The SRD is CC-BY-4.0, so its
// text stays as printed; each `##` section ends with its page cite. Topics are listed in
// `data/rules/index.ts`.
//
//   npm run dnd5e:rules

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type SrdSection, find, flatBlocks, lastPage, sectionTree, srdIndex } from './lib/dnd5eSrd'
import { TABLE_PATCHES, mendTables, patchTables } from './lib/dnd5eRulesTables'
import { blocksMarkdown, srdBlocks, srdItems } from './lib/srd'

const ROOT = join(import.meta.dirname, '..')
const LOCAL = join(ROOT, '.local', 'dnd5e')
const OUT = join(ROOT, 'data', 'rules', 'dnd5e')

const items = await srdItems(join(LOCAL, 'SRD_CC_v5.2.1.pdf'), join(LOCAL, 'srd-items.json'))
const root = sectionTree(mendTables(srdBlocks(items, 5, 253, { columns: true })))
const srd = srdIndex(root)

const cite = (first: number, last: number) =>
  first === last ? `_SRD 5.2.1 p. ${first}._` : `_SRD 5.2.1 pp. ${first}–${last}._`

/** One `##` section: the SRD section's text, its subsections one level down, then the cite. */
function part(s: SrdSection, title = s.title, skip: (c: SrdSection) => boolean = () => false) {
  const body = blocksMarkdown(flatBlocks(s, skip), 3, { headerFont: true })
  return `## ${title}\n\n${body}\n\n${cite(s.page, lastPage(s))}`
}

const need = (title: string, under?: SrdSection) => {
  const s = find(under ?? root, title)
  if (!s) throw new Error(`SRD section not found: ${title}`)
  return s
}

/** A chapter: a top-level section of the SRD. */
const chapter = (title: string) => {
  const s = root.children.find((c) => c.title === title)
  if (!s) throw new Error(`SRD chapter not found: ${title}`)
  return s
}
const playing = chapter('Playing the Game')
const damage = need('Damage and Healing')
const toolbox = chapter('Gameplay Toolbox')
const equipment = chapter('Equipment')
const glossary = srd.glossary
const travel = need('Travel Pace', toolbox)
const creatingBackground = need('Creating a Background', toolbox)
const gloss = (name: string) => {
  const g = glossary.find((e) => e.name === name)
  if (!g) throw new Error(`glossary entry not found: ${name}`)
  return g
}
const glossPart = (names: string[], title: string) => {
  const entries = names.map(gloss)
  const pages = entries.map((e) => e.page)
  return `## ${title}\n\n${entries
    .map(
      (e) =>
        `### ${e.section.title}\n\n${blocksMarkdown(flatBlocks(e.section), 4, { headerFont: true })}`,
    )
    .join('\n\n')}\n\n${cite(Math.min(...pages), Math.max(...pages))}`
}

const TOPICS: { file: string; intro: string; parts: string[] }[] = [
  {
    file: '01-core-rules',
    intro: 'The core of play: the six abilities, the D20 Test and proficiency.',
    parts: ['Rhythm of Play', 'The Six Abilities', 'D20 Tests', 'Proficiency'].map((t) =>
      part(need(t, playing)),
    ),
  },
  {
    file: '02-character-basics',
    intro: 'Making a character: class, origin, ability scores and the details around them.',
    parts: [
      part(need('Create Your Character'), 'Creating a character'),
      part(creatingBackground, 'Creating a background'),
      part(need('Trinkets')),
    ],
  },
  {
    file: '03-combat',
    intro: 'How a fight runs: initiative, turns, movement, attacks and cover.',
    parts: need('Combat', playing).children.map((c) => part(c)),
  },
  {
    file: '04-actions',
    intro: 'What you can do on a turn, and how social scenes work.',
    parts: [
      part(need('Actions', playing)),
      part(need('Social Interaction', playing)),
      glossPart(
        [
          'Attack',
          'Dash',
          'Disengage',
          'Dodge',
          'Help',
          'Hide',
          'Influence',
          'Magic',
          'Ready',
          'Search',
          'Study',
          'Utilize',
        ],
        'The actions',
      ),
    ],
  },
  {
    file: '05-conditions',
    intro: 'Every condition, with the rules for exhaustion.',
    parts: [
      glossPart(['Condition'], 'How conditions work'),
      glossPart(
        glossary.filter((g) => g.tag === 'Condition').map((g) => g.name),
        'Every condition',
      ),
    ],
  },
  {
    file: '06-spells-and-magic',
    intro: 'Gaining, preparing and casting spells: slots, components, duration and effects.',
    parts: [part(need('Gaining Spells')), part(need('Casting Spells'))],
  },
  {
    file: '07-healing-and-rest',
    intro: 'Hit Points, damage and its types, healing and rests.',
    parts: [
      ...damage.children.filter((c) => c.title !== 'Dropping to 0 Hit Points').map((c) => part(c)),
      glossPart(['Short Rest', 'Long Rest', 'Hit Point Dice'], 'Resting'),
    ],
  },
  {
    file: '08-dying-and-death',
    intro: 'What happens at 0 Hit Points: death saves, stabilizing and dying outright.',
    parts: [
      part(need('Dropping to 0 Hit Points', damage)),
      glossPart(
        ['Death Saving Throw', 'Dead', 'Stable', 'Knocking Out a Creature'],
        'Related rules',
      ),
    ],
  },
  {
    file: '09-movement-and-exploration',
    intro: 'Exploring: vision and light, hiding, hazards, travel and the environment.',
    parts: [
      ...need('Exploration', playing).children.map((c) => part(c)),
      part(travel),
      part(need('Environmental Effects', toolbox)),
    ],
  },
  {
    file: '10-equipment',
    intro: 'Money, weapon properties and masteries, armor training, tools and the costs of living.',
    parts: [
      part(need('Coins', equipment)),
      part(need('Weapons', equipment)),
      part(need('Armor', equipment)),
      part(need('Tool Proficiency', equipment), 'Tools'),
      ...[
        'Mounts and Vehicles',
        'Lifestyle Expenses',
        'Food, Drink, and Lodging',
        'Hirelings',
        'Spellcasting',
        'Magic Items',
        'Crafting Nonmagical Items',
        'Brewing Potions of Healing',
        'Scribing Spell Scrolls',
      ].map((t) => part(need(t, equipment))),
    ],
  },
  {
    file: '11-leveling-up',
    intro: 'Gaining levels, starting above level 1, and multiclassing.',
    parts: ['Level Advancement', 'Starting at Higher Levels', 'Multiclassing'].map((t) =>
      part(need(t)),
    ),
  },
  {
    file: '12-running-encounters',
    intro: 'For the GM: encounter difficulty, traps, poisons, curses and fear.',
    parts: [
      'Combat Encounters',
      'Traps',
      'Poison',
      'Curses and Magical Contagions',
      'Fear and Mental Stress',
    ].map((t) => part(need(t, toolbox))),
  },
  {
    file: '13-magic-items',
    intro: 'How magic items work: categories, rarity, activation, attunement, curses and crafting.',
    parts: chapter('Magic Items')
      .children.filter((c) => c.title !== 'Magic Items A–Z')
      .map((c) => part(c)),
  },
  {
    file: '14-rules-glossary',
    intro: 'Every term the rules define, A to Z.',
    parts: [...new Set(glossary.map((g) => g.name[0]!.toUpperCase()))].map((letter) =>
      glossPart(
        glossary.filter((g) => g.name[0]!.toUpperCase() === letter).map((g) => g.name),
        letter,
      ),
    ),
  },
]

for (const p of TABLE_PATCHES)
  if (!TOPICS.some((t) => t.file === p.topic)) throw new Error(`5e rules: no topic ${p.topic}`)
mkdirSync(OUT, { recursive: true })
for (const t of TOPICS)
  writeFileSync(
    join(OUT, `${t.file}.md`),
    patchTables(t.file, `${t.intro}\n\n${t.parts.join('\n\n')}\n`),
  )
console.log(`${TOPICS.length} topics in ${OUT}`)
