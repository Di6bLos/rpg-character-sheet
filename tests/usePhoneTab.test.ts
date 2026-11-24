import { nextTick, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhoneRole } from '~/utils/boardLayout'

const KEY = 'lantern-battle-phone-tab'
let store: Record<string, string> = {}

/** Loads the composable fresh, with Nuxt's auto-imports stubbed. */
async function setup(role: PhoneRole, scribe = false, saved?: string) {
  if (saved) store[KEY] = saved
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('watch', watch)
  const { usePhoneTab } = await import('~/composables/usePhoneTab')
  const r = ref<PhoneRole>(role)
  const s = ref(scribe)
  return { r, s, tab: usePhoneTab(r, s) }
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('usePhoneTab', () => {
  it('starts a player on their saved chat tab', async () => {
    const { tab } = await setup('player', false, 'chat')
    expect(tab.value).toBe('chat')
  })

  it('starts on the role default without a saved tab', async () => {
    const { tab } = await setup('player')
    expect(tab.value).toBe('actions')
  })

  it('restores the saved tab on watcher to player and does not save the fallback', async () => {
    const { r, tab } = await setup('watcher', false, 'hero')
    expect(tab.value).toBe('party')
    r.value = 'player'
    await nextTick()
    expect(tab.value).toBe('hero')
    expect(store[KEY]).toBe('hero')
  })

  it('does not save the fallback when nothing was picked', async () => {
    const { r, tab } = await setup('watcher')
    r.value = 'player'
    await nextTick()
    expect(tab.value).toBe('actions')
    expect(store[KEY]).toBeUndefined()
  })

  it('saves a pick', async () => {
    const { tab } = await setup('player')
    tab.value = 'party'
    expect(store[KEY]).toBe('party')
  })

  it('falls back without overwriting the saved pick when Scribe goes away', async () => {
    const { s, tab } = await setup('player', true, 'scribe')
    expect(tab.value).toBe('scribe')
    s.value = false
    await nextTick()
    expect(tab.value).toBe('actions')
    expect(store[KEY]).toBe('scribe')
    s.value = true
    await nextTick()
    expect(tab.value).toBe('scribe')
  })

  it('survives a throwing localStorage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const { tab } = await setup('player')
    expect(tab.value).toBe('actions')
    expect(() => {
      tab.value = 'chat'
    }).not.toThrow()
    expect(tab.value).toBe('chat')
  })
})
