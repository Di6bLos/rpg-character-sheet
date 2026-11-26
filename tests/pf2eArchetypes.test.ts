import { describe, expect, it } from 'vitest'
import type { Pf2eLevelInput, Pf2eSheet } from '../types/sheets'
import { restoreLevel } from '../utils/levelHistory'
import {
  applyArchetypeCasting,
  archetypeSlots,
  dedicationCasting,
  psiCantrips,
  dedicationLock,
  featSkills,
  grantedFeat,
  heroArchetypes,
} from '../utils/pf2eArchetypes'
import { buildPf2eSheet, featEntry } from '../utils/pf2eBuild'
import { featRules, ownEffects } from '../utils/pf2eEffects'
import {
  applyPf2eLevel,
  featPrerequisites,
  levelFeatOptions,
  levelSpellOptions,
  pf2eLevelPlan,
  profileAt,
  weaponRankIn,
} from '../utils/pf2eLevelUp'
import { autoCreation, autoLevelPicks, buildData as data, named } from './helpers/pf2e'

const feat = (name: string) => named(data.feats, name)
const cls = (name: string) => named(data.classes, name)
const longsword = named(data.weapons, 'Longsword')

/**
 * A human of the class from `autoCreation`, Strength and Dexterity +2 for the fighter archetype,
 * untrained in Acrobatics and Athletics.
 */
function hero(className: string, freeArchetype = false): Pf2eSheet {
  const c = autoCreation(cls(className))
  const spare = ['Thievery', 'Stealth', 'Society'].filter((x) => !c.skills.includes(x))
  c.skills = c.skills.map((x) => (x === 'Acrobatics' || x === 'Athletics' ? spare.shift()! : x))
  c.ancestryBoosts = ['STR', 'DEX']
  c.freeBoosts = [c.keyAttribute, ...(['STR', 'DEX', 'CON', 'INT'] as const)]
    .filter((a, i, all) => all.indexOf(a) === i)
    .slice(0, 4)
  return buildPf2eSheet({ ...c, freeArchetype }, data)
}

/** The first valid picks, with these feats in their slots and these choices made. */
function level(
  s: Pf2eSheet,
  to: number,
  feats: Record<string, string> = {},
  choices: Record<string, string[]> = {},
  spells: Record<string, string[]> = {},
) {
  const picks: Pf2eLevelInput = autoLevelPicks(s, to, data)
  picks.feats = { ...picks.feats, ...feats }
  picks.choices = { ...picks.choices, ...choices }
  const plan = pf2eLevelPlan(s, to, data, picks)!
  for (const c of plan.choices)
    if (!picks.choices[c.key]) picks.choices[c.key] = c.options.slice(0, c.count).map((o) => o.id)
  for (const sp of plan.spells)
    if (!picks.spells[sp.key] && !sp.optional)
      picks.spells[sp.key] = data.spells
        .filter(
          (x) =>
            x.traditions.includes(sp.tradition ?? '') &&
            (sp.cantrip ? x.kind === 'cantrip' : x.kind === 'spell' && x.rank === sp.rank),
        )
        .slice(0, sp.count)
        .map((x) => x.id)
  Object.assign(picks.spells, spells)
  applyPf2eLevel(s, to, picks, data)
  return { picks, plan }
}

describe('pf2e archetypes: the dedication rule (Player Core p. 215)', () => {
  it('opens dedications in class slots from 2nd level, never your own multiclass one', () => {
    const s = hero('Wizard')
    const names = levelFeatOptions('class', s, 2, data).map((f) => f.name)
    expect(names).toContain('Fighter Dedication')
    expect(names).not.toContain('Wizard Dedication')
    expect(levelFeatOptions('class', s, 2, data).some((f) => f.traits.includes('Mythic'))).toBe(
      false,
    )
  })

  it('locks other dedications until two more feats of the archetype', () => {
    const s = hero('Wizard')
    level(
      s,
      2,
      { class: feat('Fighter Dedication').id },
      { 'skill:Fighter Dedication': ['Athletics'] },
    )
    expect(heroArchetypes(s.feats).map((a) => a.name)).toEqual(['Fighter'])
    expect(dedicationLock(s, data)).toEqual({ archetype: 'Fighter', have: 0 })
    const rogue = feat('Rogue Dedication')
    expect(featPrerequisites(rogue, s, data).unmet).toEqual([
      '2 more Fighter archetype feats before another dedication',
    ])
    // The fighter archetype's feats are open now; Basic Maneuver grants a fighter feat.
    expect(levelFeatOptions('class', s, 4, data).map((f) => f.name)).toContain('Basic Maneuver')
    level(s, 3)
    level(s, 4, { class: feat('Basic Maneuver').id, 'class:grant': feat('Sudden Charge').id })
    expect(dedicationLock(s, data)).toEqual({ archetype: 'Fighter', have: 1 })
    expect(s.feats.find((f) => f.name === 'Sudden Charge')).toMatchObject({
      archetype: 'Fighter',
      via: 'Basic Maneuver',
      type: 'Fighter feat',
    })
    level(s, 5)
    level(s, 6, { class: feat('Fighter Resiliency').id })
    expect(dedicationLock(s, data)).toBeNull()
    expect(featPrerequisites(rogue, s, data).unmet).toEqual([])
    // A dedication picked in another slot this level locks the rest.
    expect(featPrerequisites(rogue, s, data, [feat('Wizard Dedication').id]).unmet).toHaveLength(1)
  })

  it('reads the feats that grant a feat (p. 215)', () => {
    expect(grantedFeat(feat('Basic Maneuver'), 4, ['Fighter'])).toEqual({
      className: 'Fighter',
      maxLevel: 2,
      from: 'Basic Maneuver',
    })
    // Advanced Arcana: a wizard feat, "your wizard level is equal to half your character level".
    expect(grantedFeat(feat('Advanced Arcana'), 10, ['Wizard'])).toMatchObject({ maxLevel: 5 })
  })
})

describe('pf2e archetypes: Fighter Dedication on a wizard (Player Core p. 219)', () => {
  it('trains martial weapons and Acrobatics or Athletics', () => {
    const s = hero('Wizard')
    expect(weaponRankIn(profileAt(s, 1, data)!, longsword)).toBe('U')
    const plan = pf2eLevelPlan(s, 2, data, {
      ...autoLevelPicks(s, 2, data),
      feats: { ...autoLevelPicks(s, 2, data).feats, class: feat('Fighter Dedication').id },
    })!
    expect(plan.proficiencies).toContainEqual({ label: 'Martial weapons', from: 'U', to: 'T' })
    expect(plan.choices.find((c) => c.key === 'skill:Fighter Dedication')?.options).toEqual([
      { id: 'Acrobatics', name: 'Acrobatics' },
      { id: 'Athletics', name: 'Athletics' },
    ])
    level(
      s,
      2,
      { class: feat('Fighter Dedication').id },
      { 'skill:Fighter Dedication': ['Athletics'] },
    )
    expect(weaponRankIn(profileAt(s, 2, data)!, longsword)).toBe('T')
    expect(s.skills.find((x) => x.name === 'Athletics')?.rank).toBe('T')
    expect(s.feats.find((f) => f.name === 'Fighter Dedication')).toMatchObject({
      archetype: 'Fighter',
      dedication: true,
      type: 'Class feat',
    })
  })

  it('reads every dedication skill line', () => {
    expect(featSkills(feat('Fighter Dedication'))).toMatchObject({
      fixed: [],
      oneOf: ['Acrobatics', 'Athletics'],
      unnamed: 0,
    })
    expect(featSkills(feat('Bard Dedication'))).toMatchObject({
      fixed: ['Occultism', 'Performance'],
      unnamed: 0,
    })
    expect(featSkills(feat('Cleric Dedication'))).toMatchObject({ fixed: ['Religion'], unnamed: 1 })
    expect(featSkills(feat('Sorcerer Dedication'))).toMatchObject({ fixed: [], unnamed: 2 })
    expect(featSkills(feat('Rogue Dedication'))).toMatchObject({
      oneOf: ['Stealth', 'Thievery'],
      unnamed: 1,
    })
    expect(featSkills(feat('Investigator Dedication'))).toMatchObject({
      fixed: ['Society'],
      unnamed: 1,
    })
    // "For each of those skills that you're already trained in…" is a fallback, not a skill.
    expect(featSkills(feat('Summoner Dedication'))).toMatchObject({ fixed: [], unnamed: 0 })
  })
})

describe('pf2e archetypes: Wizard Dedication and Basic Wizard Spellcasting (Player Core p. 223)', () => {
  it('reads the spellcasting a dedication grants', () => {
    const attrs = { STR: 0, DEX: 0, CON: 0, INT: 2, WIS: 0, CHA: 3 }
    // "a spellbook with four common arcane cantrips … You can prepare two cantrips each day".
    expect(dedicationCasting(feat('Wizard Dedication'), attrs)).toEqual({
      archetype: 'Wizard',
      tradition: 'Arcane',
      attr: 'INT',
      kind: 'prepared',
      cantrips: 2,
    })
    for (const name of ['Magus Dedication', 'Necromancer Dedication'])
      expect(dedicationCasting(feat(name), attrs)?.cantrips, name).toBe(2)
    expect(dedicationCasting(feat('Bard Dedication'), attrs)).toMatchObject({
      tradition: 'Occult',
      kind: 'spontaneous',
      cantrips: 2,
    })
    // The sorcerer's tradition is its bloodline's: the player picks it.
    expect(dedicationCasting(feat('Sorcerer Dedication'), attrs)).not.toHaveProperty('tradition')
    // A psychic casts with the attribute it qualified with, the higher of the two.
    expect(dedicationCasting(feat('Psychic Dedication'), attrs)?.attr).toBe('CHA')
    expect(dedicationCasting(feat('Fighter Dedication'), attrs)).toBeNull()
  })

  it('gives one slot of ranks 1, 2 and 3 at 4th, 6th and 8th, then 4–6 and 7–8 (p. 215)', () => {
    expect(archetypeSlots(4, ['basic']).slice(0, 3)).toEqual([1, 0, 0])
    expect(archetypeSlots(6, ['basic']).slice(0, 3)).toEqual([1, 1, 0])
    expect(archetypeSlots(10, ['basic']).slice(0, 4)).toEqual([1, 1, 1, 0])
    expect(archetypeSlots(12, ['basic', 'expert']).slice(0, 7)).toEqual([1, 1, 1, 1, 0, 0, 0])
    expect(archetypeSlots(16, ['basic', 'expert']).slice(0, 7)).toEqual([1, 1, 1, 1, 1, 1, 0])
    expect(archetypeSlots(20, ['basic', 'expert', 'master'])).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 0, 0,
    ])
  })

  it('a fighter with the free archetype: two cantrips, then a slot and two spells each new rank', () => {
    const s = hero('Fighter', true)
    expect(s.attrs.INT).toBeGreaterThanOrEqual(2)
    const { plan } = level(s, 2, { archetype: feat('Wizard Dedication').id })
    expect(plan.feats.map((f) => f.kind)).toEqual(['class', 'skill', 'archetype'])
    expect(plan.spells).toContainEqual(
      expect.objectContaining({ key: 'arch:Wizard:cantrip', count: 2, cantrip: true }),
    )
    const casting = () => s.archetypeCasting!.find((e) => e.archetype === 'Wizard')!
    expect(casting()).toMatchObject({
      tradition: 'Arcane',
      attr: 'INT',
      kind: 'prepared',
      rank: 'T',
    })
    expect(casting().cantrips).toHaveLength(2)
    expect(s.skills.find((x) => x.name === 'Arcana')?.rank).toBe('T')
    level(s, 3)
    const four = level(s, 4, { archetype: feat('Basic Wizard Spellcasting').id }).plan
    expect(four.slots).toContainEqual({ rank: 1, from: 0, to: 1, archetype: 'Wizard' })
    expect(four.spells).toContainEqual(
      expect.objectContaining({ key: 'arch:Wizard:rank1', count: 2, rank: 1 }),
    )
    const slots = () => casting().slots.map((r) => r.max)
    expect(slots().slice(0, 3)).toEqual([1, 0, 0])
    expect(casting().slots[0]!.prepared).toHaveLength(1)
    level(s, 5)
    level(s, 6)
    expect(slots().slice(0, 3)).toEqual([1, 1, 0])
    level(s, 7)
    level(s, 8)
    expect(slots().slice(0, 3)).toEqual([1, 1, 1])
    expect(casting().spells.map((x) => x.rank)).toEqual([1, 1, 2, 2, 3, 3])
    // The fighter's own class has no spellcasting; the archetype's stays apart.
    expect(s.spellcasting).toBeUndefined()
  })
})

describe('pf2e archetypes: the free archetype variant (GM Core p. 84)', () => {
  it('adds an archetype feat slot at 2nd and every even level', () => {
    const count = (on: boolean) => {
      const s = hero('Fighter', on)
      return Array.from({ length: 19 }, (_, i) => pf2eLevelPlan(s, i + 2, data)!)
        .flatMap((p) => p.feats)
        .filter((f) => f.kind === 'archetype').length
    }
    expect(count(true)).toBe(10)
    expect(count(false)).toBe(0)
    const s = hero('Fighter')
    const plan = pf2eLevelPlan(s, 2, data, { ...autoLevelPicks(s, 2, data), freeArchetype: true })!
    expect(plan.feats.map((f) => f.key)).toContain('archetype')
    expect(
      levelFeatOptions(plan.feats.at(-1)!, s, 2, data).every((f) =>
        f.traits.includes('Dedication'),
      ),
    ).toBe(true)
  })
})

describe('pf2e archetypes: archetype feats on the sheet', () => {
  /** A wizard with Fighter Dedication at 2nd and these fighter archetype feats at `at`. */
  function withFeats(names: string[], at = 12) {
    const s = hero('Wizard')
    level(s, 2, { class: feat('Fighter Dedication').id })
    for (const n of names)
      s.feats.push({ ...featEntry('Class feat', feat(n), at), archetype: 'Fighter' })
    return s
  }

  it('reads their actions and effects like any feat', () => {
    // Reactive Striker (Player Core p. 219) grants the Reactive Strike reaction it embeds.
    const s = withFeats(['Reactive Striker'], 4)
    const rs = featRules(s.feats.find((f) => f.name === 'Reactive Striker')!)
    expect(rs.embedded.map((e) => [e.name, e.cost?.kind])).toEqual([
      ['Reactive Strike', 'reaction'],
    ])
    // Barbarian Dedication (Player Core 2 p. 176) lets the hero Rage: its toggle is offered.
    const b = hero('Fighter')
    b.feats.push({
      ...featEntry('Class feat', feat('Barbarian Dedication'), 2),
      archetype: 'Barbarian',
      dedication: true,
    })
    expect(ownEffects(b).map((e) => e.name)).toContain('Rage')
  })

  it('Diverse Weapon Expert raises simple and martial weapons to expert (Player Core p. 219)', () => {
    const s = withFeats(['Diverse Weapon Expert'])
    expect(weaponRankIn(profileAt(s, 11, data)!, longsword)).toBe('T')
    expect(weaponRankIn(profileAt(s, 12, data)!, longsword)).toBe('E')
  })
})

describe('pf2e archetypes: going back', () => {
  it('restoreLevel undoes a dedication, its training and its spellcasting', () => {
    const s = hero('Fighter', true)
    level(s, 2, { archetype: feat('Wizard Dedication').id })
    level(s, 3)
    const before = structuredClone(s)
    const { picks } = level(s, 4, { archetype: feat('Basic Wizard Spellcasting').id })
    expect(s.levelHistory?.find((e) => e.level === 4)?.pf2e).toEqual(picks)
    expect(restoreLevel(s, 3)).toBe(true)
    expect(s).toEqual(before)
    expect(restoreLevel(s, 1)).toBe(true)
    expect(s.archetypeCasting).toBeUndefined()
    expect(s.feats.some((f) => f.archetype)).toBe(false)
  })
})

describe('pf2e archetypes: review fixes (Player Core p. 215)', () => {
  it('offers Psychic Dedication only the standard psi cantrips (Dark Archive p. 9)', () => {
    const psi = psiCantrips(cls('Psychic'))
    expect(psi).toEqual(expect.arrayContaining(['Telekinetic Hand', 'Telekinetic Projectile']))
    const s = hero('Fighter', true)
    s.attrs.CHA = 2
    s.attrs.INT = 2
    const picks = autoLevelPicks(s, 2, data)
    picks.feats.archetype = feat('Psychic Dedication').id
    const plan = pf2eLevelPlan(s, 2, data, picks)!
    const pick = plan.spells.find((x) => x.key === 'arch:Psychic:cantrip')!
    expect(pick).toMatchObject({ count: 1, cantrip: true, only: psi })
    applyPf2eLevel(s, 2, { ...picks, spells: {} }, data)
    const names = levelSpellOptions(pick, s, data).map((x) => x.name)
    expect(names.length).toBeGreaterThan(0)
    expect(names.every((n) => psi.includes(n))).toBe(true)
  })

  it('keeps a repertoire spell learned again at a higher rank (Player Core 2 p. 144)', () => {
    const s = hero('Fighter')
    const fear = named(data.spells, 'Fear')
    s.archetypeCasting = [
      {
        archetype: 'Sorcerer',
        tradition: 'Occult',
        kind: 'spontaneous',
        attr: 'CHA',
        rank: 'T',
        cantrips: [],
        spells: [{ id: fear.id, name: fear.name, rank: 1 }],
        slots: [],
      },
    ]
    const pick = {
      key: 'arch:Sorcerer:rank3',
      label: '',
      count: 1,
      rank: 3,
      learnAt: 3,
      archetype: 'Sorcerer',
    }
    applyArchetypeCasting(
      s,
      { slots: [], spells: [pick] },
      { boosts: [], feats: {}, skills: [], spells: { [pick.key]: [fear.id] }, choices: {} },
      data,
      [],
    )
    expect(s.archetypeCasting[0]!.spells.map((x) => [x.name, x.rank])).toEqual([
      ['Fear', 1],
      ['Fear', 3],
    ])
  })

  it('asks a spontaneous archetype for a signature spell at 6th (p. 215)', () => {
    const s = hero('Fighter', true)
    s.attrs.CHA = 2
    level(s, 2, { archetype: feat('Bard Dedication').id })
    level(s, 3)
    level(s, 4, { archetype: feat('Basic Bard Spellcasting').id })
    level(s, 5)
    const bard = () => s.archetypeCasting!.find((e) => e.archetype === 'Bard')!
    expect(bard().spells.length).toBeGreaterThan(0)
    const plan = pf2eLevelPlan(s, 6, data, autoLevelPicks(s, 6, data))!
    const choice = plan.choices.find((c) => c.key === 'signature:Bard')
    expect(choice).toMatchObject({ count: 1 })
    level(s, 6)
    expect(bard().spells.filter((x) => x.signature)).toHaveLength(1)
    expect(pf2eLevelPlan(s, 7, data)!.choices.some((c) => c.key.startsWith('signature:'))).toBe(
      false,
    )
  })
})
