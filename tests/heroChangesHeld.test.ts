import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import { build } from '~/utils/nimbleAutoBuild'

type Row = { id: string; [key: string]: unknown }

const waiting: Record<string, Row[]> = {}
const deleted: string[] = []
let onDelete: (() => void) | null = null

function claim(table: string, ids: string[]) {
  const rows = waiting[table] ?? []
  const data = rows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id }))
  waiting[table] = rows.filter((r) => !ids.includes(r.id))
  deleted.push(...data.map((r) => r.id))
  return { data, error: null }
}

const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => {
        const read = { data: [...(waiting[table] ?? [])] }
        return Object.assign(Promise.resolve(read), { order: () => Promise.resolve(read) })
      },
    }),
    delete: () => ({
      in: (_column: string, ids: string[]) => {
        onDelete?.()
        const done = Promise.resolve(claim(table, ids))
        return Object.assign(done, { select: () => done })
      },
    }),
  }),
  channel: () => {
    const channel = {
      on: () => channel,
      subscribe: (status?: (s: string) => void) => {
        status?.('SUBSCRIBED')
        return channel
      },
    }
    return channel
  },
  removeChannel: vi.fn(),
}

vi.mock('~/lib/supabase', () => ({ supabase }))

const { useHeroHpChanges } = await import('~/composables/useHeroHpChanges')
const { useHeroConditionChanges } = await import('~/composables/useHeroConditionChanges')
const { useHeroEffects } = await import('~/composables/useHelpAlly')

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

let sheet: NimbleSheet
const held = ref(false)

beforeEach(() => {
  sheet = build(classBySlug('berserker')!)
  held.value = true
  deleted.length = 0
  onDelete = null
  waiting.hero_hp_changes = [{ id: 'hp1', amount: -3, crit: false, created_at: '1' }]
  waiting.hero_condition_changes = [{ id: 'c1', condition: 'Prone', add: true, created_at: '1' }]
  waiting.hero_effects = [{ id: 'e1', effect: 'Helped', from_name: 'Wren' }]
  const editor = {
    draft: ref({ id: 'hero', system: 'nimble', level: 1, sheet }),
    canEdit: ref(true),
    held,
    say: vi.fn(),
  }
  const globals: Record<string, unknown> = {
    ref,
    watch,
    useSheet: () => editor,
    onMounted: (fn: () => void) => fn(),
    onBeforeUnmount: vi.fn(),
  }
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
})

afterEach(() => vi.unstubAllGlobals())

describe('GM changes while the sheet holds its saves (Reconfigure)', () => {
  it('leaves HP, condition and Helped rows on the server, then applies them once released', async () => {
    const hp = sheet.hp
    useHeroHpChanges()
    useHeroConditionChanges()
    useHeroEffects()
    await settle()
    expect(deleted).toEqual([])
    expect(sheet.hp).toBe(hp)
    expect(sheet.conditions).toEqual([])

    held.value = false
    await settle()
    expect(deleted.sort()).toEqual(['c1', 'e1', 'hp1'])
    expect(sheet.hp).toBe(hp - 3)
    expect(sheet.conditions).toEqual(expect.arrayContaining(['Prone', 'Helped']))
  })

  it.each([
    ['HP', 'hp1', () => useHeroHpChanges()],
    ['condition', 'c1', () => useHeroConditionChanges()],
  ])(
    'a %s change claimed just as Reconfigure starts waits for the release, not lost to the hold',
    async (_kind, id, listen) => {
      held.value = false
      onDelete = () => {
        held.value = true
      }
      const hp = sheet.hp
      listen()
      await settle()
      expect(deleted).toEqual([id])
      expect(sheet.hp).toBe(hp)
      expect(sheet.conditions).toEqual([])

      onDelete = null
      held.value = false
      await settle()
      if (id === 'hp1') expect(sheet.hp).toBe(hp - 3)
      else expect(sheet.conditions).toContain('Prone')
    },
  )
})
