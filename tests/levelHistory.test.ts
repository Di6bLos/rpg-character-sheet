import { describe, expect, it } from 'vitest'
import type { NimbleLevelInput } from '~/types/sheets'
import { classBySlug } from '~/data/nimble/classes'
import { holdAndRebuild, keepDamage, restoreLevel } from '~/utils/levelHistory'
import { applyNimbleLevel } from '~/utils/nimbleBuild'
import { build, levelTo } from './helpers/nimble'

function reconfigure(target: number, inputs: (level: number) => NimbleLevelInput) {
  const sheet = build(classBySlug('berserker')!)
  levelTo(sheet, 6, 'mountainheart')
  sheet.hp = sheet.hpMax - 7
  sheet.tempHp = 3
  const before = { hp: sheet.hp, hpMax: sheet.hpMax }
  const recorded = Object.fromEntries(sheet.levelHistory!.map((e) => [e.level, e.nimble!]))
  restoreLevel(sheet, target)
  for (let level = target + 1; level <= 6; level++)
    applyNimbleLevel(sheet, level, { ...recorded[level]!, ...inputs(level) })
  return { sheet, before }
}

describe('HP through a Reconfigure', () => {
  it('a level-up keeps the damage taken and going back caps HP at the lower max', () => {
    const sheet = build(classBySlug('berserker')!)
    levelTo(sheet, 4, 'mountainheart')
    const input = sheet.levelHistory!.find((e) => e.level === 4)!.nimble!
    restoreLevel(sheet, 3)
    const max = sheet.hpMax
    sheet.hp = max - 4
    applyNimbleLevel(sheet, 4, input)
    expect(sheet.hpMax).toBeGreaterThan(max)
    expect(sheet.hpMax - sheet.hp).toBe(4)
    sheet.hp = sheet.hpMax - 1
    restoreLevel(sheet, 3)
    expect(sheet.hp).toBe(max)
  })

  it('stepping down and back up alone would heal the hero', () => {
    const { sheet, before } = reconfigure(2, () => ({}) as NimbleLevelInput)
    expect(sheet.hpMax).toBe(before.hpMax)
    expect(sheet.hp).toBe(sheet.hpMax)
  })

  it('keeps the damage taken, and temp HP, when the run finishes', () => {
    const { sheet, before } = reconfigure(2, () => ({}) as NimbleLevelInput)
    keepDamage(sheet, before)
    expect(sheet.hp).toBe(before.hp)
    expect(sheet.tempHp).toBe(3)
  })

  it('keeps the damage against a new max when the HP gains change', () => {
    const { sheet, before } = reconfigure(2, () => ({ hpGain: 1 }) as NimbleLevelInput)
    keepDamage(sheet, before)
    expect(sheet.hpMax).toBe(before.hpMax - 4 * (5 - 1))
    expect(sheet.hp).toBe(sheet.hpMax - 7)
  })

  it('a conscious hero whose max drops below the damage stays up at 1 HP', () => {
    const sheet = { hp: 35, hpMax: 35 } as Parameters<typeof keepDamage>[0]
    keepDamage(sheet, { hp: 3, hpMax: 40 })
    expect(sheet.hp).toBe(1)
  })

  it('a hero at 0 HP stays at 0 when the max goes up', () => {
    const sheet = { hp: 40, hpMax: 44 } as Parameters<typeof keepDamage>[0]
    keepDamage(sheet, { hp: 0, hpMax: 40 })
    expect(sheet.hp).toBe(0)
  })
})

describe('starting a Reconfigure', () => {
  function hero() {
    const sheet = build(classBySlug('berserker')!)
    levelTo(sheet, 4, 'mountainheart')
    return { level: 4, sheet }
  }

  it('holds saves and hands back the hero as it was before the rebuild', () => {
    const draft = hero()
    const before = JSON.stringify(draft.sheet)
    const held = { value: false }
    const saved = holdAndRebuild(draft, held, (sheet) => restoreLevel(sheet, 2))
    expect(held.value).toBe(true)
    expect(JSON.stringify(saved.sheet)).toBe(before)
    expect(saved.level).toBe(4)
    expect(draft.sheet.levelHistory!.every((e) => e.level <= 2)).toBe(true)
  })

  it('a rebuild that throws releases saves and puts the hero back, then passes the error on', () => {
    const draft = hero()
    const before = JSON.stringify(draft.sheet)
    const held = { value: false }
    expect(() =>
      holdAndRebuild(draft, held, (sheet) => {
        restoreLevel(sheet, 2)
        throw new Error('broken class data')
      }),
    ).toThrow('broken class data')
    expect(held.value).toBe(false)
    expect(draft.level).toBe(4)
    expect(JSON.stringify(draft.sheet)).toBe(before)
  })
})
