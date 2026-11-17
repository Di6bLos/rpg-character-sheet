import { describe, expect, it } from 'vitest'
import { BESTIARY } from '~/data/nimble/bestiary'
import { NIMBLE_CLASSES } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import { RULES_PACK_LIMIT, buildRulesPack } from '~/utils/loreContext'
import { loreHtml } from '~/utils/loreText'
import {
  MAX_TURNS,
  cleanTurns,
  freeAgentError,
  gmContext,
  pickKeySource,
  serializeSheet,
} from '../supabase/functions/lore-master/context'
import { gmPrompt, playerPrompt } from '../supabase/functions/lore-master/prompt'

const cls = NIMBLE_CLASSES.find((c) => c.mana) ?? NIMBLE_CLASSES[0]!
const monsterName = BESTIARY[0]!.monsters[0]!.name

function sheet(): NimbleSheet {
  return {
    classSlug: cls.slug,
    subclassSlug: cls.subclasses[0]?.slug ?? '',
    ancestrySlug: 'human',
    backgroundSlug: '',
    spells: { schools: ['fire'], tier: 1, learned: [], lost: [], utility: [] },
  } as unknown as NimbleSheet
}

describe('buildRulesPack', () => {
  it('gives players their class, ancestry and spells, and no monster data', () => {
    const pack = buildRulesPack('nimble', 'player', sheet())
    expect(pack).toContain(`# Class: ${cls.name}`)
    expect(pack).toContain('# Ancestry:')
    expect(pack).toContain('Flame Dart')
    expect(pack).toContain('Conditions')
    expect(pack).not.toContain('Bestiary')
    expect(pack).not.toContain('Monster Builder')
    expect(pack).not.toContain(monsterName)
  })

  it('gives players core rules only without a character', () => {
    const pack = buildRulesPack('nimble', 'player', null)
    expect(pack).toContain('Heroic reactions')
    expect(pack).not.toContain('# Class:')
  })

  it('gives the GM the monster budgets and bestiary index', () => {
    const pack = buildRulesPack('nimble', 'gm')
    expect(pack).toContain('Monster Builder')
    expect(pack).toContain('Legendary monsters')
    expect(pack).toContain(monsterName)
  })

  it('stays within the size the function accepts', () => {
    for (const c of NIMBLE_CLASSES) {
      const s = { ...sheet(), classSlug: c.slug, subclassSlug: c.subclasses[0]?.slug ?? '' }
      expect(buildRulesPack('nimble', 'player', s).length).toBeLessThanOrEqual(RULES_PACK_LIMIT)
    }
    expect(buildRulesPack('nimble', 'gm').length).toBeLessThanOrEqual(RULES_PACK_LIMIT)
  })

  it('is empty for systems without transcribed data', () => {
    expect(buildRulesPack('dnd5e', 'gm')).toBe('')
    expect(buildRulesPack('pf2e', 'player', null)).toBe('')
  })
})

describe('lore-master context', () => {
  it('serializes a sheet without bookkeeping', () => {
    const text = serializeSheet({
      name: 'Ash',
      level: 3,
      system: 'nimble',
      sheet: { hp: 20, levelHistory: [{ a: 1 }], choices: { x: ['y'] }, notes: '', class: 'Mage' },
    })
    expect(text).toContain('Ash (level 3)')
    expect(text).toContain('"hp":20')
    expect(text).not.toContain('levelHistory')
    expect(text).not.toContain('choices')
    expect(text).not.toContain('notes')
  })

  it('keeps the last turns, starting with a user turn', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
    }))
    const turns = cleanTurns([
      ...many,
      { role: 'system', content: 'x' },
      { role: 'user', content: ' ' },
    ])
    expect(turns.length).toBeLessThanOrEqual(MAX_TURNS)
    expect(turns[0]?.role).toBe('user')
    expect(turns.at(-1)?.content).toBe('m29')
    expect(cleanTurns('nope')).toEqual([])
  })

  it('labels GM-only journal entries in the GM context', () => {
    const text = gmContext({
      campaign: { name: 'Test', system: 'nimble', pitch: null },
      roster: [],
      characters: [],
      npcs: [
        {
          name: 'Goblin King',
          kind: 'monster',
          level: '3',
          stat_block: {},
          gm_notes: 'Weak to fire',
        },
      ],
      journal: [
        {
          title: 'Secret',
          body: 'The duke is a lich',
          section: 'log',
          visibility: 'gm',
          created_at: '2026-11-01T00:00:00Z',
        },
        {
          title: 'Mira the fence',
          body: '',
          fields: {
            role: 'Fence',
            notes: 'Owes the party a favour',
            facts: [{ k: 'Weakness', v: 'Gold' }],
          },
          section: 'npc',
          visibility: 'party',
          created_at: '2026-11-02T00:00:00Z',
        },
      ],
    })
    expect(text).toContain('Role: Fence')
    expect(text).toContain('Owes the party a favour')
    expect(text).toContain('Weakness: Gold')
    expect(text).toContain('Goblin King')
    expect(text).toContain('Weak to fire')
    expect(text).toContain('GM only')
  })

  it('keeps players to rules and their own hero', () => {
    const prompt = playerPrompt('nimble', '### Ash (level 3)\n{}')
    expect(prompt).toContain('PLAYER')
    expect(prompt).toContain('Monsters and NPCs')
    expect(prompt).toContain('published adventure')
    expect(prompt).toContain('### Ash (level 3)')
    expect(prompt).not.toContain('<campaign_data>')
    expect(gmPrompt('dnd5e', 'Campaign: X')).toContain('<campaign_data>\nCampaign: X')
  })
})

describe('loreHtml', () => {
  it('escapes HTML before formatting', () => {
    const html = loreHtml('<img src=x onerror=alert(1)> **bold** and *it*')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>it</em>')
  })

  it('formats lists, headings and code', () => {
    const html = loreHtml('## Moves\n- one\n- two\n\n1. first\n\n```\n<b>x</b>\n```')
    expect(html).toBe(
      '<h4>Moves</h4><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>',
    )
  })

  it('leaves multiplication and snake_case alone', () => {
    expect(loreHtml('2 * 3 * 4 and my_var_name')).toBe('<p>2 * 3 * 4 and my_var_name</p>')
  })
})

describe('free agent', () => {
  const base = { hasOwnKey: false, requestedProvider: null, freeEnabled: true, freeKeySet: true }

  it("uses the user's own key whenever they have one", () => {
    expect(pickKeySource({ ...base, hasOwnKey: true })).toBe('own')
    expect(pickKeySource({ ...base, hasOwnKey: true, freeEnabled: false })).toBe('own')
  })

  it('falls back to the free key only when it is on and configured', () => {
    expect(pickKeySource(base)).toBe('free')
    expect(pickKeySource({ ...base, freeEnabled: false })).toBe('none')
    expect(pickKeySource({ ...base, freeKeySet: false })).toBe('none')
  })

  it('does not stand in for a provider the user asked for by name', () => {
    expect(pickKeySource({ ...base, requestedProvider: 'anthropic' })).toBe('none')
  })

  it("never tells the user to check a key they didn't add", () => {
    for (const status of [400, 429, 502, 503, 504]) {
      const { message } = freeAgentError(status, 'Gemini rejected your API key.')
      expect(message).not.toMatch(/your (API )?key/i)
    }
    expect(freeAgentError(422, 'Gemini returned no answer.')).toEqual({
      status: 422,
      message: 'Gemini returned no answer.',
    })
  })
})
