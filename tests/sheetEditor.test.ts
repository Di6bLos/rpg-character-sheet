import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, inject, nextTick, ref, toRaw, watch } from 'vue'
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'
import { pendingSaves } from '~/utils/pendingSaves'

vi.mock('~/stores/character', () => ({ portraitUrl: () => null }))

const { provideSheetEditor } = await import('~/composables/useSheetEditor')

const store = { save: vi.fn(() => Promise.resolve()) }

function hero(): Character<AnySheet> {
  return {
    id: 'hero',
    name: 'Bram',
    level: 5,
    system: 'pf2e',
    portrait_path: null,
    sheet: { hp: 20, hpMax: 20, xp: 0, xpNext: 1000 },
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
    useAuthStore: () => ({ profile: null }),
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

    e.draft.value.level = 4
    e.held.value = false
    await e.saveNow()
    expect(savedLevels()).toEqual([4])
  })

  it('saves a change once: the autosave after saveNow skips the same sheet', async () => {
    const e = editor()
    e.draft.value.level = 6
    await e.saveNow()
    await nextTick()
    vi.advanceTimersByTime(5000)
    await Promise.resolve()
    expect(savedLevels()).toEqual([6])
    expect(e.dirty.value).toBe(false)

    e.draft.value.sheet.hp = 12
    await nextTick()
    vi.advanceTimersByTime(5000)
    await Promise.resolve()
    expect(savedLevels()).toEqual([6, 6])
  })
})
