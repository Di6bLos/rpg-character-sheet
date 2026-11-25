import { describe, expect, it } from 'vitest'
import {
  actionGlyph,
  backgroundSkillText,
  type AonDoc,
  cleanMarkdown,
  closedArchetypeFeat,
  closedArchetypes,
  heritageAncestry,
  openBook,
  orcProblems,
  settingName,
  sourceBooks,
  table,
  withoutArchetypes,
  withoutDeities,
  withoutLegacy,
} from '../scripts/lib/aon'

const clean = (md: string) => cleanMarkdown(md, 1, new Map())
const LEGACY = new Set(['Core Rulebook', "Advanced Player's Guide", 'Secrets of Magic'])

describe('AoN action strings', () => {
  it('turns every cost AoN prints into glyphs, ranges included', () => {
    expect(actionGlyph('Single Action')).toBe('◆')
    expect(actionGlyph('Single Action to Three Actions')).toBe('◆ to ◆◆◆')
    expect(actionGlyph('Single Action or Two Actions')).toBe('◆ or ◆◆')
    expect(actionGlyph('Two Actions or Three Actions')).toBe('◆◆ or ◆◆◆')
    expect(actionGlyph('Free Action or Single Action')).toBe('◇ or ◆')
    expect(actionGlyph('Reaction or Single Action')).toBe('↺ or ◆')
    expect(actionGlyph('Two Actions to 2 rounds')).toBe('◆◆ to 2 rounds')
    expect(actionGlyph('')).toBe('')
  })

  it('never leaves an action name in brackets in a heading', () => {
    const md = clean(
      '<title level="1" right="Focus 1">Heal <actions string="Single Action to Three Actions" /></title>',
    )
    expect(md).toBe('# Heal ◆ to ◆◆◆ · Focus 1')
    expect(clean('**Activate** <actions string="" /> (manipulate)')).toBe(
      '**Activate** (manipulate)',
    )
  })
})

describe('AoN tables', () => {
  it('repeats a rowspan cell in the rows it covers, as the Animal instinct table needs', () => {
    const md = table(`<table>
      <tr><th>Animal</th><th>Attack</th><th>Damage</th></tr>
      <tr><td rowspan="3">Bear</td><td rowspan="2">Jaws</td><td rowspan="2">1d10 P</td></tr>
      <tr></tr>
      <tr><td>Claw</td><td>1d6 S</td></tr>
      <tr><td>Bull</td><td>Horn</td><td>1d10 P</td></tr>
    </table>`)
    expect(md.trim().split('\n')).toEqual([
      '| Animal | Attack | Damage |',
      '| --- | --- | --- |',
      '| Bear | Jaws | 1d10 P |',
      '| Bear | Claw | 1d6 S |',
      '| Bull | Horn | 1d10 P |',
    ])
  })

  it('keeps the columns after a colspan cell in place', () => {
    const md = table(`<table>
      <tr><th>Level</th><th colspan="2">Slots</th><th>Notes</th></tr>
      <tr><td>1</td><td>2</td><td>0</td><td>none</td></tr>
    </table>`)
    expect(md.trim().split('\n')).toEqual([
      '| Level | Slots |  | Notes |',
      '| --- | --- | --- | --- |',
      '| 1 | 2 | 0 | none |',
    ])
  })
})

describe('cleanMarkdown', () => {
  it('keeps footnote marks apart from the numbers they follow', () => {
    expect(clean('<td>+4<sup>2</sup></td>')).toBe('+4²')
    expect(clean('Cone of fire<sup>R</sup>')).toBe('Cone of fire^R')
  })

  it('turns HTML headings into markdown, even one AoN closes with </title>', () => {
    expect(clean('appearances.<h2 class="header">Ethnicities</title>A variety')).toBe(
      'appearances.\n## Ethnicities\nA variety',
    )
  })

  it("drops AoN's spoiler warnings, which are not book text, and keeps its errata notes", () => {
    expect(
      clean(
        '**_Nethys Note: This page contains HUGE SPOILERS for the Season of Ghosts Adventure Path. _**Nindorus are fiends.',
      ),
    ).toBe('Nindorus are fiends.')
    expect(
      clean('_**Nethys Note: This deity entry contains spoilers for Season of Ghosts.**_Text'),
    ).toBe('Text')
    expect(clean('**_Nethys Note: This feat was printed with two actions._**')).toContain(
      'printed with two actions',
    )
  })
})

describe('legacy sources in the ORC set', () => {
  it('reads every book on a source line, commas in book names included', () => {
    expect(
      sourceBooks('**Source** Player Core pg. 150, Core Rulebook pg. 165, Player Core 2 pg. 126'),
    ).toEqual(['Player Core', 'Core Rulebook', 'Player Core 2'])
    expect(sourceBooks('**Source** Cheliax, Infernal Inheritance pg. 4')).toEqual([
      'Cheliax, Infernal Inheritance',
    ])
    expect(sourceBooks('Some text')).toEqual([])
  })

  it('keeps a reprinted section but cites only its remastered books', () => {
    const md = [
      '### Master of Many Styles',
      '**Source** Player Core pg. 150, Core Rulebook pg. 165, Player Core 2 pg. 126',
      'You move.',
      '### Druid thing',
      '**Source** Secrets of Magic pg. 200, Rage of Elements pg. 61',
    ].join('\n')
    const out = withoutLegacy(md, LEGACY)
    expect(out).toContain('**Source** Player Core pg. 150, Player Core 2 pg. 126')
    expect(out).toContain('**Source** Rage of Elements pg. 61')
    expect(orcProblems(out, LEGACY)).toEqual([])
  })

  it('drops a section whose own source is only legacy books, with its subsections', () => {
    const md = [
      '## Remastered',
      '**Source** Player Core pg. 10',
      '### Critical Specialization Effects',
      '**Source** Core Rulebook pg. 283',
      '#### Sword',
      'Old text.',
      '### Next',
      '**Source** Player Core pg. 11',
    ].join('\n')
    const out = withoutLegacy(md, LEGACY)
    expect(out).not.toContain('Critical Specialization')
    expect(out).not.toContain('Old text')
    expect(out).toContain('### Next')
  })

  it('drops a section titled with a left-out book, as Avatar lists forms per book', () => {
    const md = ['## Avatar', 'Text.', '### Pathfinder #176', '- Gozreh form', '## Next'].join('\n')
    const out = withoutLegacy(md, new Set(['Pathfinder #176']))
    expect(out).not.toContain('Gozreh')
    expect(out).toContain('## Next')
  })

  it('takes out the deity stat lines and their values', () => {
    const md = [
      '**Source** Player Core pg. 39',
      '',
      '**Deities**',
      'Gozreh, Hei Feng',
      '',
      '**Favored Weapon** Inna, Laudinmio',
      '**Price** 8 gp',
    ].join('\n')
    const out = withoutDeities(md)
    expect(out).not.toMatch(/Deities|Gozreh|Favored|Inna/)
    expect(out).toContain('**Price** 8 gp')
  })

  it('flags what the ORC build must never write', () => {
    expect(orcProblems('**Source** Player Core pg. 1, Core Rulebook pg. 2', LEGACY)).toHaveLength(1)
    expect(orcProblems('**Deities**\nGozreh', LEGACY)).toHaveLength(1)
    expect(orcProblems('**Source** Player Core pg. 1\nText', LEGACY)).toEqual([])
  })
})

describe('heritageAncestry', () => {
  const ancestries = [
    { name: 'Awakened Animal', book: 'Howl of the Wild', page: 22 },
    { name: 'Centaur', book: 'Howl of the Wild', page: 28 },
    { name: 'Elf', book: 'Player Core', page: 46 },
    { name: 'Sprite', book: 'Feybound', page: 80 },
  ]
  const at = (name: string, book: string, page: number) =>
    heritageAncestry({ name, book, page }, ancestries)

  it('reads the ancestry from the name first', () => {
    expect(at('Ancient Elf', 'Player Core', 48)).toBe('Elf')
    expect(at('Dijiang', 'Tian Xia Character Guide', 46)).toBe('Sprite')
  })

  it('falls back to the ancestry printed a few pages before it in the same book', () => {
    expect(at('Climbing Animal', 'Howl of the Wild', 24)).toBe('Awakened Animal')
    expect(at('Climbing Animal', 'Another Book', 24)).toBeUndefined()
    expect(at('Far Away', 'Howl of the Wild', 60)).toBeUndefined()
  })
})

describe('Golarion setting material', () => {
  it('shares only the setting-neutral rulebooks', () => {
    expect(openBook('Player Core')).toBe(true)
    expect(openBook('Battlecry!')).toBe(true)
    for (const book of [
      'Tian Xia Character Guide',
      'Hellfire Dispatches',
      'Divine Mysteries',
      'Pathfinder #202: Severed at the Root',
      'Season of Ghosts (Hardcover)',
    ])
      expect(openBook(book), book).toBe(false)
  })

  it('spots records named for a deity or a Golarion proper noun', () => {
    const deities = ['Achaekek', 'Set', 'Nyarlathotep (The Faceless Sphinx)', 'Weight of the World']
    expect(settingName("Achaekek's Clutch", deities)).toBe('Achaekek')
    expect(settingName('Aldori Parry', deities)).toBe('Aldori')
    expect(settingName('Hellknight Plate', deities)).toBe('Hellknight')
    expect(settingName('Grasp of Nyarlathotep', deities)).toBe('Nyarlathotep')
    expect(settingName('Set-up Strike', deities)).toBeUndefined()
    expect(settingName('Weight of the World', deities)).toBeUndefined()
    expect(settingName('Setback', deities)).toBeUndefined()
    expect(settingName('Fireball', deities)).toBeUndefined()
  })
})

describe('AoN background skill text', () => {
  it('reads skills the field leaves out (The Hunted)', () => {
    expect(backgroundSkillText("You''re trained in both the Stealth and Survival skills.")).toEqual(
      { fixed: ['Stealth', 'Survival'], choices: [], deitySkill: false, lores: [] },
    )
  })

  it('keeps a choice apart from what is trained outright', () => {
    expect(
      backgroundSkillText(
        'You’re trained in your choice of the Arcana, Nature, Occultism, or Religion skill, and the Academia Lore skill.',
      ),
    ).toEqual({
      fixed: ['Academia Lore'],
      choices: [{ options: ['Arcana', 'Nature', 'Occultism', 'Religion'], count: 1 }],
      deitySkill: false,
      lores: [],
    })
    expect(
      backgroundSkillText(
        "You're trained in your choice of either the Nature or the Occultism skill, as well as a Lore skill related to the terrain (such as Cave Lore or Desert Lore).",
      ),
    ).toEqual({
      fixed: [],
      choices: [{ options: ['Nature', 'Occultism'], count: 1 }],
      deitySkill: false,
      lores: ['Lore related to the terrain'],
    })
    expect(
      backgroundSkillText(
        "You're trained in the Society skill, and the Genealogy Lore skill or Heraldry Lore skill.",
      ).choices,
    ).toEqual([{ options: ['Genealogy Lore', 'Heraldry Lore'], count: 1 }])
  })

  it('counts "four of the following" and leaves "a skill of your choice" open', () => {
    expect(
      backgroundSkillText(
        "You're trained in four of the following: Plane of Air Lore, Plane of Earth Lore, Plane of Fire Lore, Plane of Metal Lore, Plane of Water Lore, or Plane of Wood Lore.",
      ).choices,
    ).toEqual([
      { options: expect.arrayContaining(['Plane of Air Lore', 'Plane of Wood Lore']), count: 4 },
    ])
    expect(
      backgroundSkillText(
        "You''re trained in the First World Lore skill and a skill of your choice.",
      ),
    ).toEqual({
      fixed: ['First World Lore'],
      choices: [{ options: [], count: 1 }],
      deitySkill: false,
      lores: [],
    })
  })

  it('leaves Lores the player names as one entry each (Reborn Soul)', () => {
    expect(
      backgroundSkillText(
        'You become trained in two Lore skills, which you and your GM choose from Lore skills associated with your past life.',
      ).lores,
    ).toEqual([
      'Lore which you and your GM choose from Lore skills associated with your past life',
      'Lore which you and your GM choose from Lore skills associated with your past life',
    ])
  })

  it('flags the deity’s skill for the builder to fill in (Raised by Belief)', () => {
    expect(
      backgroundSkillText(
        'You’re trained in your deity’s associated skill, and you gain Assurance with that skill.',
      ),
    ).toEqual({ fixed: [], choices: [], deitySkill: true, lores: [] })
  })
})

describe('setting archetypes', () => {
  const doc = (name: string, primary_source: string, release_date = '2025-01-01'): AonDoc => ({
    id: name,
    category: 'archetype',
    name,
    primary_source,
    release_date,
  })
  const closed = closedArchetypes(
    [
      doc('Vigilante', 'Player Core 2'),
      doc('Hellknight', 'Hellfire Dispatches'),
      doc('Aldori Duelist', 'Battlecry!'),
      doc('Shadowdancer', "Advanced Player's Guide", '2020-08-01'),
      doc('Archer', "Advanced Player's Guide", '2020-08-01'),
      doc('Archer', 'Player Core 2'),
    ],
    [],
  )

  it('judges each archetype by its own newest record: book, then name', () => {
    expect([...closed].sort()).toEqual(['Aldori Duelist', 'Hellknight', 'Shadowdancer'])
  })

  it('drops only feats that belong to closed archetypes alone', () => {
    const feat = (trait: string[], archetype: string[]) =>
      ({ id: 'f', category: 'feat', name: 'F', trait, archetype }) as AonDoc
    expect(closedArchetypeFeat(feat(['Archetype'], ['Hellknight']), closed)).toBe(true)
    expect(closedArchetypeFeat(feat(['Archetype'], ['Hellknight', 'Vigilante']), closed)).toBe(
      false,
    )
    expect(closedArchetypeFeat(feat(['Druid'], ['Hellknight']), closed)).toBe(false)
  })

  it('takes closed archetypes off the Archetype lines of the feats that stay', () => {
    const md = [
      '**Archetypes** Vigilante (Level 4), Red Mantis Assassin (Level 4), Aldori Duelist (Level 4)',
      '**Archetype** Hellknight (Level 8)',
      '**Source** Player Core pg. 1',
    ].join('\n')
    const out = withoutArchetypes(md, new Set([...closed, 'Red Mantis Assassin']))
    expect(out).toBe('**Archetype** Vigilante (Level 4)\n**Source** Player Core pg. 1')
    expect(orcProblems(md, new Set(), closed)).toHaveLength(2)
    expect(orcProblems(out, new Set(), closed)).toEqual([])
  })
})
