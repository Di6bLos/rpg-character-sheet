import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, inject, nextTick, ref, toRaw, watch } from 'vue'
import type { Character } from '~/types'
import type { AnySheet, Pf2eSheet } from '~/types/sheets'
import { jsonKey } from '~/utils/jsonKey'
import { pendingSaves } from '~/utils/pendingSaves'
import { acParts } from '~/utils/pf2ePlay'
import { defaultSheet } from '~/utils/sheetDefaults'

vi.mock('~/stores/character', () => ({ portraitUrl: () => null }))

const { provideSheetEditor } = await import('~/composables/useSheetEditor')

const store = { save: vi.fn(() => Promise.resolve()) }
const auth: { profile: { own_dice: boolean } | null } = { profile: null }

function hero(): Character<AnySheet> {
  return {
    id: 'hero',
    name: 'Bram',
    level: 5,
    system: 'pf2e',
    portrait_path: null,
    sheet: { ...defaultSheet('pf2e'), hp: 20, hpMax: 20, xp: 0, xpNext: 1000 },
  } as unknown as Character<AnySheet>
}

function editor() {
  return provideSheetEditor(hero(), { canEdit: true, campaignName: '' })
}

const savedLevels = () =>
  store.save.mock.calls.map((c) => (c as unknown as [string, { level: number }])[1].level)

beforeEach(() => {
  vi.useFakeTimers()
  store.save.mockClear()
  auth.profile = null
  const globals: Record<string, unknown> = {
    ref,
    computed,
    watch,
    toRaw,
    inject,
    provide: vi.fn(),
    onBeforeUnmount: vi.fn(),
    useCharacterStore: () => store,
    useSnackbarStore: () => ({ error: vi.fn(), show: vi.fn() }),
    useAuthStore: () => auth,
    useCampaignEncounter: () => ({
      mode: ref(null),
      seated: ref(null),
      hero: ref(null),
      turnCharacterId: ref(null),
      round: ref(null),
    }),
    sheetSaves: pendingSaves(),
  }
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sheet editor saves', () => {
  it('saveNow persists a change made just before it, without waiting for autosave', async () => {
    const e = editor()
    e.draft.value.level = 6
    await e.saveNow()
    expect(savedLevels()).toEqual([6])
  })

  it('saves nothing while held, autosave included, then the final state once released', async () => {
    const e = editor()
    e.held.value = true
    e.draft.value.level = 2
    await e.saveNow()
    await nextTick()
    e.draft.value.level = 3
    await e.saveNow()
    await nextTick()
    vi.advanceTimersByTime(5000)
    await Promise.resolve()
    expect(store.save).not.toHaveBeenCalled()

    e.draft.value.level = 5
    e.held.value = false
    await e.saveNow()
    expect(savedLevels()).toEqual([5])
  })
})

describe('opening a sheet saves nothing unless something changed', () => {
  async function settled(e: ReturnType<typeof editor>) {
    await nextTick()
    vi.advanceTimersByTime(5000)
    await e.save()
    return e
  }

  const opened = (character: Character<AnySheet>) =>
    settled(provideSheetEditor(character, { canEdit: true, campaignName: '' }))

  it('PF2e: the AC parts saved with the keys in jsonb order are not rewritten', async () => {
    const pf2e = hero()
    const sheet = pf2e.sheet as Pf2eSheet
    sheet.feats = [
      {
        id: 'feat-4916',
        name: 'Nimble Dodge',
        type: 'Class feat',
        level: '1',
        action: '↺',
        traits: ['Rogue'],
        desc: 'You deftly dodge out of the way, gaining a +2 circumstance bonus to AC against the triggering attack.',
      },
    ]
    sheet.effects = { on: ['Nimble Dodge'], given: [] }
    sheet.acParts = {
      mods: [{ type: 'circumstance', value: 2, source: 'Nimble Dodge' }],
      given: {},
    }
    expect(jsonKey(acParts(sheet))).toBe(jsonKey(sheet.acParts))
    expect(JSON.stringify(acParts(sheet))).not.toBe(JSON.stringify(sheet.acParts))

    const e = await opened(pf2e)
    expect(store.save).not.toHaveBeenCalled()
    expect(e.dirty.value).toBe(false)
  })

  it('5e: Manual dice off on the profile leaves a sheet without ownDice as it was', async () => {
    auth.profile = { own_dice: false }
    const dnd5e = {
      ...hero(),
      system: 'dnd5e',
      sheet: { ...defaultSheet('dnd5e'), hp: 20, hpMax: 20, xp: 0, xpNext: 1000 },
    } as unknown as Character<AnySheet>
    delete (dnd5e.sheet as { ownDice?: boolean }).ownDice

    const e = await opened(dnd5e)
    expect(store.save).not.toHaveBeenCalled()
    expect('ownDice' in e.draft.value.sheet).toBe(false)
  })

  it('a write of what the sheet already holds, keys in another order, saves nothing', async () => {
    const pf2e = hero()
    const sheet = pf2e.sheet as Pf2eSheet
    sheet.acParts = acParts(sheet)
    const e = await opened(pf2e)
    const { gp, sp, cp } = (e.draft.value.sheet as Pf2eSheet).coins
    ;(e.draft.value.sheet as Pf2eSheet).coins = { cp, sp, gp }
    await settled(e)
    expect(store.save).not.toHaveBeenCalled()
    expect(e.dirty.value).toBe(false)

    e.draft.value.sheet.hp = 19
    await e.saveNow()
    expect(store.save).toHaveBeenCalledTimes(1)
    await e.saveNow()
    expect(store.save).toHaveBeenCalledTimes(1)
  })
})

describe('jsonKey', () => {
  it('ignores key order and undefined properties, keeps array order', () => {
    expect(jsonKey({ a: 1, b: { c: [2, { d: 3, e: 4 }] } })).toBe(
      jsonKey({ b: { c: [2, { e: 4, d: 3 }] }, a: 1, f: undefined }),
    )
    expect(jsonKey([1, 2])).not.toBe(jsonKey([2, 1]))
    expect(jsonKey(null)).toBe('null')
  })
})
