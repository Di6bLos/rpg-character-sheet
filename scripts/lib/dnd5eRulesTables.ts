// The SRD's tables for the 5e rules topics (`scripts/dnd5e-rules.ts`). `mendTables` mends what
// the two-column PDF does to tables in general, on the blocks of `srdBlocks`; `patchTables`
// swaps in, per topic, the tables still too mangled for that, transcribed as printed (the SRD
// is CC-BY-4.0). Each patch must match its topic's markdown exactly once, so a regenerate that
// changes the broken text fails loudly instead of dropping the fix.

import { MID, type SrdBlock, joinLine } from './srd'

type Row = Extract<SrdBlock, { kind: 'row' }>

const isRow = (b: SrdBlock | undefined): b is Row => b?.kind === 'row'

/**
 * General table repairs, in order:
 * - a wide table's right-hand columns, which the gutter cuts off into rows of their own, join
 *   the rows on their baseline (only when every row of that run finds one, and not when the
 *   run starts with the same header: that is a second column of the same table);
 * - a group caption set between rows ("Simple Melee Weapons") becomes a bold row of the table
 *   instead of ending it;
 * - a cell's wrapped line that starts flush with the cell, which reads as a paragraph, joins
 *   the cell when it carries on the cell's text;
 * - a header row the book repeats at the top of a column or page is dropped, also where it
 *   was read as the last line of a cell.
 */
export function mendTables(blocks: SrdBlock[]): SrdBlock[] {
  return dropRepeatedHeaders(wrappedCells(captionRows(joinSplitRows(blocks))))
}

function joinSplitRows(blocks: SrdBlock[]): SrdBlock[] {
  const out = [...blocks]
  const partner = (r: Row) =>
    out.find(
      (l): l is Row =>
        isRow(l) &&
        l !== r &&
        l.page === r.page &&
        l.x[0]! < MID - 20 &&
        l.x.at(-1)! < r.x[0]! &&
        Math.abs(l.y - r.y) < 1,
    )
  for (let i = 0; i < out.length; i++) {
    const first = out[i]
    if (!isRow(first) || first.x[0]! < MID - 8) continue
    let end = i
    while (isRow(out[end + 1]) && (out[end + 1] as Row).x[0]! >= MID - 8) end++
    const run = out.slice(i, end + 1) as Row[]
    const pairs = run.map((r) => [r, partner(r)] as const)
    if (pairs.some(([, l]) => !l) || run[0]!.cells.join('|') === pairs[0]![1]!.cells.join('|')) {
      i = end
      continue
    }
    for (const [r, l] of pairs) {
      l!.cells.push(...r.cells)
      l!.x.push(...r.x)
    }
    out.splice(i, run.length)
    i--
  }
  return out
}

function captionRows(blocks: SrdBlock[]): SrdBlock[] {
  return blocks.map((b, i) => {
    if (b.kind !== 'para' || b.font !== 'GillSans-Italic' || b.size >= 10.5) return b
    if (!isRow(blocks[i - 1]) || !isRow(blocks[i + 1])) return b
    return { kind: 'row', page: b.page, cells: [`**${b.text}**`], font: b.font, x: [b.x], y: 0 }
  })
}

function wrappedCells(blocks: SrdBlock[]): SrdBlock[] {
  const out: SrdBlock[] = []
  for (const b of blocks) {
    const last = out.at(-1)
    if (b.kind === 'para' && b.font === 'GillSans' && b.size < 10.5 && isRow(last)) {
      const k = last.x.findIndex((x) => Math.abs(x - b.x) < 4)
      const cell = last.cells[k]
      if (cell !== undefined && (/^[a-z]/.test(b.text) || /[,-]$/.test(cell))) {
        last.cells[k] = joinLine(cell, b.text)
        continue
      }
    }
    out.push(b)
  }
  return out
}

function dropRepeatedHeaders(blocks: SrdBlock[]): SrdBlock[] {
  const key = (r: Row) => r.cells.join('|')
  return blocks.filter((b, i) => {
    if (!isRow(b)) return true
    let k = i - 1
    while (isRow(blocks[k])) k--
    const head = blocks[k + 1] as Row
    if (head === b) return true
    const tail = ` ${head.cells.join(' ')}`
    b.cells = b.cells.map((c) => (c.endsWith(tail) ? c.slice(0, -tail.length) : c))
    return key(head) !== key(b)
  })
}

/** A table, or the text around it, as a topic prints it broken and as the SRD prints it. */
export interface TablePatch {
  /** The topic file, without `.md`. */
  topic: string
  /** The table and its SRD page, named in the error when the patch stops matching. */
  table: string
  broken: string
  fixed: string
}

/** A topic's markdown with its patches applied; throws when one doesn't match exactly once. */
export function patchTables(topic: string, md: string): string {
  for (const p of TABLE_PATCHES.filter((x) => x.topic === topic)) {
    const at = md.indexOf(p.broken)
    if (at < 0 || md.indexOf(p.broken, at + 1) >= 0)
      throw new Error(`5e rules: patch "${p.table}" no longer matches ${topic}.md exactly once`)
    md = md.slice(0, at) + p.fixed + md.slice(at + p.broken.length)
  }
  return md
}

export const TABLE_PATCHES: TablePatch[] = [
  {
    topic: '01-core-rules',
    table: 'Skills (p. 9): its header row came before its title',
    broken: `| Skill | Ability | Example Uses |
| --- | --- | --- |

##### Skills

| Acrobatics |`,
    fixed: `##### Skills

| Skill | Ability | Example Uses |
| --- | --- | --- |
| Acrobatics |`,
  },
  {
    topic: '02-character-basics',
    table: 'Class Overview (p. 19): Barbarian',
    broken: `| Barbarian Battle | Strength | Average |  |`,
    fixed: `| Barbarian | Battle | Strength | Average |`,
  },
  {
    topic: '02-character-basics',
    table: 'Class Overview (p. 19): the header repeated in the next column',
    broken: `| Ranger | Survival | Dexterity and Wisdom | Average Class Likes ... Primary Complexity Ability |`,
    fixed: `| Ranger | Survival | Dexterity and Wisdom | Average |`,
  },
  {
    topic: '02-character-basics',
    table: 'Ability Scores and Backgrounds (pp. 19–20)',
    broken: `| Dexterity | Soldier |

Constitution Soldier

| Intelligence | Acolyte |
| Ability | Background |
| Wisdom | Acolyte |`,
    fixed: `| Dexterity | Soldier |
| Constitution | Soldier |
| Intelligence | Acolyte |
| Wisdom | Acolyte |`,
  },
  {
    topic: '02-character-basics',
    table: 'Standard Languages (p. 20)',
    broken: `| 9 | Goblin |

10–11 Halfling

| 12 | Orc |`,
    fixed: `| 9 | Goblin |
| 10–11 | Halfling |
| 12 | Orc |`,
  },
  {
    topic: '02-character-basics',
    table: 'Rare Languages (p. 20)',
    broken: `| Druidic | Undercommon |

Infernal
`,
    fixed: `| Druidic | Undercommon |
| Infernal |  |
`,
  },
  {
    topic: '02-character-basics',
    table: 'Passive Perception formula (p. 22)',
    broken: `**Passive Perception** = 10 + Wisdom (Perception)

check modifier`,
    fixed: `**Passive Perception** = 10 + Wisdom (Perception) check modifier`,
  },
  {
    topic: '02-character-basics',
    table: 'Attack bonus formulas (p. 22)',
    broken: `**Melee attack bonus** = Strength modifier

+ Proficiency Bonus **Ranged attack bonus** = Dexterity modifier

+ Proficiency Bonus`,
    fixed: `**Melee attack bonus** = Strength modifier + Proficiency Bonus

**Ranged attack bonus** = Dexterity modifier + Proficiency Bonus`,
  },
  {
    topic: '02-character-basics',
    table: 'Spellcasting formulas (p. 23)',
    broken: `**Spell save DC** = 8 + spellcasting ability modifier

+ Proficiency Bonus **Spell attack bonus** = spellcasting ability modifier

+ Proficiency Bonus`,
    fixed: `**Spell save DC** = 8 + spellcasting ability modifier + Proficiency Bonus

**Spell attack bonus** = spellcasting ability modifier + Proficiency Bonus`,
  },
  {
    topic: '02-character-basics',
    table: 'Travel Terrain (p. 192): set below Creating a Background, moved to its section',
    broken: `#### Travel Terrain

| Arctic | Fast* | 6d6 × 10 feet | 20 | 10 | 10 |
| Coastal | Normal | 2d10 × 10 feet | 10 | 5 | 15 |
| Desert | Normal | 6d6 × 10 feet | 20 | 10 | 10 |
| Forest | Normal | 2d8 × 10 feet | 10 | 15 | 15 |
| Grassland | Fast | 6d6 × 10 feet | 15 | 5 | 15 |
| Hill | Normal | 2d10 × 10 feet | 15 | 10 | 15 |
| Mountain | Slow | 4d10 × 10 feet | 20 | 15 | 20 |
| Swamp | Slow | 2d8 × 10 feet | 10 | 15 | 20 |
| Underdark | Normal | 2d6 × 10 feet | 20 | 10 | 20 |
| Urban | Normal † | 2d6 × 10 feet | 20 | 15 | 15 |
| Waterborne | Special | 6d6 × 10 feet | 15 | 10 | 15 |

*Appropriate equipment (such as skis) is necessary to keep up a Fast pace in Arctic terrain.

†

Characters’ rate of travel while waterborne depends on the vehicle carrying them; see “Vehicles.”

`,
    fixed: ``,
  },
  {
    topic: '02-character-basics',
    table: 'Trinkets (pp. 26–27): two columns a page, read across',
    broken: `| 1d100 | Trinket |  |
| --- | --- | --- |
| 01 | A mummified goblin hand |  |
| 02 | A crystal that faintly glows in moonlight |  |
| 03 | A gold coin minted in an unknown land |  |
| 04 | A diary written in a language you don’t know |  |
| 05 | A brass ring that never tarnishes |  |
| 06 | An old chess piece made from glass |  |
| 07 | A pair of knucklebone dice, each with a skull symbol on the side that would normally show six pips |  |
| 08 | A small idol depicting a nightmarish creature that gives you unsettling dreams when you sleep near it |  |
| 09 | A lock of someone’s hair |  |
| 10 | The deed for a parcel of land in a realm unknown to you |  |
| 11 | A 1-ounce block made from an unknown material |  |
| 12 | A small cloth doll skewered with needles |  |
| 13 | A tooth from an unknown beast |  |
| 14 | An enormous scale, perhaps from a dragon |  |
| 15 | A bright-green feather |  |
| 16 | An old divination card bearing your likeness |  |
| 17 | A glass orb filled with moving smoke |  |
| 18 | A 1-pound egg with a bright-red shell |  |
| 19 | A pipe that blows bubbles |  |
| 20 | A glass jar containing a bit of flesh floating in pickling fluid |  |
| 21 | A gnome-crafted music box that plays a song you dimly remember from your childhood |  |
| 22 | A wooden statuette of a smug halfling |  |
| 23 | A brass orb etched with strange runes |  |
| 24 | A multicolored stone disk |  |
| 25 | A silver icon of a raven |  |
| 26 | A bag containing forty-seven teeth, one of which is rotten |  |
| 27 | A shard of obsidian that always feels warm to the touch |  |
| 28 | A dragon’s talon strung on a leather necklace |  |
| 29 | A pair of old socks |  |
| 30 | A blank book whose pages refuse to hold ink, chalk, graphite, or any other marking |  |
| 31 | A silver badge that is a five-pointed star |  |
| 32 | A knife that belonged to a relative |  |
| 33 | A glass vial filled with nail clippings |  |
| 34 | A rectangular metal device with two tiny metal cups on one end that throws sparks when wet |  |
| 35 | A white, sequined glove sized for a human |  |
| 36 | A vest with one hundred tiny pockets |  |
| 37 | A weightless stone |  |
| 38 | A sketch of a goblin |  |
| 39 | An empty glass vial that smells of perfume |  |
| 40 | A gemstone that looks like a lump of coal when examined by anyone but you |  |
| 41 | A scrap of cloth from an old banner |  |
| 42 | A rank insignia from a lost legionnaire |  |
| 43 | A silver bell without a clapper |  |
| 44 | A mechanical canary inside a lamp |  |
| 45 | A miniature chest carved to look like it has numerous feet on the bottom |  |
| 46 | A dead sprite inside a clear glass bottle |  |
| 47 | A metal can that has no opening but sounds as if it is filled with liquid, sand, spiders, or broken glass (your choice) |  |
| 48 | A glass orb filled with water, in which swims a clockwork goldfish |  |
| 49 | A silver spoon with an M engraved on the handle |  |
| 50 | A whistle made from gold-colored wood |  |
| 51 | A dead scarab beetle the size of your hand |  |
| 52 | Two toy soldiers, one missing a head |  |
| 53 | A small box filled with different-sized buttons |  |
| 73 | An eggshell painted with scenes of misery in disturbing detail |  |
| 74 | A fan that, when unfolded, shows a sleepy cat |  |
| 75 | A set of bone pipes |  |
| 76 | A four-leaf clover pressed inside a book discussing manners and etiquette |  |
| 77 | A sheet of parchment upon which is drawn a mechanical contraption |  |
| 78 | An ornate scabbard that fits no blade you have found |  |
| 79 | An invitation to a party where a murder happened |  |
| 80 | A bronze pentacle with an etching of a rat’s head in its center |  |
| 81 | A purple handkerchief embroidered with the name of an archmage |  |
| 82 | Half a floor plan for a temple, a castle, or another structure |  |
| 83 | A bit of folded cloth that, when unfolded, turns into a stylish cap |  |
| 84 | A receipt of deposit at a bank in a far-off city |  |
| 85 | A diary with seven missing pages |  |
| 86 | An empty silver snuffbox bearing the inscription “dreams” on its lid |  |
| 87 | An iron holy symbol devoted to an unknown |  |
| 54 | A candle that can’t be lit | god |
| 55 | A miniature cage with no door |  |
| 56 | An old key |  |
| 57 | An indecipherable treasure map |  |
| 58 | A hilt from a broken sword |  |
| 59 | A rabbit’s foot |  |
| 60 | A glass eye |  |
| 61 | A cameo of a hideous person |  |
| 62 | A silver skull the size of a coin |  |
| 63 | An alabaster mask |  |
| 64 | A cone of sticky black incense that stinks |  |
| 65 | A nightcap that gives you pleasant dreams when you wear it |  |
| 66 | A single caltrop made from bone |  |
| 67 | A gold monocle frame without the lens |  |
| 68 | A 1-inch cube, each side a different color |  |
| 69 | A crystal doorknob |  |
| 70 | A packet filled with pink dust |  |
| 71 | A fragment of a beautiful song, written as musical notes on two pieces of parchment |  |
| 72 | A silver teardrop earring containing a real teardrop 88 A book about a legendary hero’s rise and fall, with the last chapter missing |  |
| 89 | A vial of dragon blood |  |
| 90 | An ancient arrow of elven design |  |
| 91 | A needle that never bends |  |
| 92 | An ornate brooch of dwarven design |  |
| 93 | An empty wine bottle bearing a pretty label that says, “The Wizard of Wines Winery, Red Dragon Crush, 331422-W” |  |
| 94 | A mosaic tile with a multicolored, glazed surface |  |
| 95 | A petrified mouse |  |
| 96 | A black pirate flag adorned with a dragon’s skull and crossbones |  |
| 97 | A tiny mechanical crab or spider that moves about when it’s not being observed |  |
| 98 | A glass jar containing lard with a label that reads, “Griffon Grease” |  |
| 99 | A wooden box with a ceramic bottom that holds a living worm with a head on each end of its body |  |
| 00 | A metal urn containing the ashes of a hero |  |`,
    fixed: `| 1d100 | Trinket |
| --- | --- |
| 01 | A mummified goblin hand |
| 02 | A crystal that faintly glows in moonlight |
| 03 | A gold coin minted in an unknown land |
| 04 | A diary written in a language you don’t know |
| 05 | A brass ring that never tarnishes |
| 06 | An old chess piece made from glass |
| 07 | A pair of knucklebone dice, each with a skull symbol on the side that would normally show six pips |
| 08 | A small idol depicting a nightmarish creature that gives you unsettling dreams when you sleep near it |
| 09 | A lock of someone’s hair |
| 10 | The deed for a parcel of land in a realm unknown to you |
| 11 | A 1-ounce block made from an unknown material |
| 12 | A small cloth doll skewered with needles |
| 13 | A tooth from an unknown beast |
| 14 | An enormous scale, perhaps from a dragon |
| 15 | A bright-green feather |
| 16 | An old divination card bearing your likeness |
| 17 | A glass orb filled with moving smoke |
| 18 | A 1-pound egg with a bright-red shell |
| 19 | A pipe that blows bubbles |
| 20 | A glass jar containing a bit of flesh floating in pickling fluid |
| 21 | A gnome-crafted music box that plays a song you dimly remember from your childhood |
| 22 | A wooden statuette of a smug halfling |
| 23 | A brass orb etched with strange runes |
| 24 | A multicolored stone disk |
| 25 | A silver icon of a raven |
| 26 | A bag containing forty-seven teeth, one of which is rotten |
| 27 | A shard of obsidian that always feels warm to the touch |
| 28 | A dragon’s talon strung on a leather necklace |
| 29 | A pair of old socks |
| 30 | A blank book whose pages refuse to hold ink, chalk, graphite, or any other marking |
| 31 | A silver badge that is a five-pointed star |
| 32 | A knife that belonged to a relative |
| 33 | A glass vial filled with nail clippings |
| 34 | A rectangular metal device with two tiny metal cups on one end that throws sparks when wet |
| 35 | A white, sequined glove sized for a human |
| 36 | A vest with one hundred tiny pockets |
| 37 | A weightless stone |
| 38 | A sketch of a goblin |
| 39 | An empty glass vial that smells of perfume |
| 40 | A gemstone that looks like a lump of coal when examined by anyone but you |
| 41 | A scrap of cloth from an old banner |
| 42 | A rank insignia from a lost legionnaire |
| 43 | A silver bell without a clapper |
| 44 | A mechanical canary inside a lamp |
| 45 | A miniature chest carved to look like it has numerous feet on the bottom |
| 46 | A dead sprite inside a clear glass bottle |
| 47 | A metal can that has no opening but sounds as if it is filled with liquid, sand, spiders, or broken glass (your choice) |
| 48 | A glass orb filled with water, in which swims a clockwork goldfish |
| 49 | A silver spoon with an M engraved on the handle |
| 50 | A whistle made from gold-colored wood |
| 51 | A dead scarab beetle the size of your hand |
| 52 | Two toy soldiers, one missing a head |
| 53 | A small box filled with different-sized buttons |
| 54 | A candle that can’t be lit |
| 55 | A miniature cage with no door |
| 56 | An old key |
| 57 | An indecipherable treasure map |
| 58 | A hilt from a broken sword |
| 59 | A rabbit’s foot |
| 60 | A glass eye |
| 61 | A cameo of a hideous person |
| 62 | A silver skull the size of a coin |
| 63 | An alabaster mask |
| 64 | A cone of sticky black incense that stinks |
| 65 | A nightcap that gives you pleasant dreams when you wear it |
| 66 | A single caltrop made from bone |
| 67 | A gold monocle frame without the lens |
| 68 | A 1-inch cube, each side a different color |
| 69 | A crystal doorknob |
| 70 | A packet filled with pink dust |
| 71 | A fragment of a beautiful song, written as musical notes on two pieces of parchment |
| 72 | A silver teardrop earring containing a real teardrop |
| 73 | An eggshell painted with scenes of misery in disturbing detail |
| 74 | A fan that, when unfolded, shows a sleepy cat |
| 75 | A set of bone pipes |
| 76 | A four-leaf clover pressed inside a book discussing manners and etiquette |
| 77 | A sheet of parchment upon which is drawn a mechanical contraption |
| 78 | An ornate scabbard that fits no blade you have found |
| 79 | An invitation to a party where a murder happened |
| 80 | A bronze pentacle with an etching of a rat’s head in its center |
| 81 | A purple handkerchief embroidered with the name of an archmage |
| 82 | Half a floor plan for a temple, a castle, or another structure |
| 83 | A bit of folded cloth that, when unfolded, turns into a stylish cap |
| 84 | A receipt of deposit at a bank in a far-off city |
| 85 | A diary with seven missing pages |
| 86 | An empty silver snuffbox bearing the inscription “dreams” on its lid |
| 87 | An iron holy symbol devoted to an unknown god |
| 88 | A book about a legendary hero’s rise and fall, with the last chapter missing |
| 89 | A vial of dragon blood |
| 90 | An ancient arrow of elven design |
| 91 | A needle that never bends |
| 92 | An ornate brooch of dwarven design |
| 93 | An empty wine bottle bearing a pretty label that says, “The Wizard of Wines Winery, Red Dragon Crush, 331422-W” |
| 94 | A mosaic tile with a multicolored, glazed surface |
| 95 | A petrified mouse |
| 96 | A black pirate flag adorned with a dragon’s skull and crossbones |
| 97 | A tiny mechanical crab or spider that moves about when it’s not being observed |
| 98 | A glass jar containing lard with a label that reads, “Griffon Grease” |
| 99 | A wooden box with a ceramic bottom that holds a living worm with a head on each end of its body |
| 00 | A metal urn containing the ashes of a hero |`,
  },
  {
    topic: '03-combat',
    table: 'Cover (p. 15): Three-Quarters wraps',
    broken: `| Three- | +5 bonus to AC | An object that covers at |
| Quarters | and Dexterity saving throws | least three-quarters of the target |`,
    fixed: `| Three-Quarters | +5 bonus to AC and Dexterity saving throws | An object that covers at least three-quarters of the target |`,
  },
  {
    topic: '06-spells-and-magic',
    table: 'Spell save DC formula (p. 106)',
    broken: `**Spell save DC** = 8 + your spellcasting ability modifier

+ your Proficiency Bonus`,
    fixed: `**Spell save DC** = 8 + your spellcasting ability modifier + your Proficiency Bonus`,
  },
  {
    topic: '09-movement-and-exploration',
    table: 'Special Movement formulas and Travel Terrain (p. 192)',
    broken: `| Terrain | Maximum Pace | Encounter Distance | Foraging DC | Navigation DC | Search DC |
| --- | --- | --- | --- | --- | --- |

**Miles per hour** = Speed ÷ 10 **Miles per day** (Normal pace) = Miles per hour

× number of hours traveled (typically 8) **Fast pace**

= Miles per day × 1⅓ (round down) **Slow pace** = Miles per day × 2/3 (round down) If the characters are flying or their special movement allows them to ignore Difficult Terrain, they can move at a Fast pace regardless of the terrain.`,
    fixed: `**Miles per hour** = Speed ÷ 10

**Miles per day** (Normal pace) = Miles per hour × number of hours traveled (typically 8)

**Fast pace** = Miles per day × 1⅓ (round down)

**Slow pace** = Miles per day × 2/3 (round down)

If the characters are flying or their special movement allows them to ignore Difficult Terrain, they can move at a Fast pace regardless of the terrain.

#### Travel Terrain

| Terrain | Maximum Pace | Encounter Distance | Foraging DC | Navigation DC | Search DC |
| --- | --- | --- | --- | --- | --- |
| Arctic | Fast* | 6d6 × 10 feet | 20 | 10 | 10 |
| Coastal | Normal | 2d10 × 10 feet | 10 | 5 | 15 |
| Desert | Normal | 6d6 × 10 feet | 20 | 10 | 10 |
| Forest | Normal | 2d8 × 10 feet | 10 | 15 | 15 |
| Grassland | Fast | 6d6 × 10 feet | 15 | 5 | 15 |
| Hill | Normal | 2d10 × 10 feet | 15 | 10 | 15 |
| Mountain | Slow | 4d10 × 10 feet | 20 | 15 | 20 |
| Swamp | Slow | 2d8 × 10 feet | 10 | 15 | 20 |
| Underdark | Normal | 2d6 × 10 feet | 20 | 10 | 20 |
| Urban | Normal | 2d6 × 10 feet | 20 | 15 | 15 |
| Waterborne | Special† | 6d6 × 10 feet | 15 | 10 | 15 |

*Appropriate equipment (such as skis) is necessary to keep up a Fast pace in Arctic terrain.

†Characters’ rate of travel while waterborne depends on the vehicle carrying them; see “Vehicles.”`,
  },
  {
    topic: '10-equipment',
    table: 'Airborne and Waterborne Vehicles (p. 101)',
    broken: `| Ship | Speed | Crew | Passengers | Cargo (Tons) AC HP Damage Threshold Cost |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Airship | 8 mph | 10 | 20 | 13 | 300 | — | 40,000 GP |
| Galley | 4 mph | 80 | — 150 | 15 | 500 | 20 | 30,000 GP |
| Keelboat | 1 mph | 1 | 6 | 15 | 100 | 10 | 3,000 GP |
| Longship | 3 mph | 40 | 150 | 15 | 300 | 15 | 10,000 GP |
| Rowboat | 1½ mph | 1 | 3 | 11 | 50 | — | 50 GP |
| Sailing Ship | 2 mph | 20 | 20 100 | 15 | 300 | 15 | 10,000 GP |
| Warship | 2½ mph | 60 | 60 200 | 15 | 500 | 20 | 25,000 GP |`,
    fixed: `| Ship | Speed | Crew | Passengers | Cargo (Tons) | AC | HP | Damage Threshold | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Airship | 8 mph | 10 | 20 | 1 | 13 | 300 | — | 40,000 GP |
| Galley | 4 mph | 80 | — | 150 | 15 | 500 | 20 | 30,000 GP |
| Keelboat | 1 mph | 1 | 6 | 1/2 | 15 | 100 | 10 | 3,000 GP |
| Longship | 3 mph | 40 | 150 | 10 | 15 | 300 | 15 | 10,000 GP |
| Rowboat | 1½ mph | 1 | 3 | — | 11 | 50 | — | 50 GP |
| Sailing Ship | 2 mph | 20 | 20 | 100 | 15 | 300 | 15 | 10,000 GP |
| Warship | 2½ mph | 60 | 60 | 200 | 15 | 500 | 20 | 25,000 GP |`,
  },
  {
    topic: '10-equipment',
    table: 'Airborne and Waterborne Vehicles (p. 101): its Cargo cells under Wretched',
    broken: `outside.

1

1/2

10

—

`,
    fixed: `outside.

`,
  },
  {
    topic: '10-equipment',
    table: 'Food, Drink, and Lodging (pp. 101–102): one list set in two columns',
    broken: `| Item | Cost | Item | Cost |
| --- | --- | --- | --- |
| Ale (mug) | 4 CP | Comfortable | 8 SP |
| Bread (loaf) | 2 CP | Wealthy | 2 GP |
| Cheese (wedge) | 1 SP | Aristocratic | 4 GP |
| Inn Stay per Day | Meal |  |  |
| Squalid | 7 CP | Squalid | 1 CP |
| Poor | 1 SP | Poor | 2 CP |
| Modest | 5 SP | Modest | 1 SP |
| Comfortable | 2 SP | Wine (bottle) |  |
| Wealthy | 3 SP | Common | 2 SP |
| Aristocratic | 6 SP | Fine | 10 GP |`,
    fixed: `| Item | Cost |
| --- | --- |
| Ale (mug) | 4 CP |
| Bread (loaf) | 2 CP |
| Cheese (wedge) | 1 SP |
| **Inn Stay per Day** |  |
| Squalid | 7 CP |
| Poor | 1 SP |
| Modest | 5 SP |
| Comfortable | 8 SP |
| Wealthy | 2 GP |
| Aristocratic | 4 GP |
| **Meal** |  |
| Squalid | 1 CP |
| Poor | 2 CP |
| Modest | 1 SP |
| Comfortable | 2 SP |
| Wealthy | 3 SP |
| Aristocratic | 6 SP |
| **Wine (bottle)** |  |
| Common | 2 SP |
| Fine | 10 GP |`,
  },
  {
    topic: '11-leveling-up',
    table: 'Starting Equipment at Higher Levels (p. 24)',
    broken: `| Starting Level | Equipment and Money |
| --- | --- |
| 2–4 | Normal starting equipment |
| 5–10 | 500 GP plus 1d10 × 25 GP plus normal starting equipment |
| 11–16 | 5,000 gp plus 1d10 × 250 GP plus normal starting equipment |
| 17–20 | 20,000 GP plus 1d10 × 250 GP plus normal starting equipment |`,
    fixed: `| Starting Level | Equipment and Money | Magic Items |
| --- | --- | --- |
| 2–4 | Normal starting equipment | 1 Common |
| 5–10 | 500 GP plus 1d10 × 25 GP plus normal starting equipment | 1 Common, 1 Uncommon |
| 11–16 | 5,000 gp plus 1d10 × 250 GP plus normal starting equipment | 2 Common, 3 Uncommon, 1 Rare |
| 17–20 | 20,000 GP plus 1d10 × 250 GP plus normal starting equipment | 2 Common, 4 Uncommon, 3 Rare, 1 Very Rare |`,
  },
  {
    topic: '11-leveling-up',
    table:
      'Starting Equipment at Higher Levels (p. 24): its Magic Items column under Prerequisites',
    broken: `**Magic Items** 1 Common 1 Common, 1 Uncommon

2 Common, 3 Uncommon, 1 Rare

2 Common, 4 Uncommon, 3 Rare, 1 Very Rare

`,
    fixed: ``,
  },
  {
    topic: '12-running-encounters',
    table: 'XP Budget per Character (p. 202)',
    broken: `**——— Encounter Difficulty ———** **Party’s**

| Level | Low |`,
    fixed: `**——— Encounter Difficulty ———**

| Party’s Level | Low |`,
  },
  {
    topic: '12-running-encounters',
    table: 'Sample Fear DCs (p. 196): its title',
    broken: `##### Sample Fear Dcs`,
    fixed: `##### Sample Fear DCs`,
  },
  {
    topic: '12-running-encounters',
    table: 'Frightened effects (p. 196): a bullet read as a row',
    broken: `- Attack rolls against the Frightened creature have Advantage.
| • | The Frightened creature can do only one of the |

following on each of its turns: move, take an action, or take a Bonus Action.`,
    fixed: `- Attack rolls against the Frightened creature have Advantage.
- The Frightened creature can do only one of the following on each of its turns: move, take an action, or take a Bonus Action.`,
  },
]
