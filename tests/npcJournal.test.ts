import { describe, expect, it } from 'vitest'
import type { CampaignNpc } from '../types'
import { journalStub, revealableFacts, toggleFact } from '../utils/npcJournal'

const npc = (patch: Partial<CampaignNpc> = {}): CampaignNpc => ({
  id: 'n1',
  campaign_id: 'c1',
  pool_npc_id: null,
  system: 'dnd5e',
  kind: 'monster',
  name: 'Ghoul',
  level: '1',
  stat_block: {
    type: 'Undead',
    top: [
      ['Armor Class', '12'],
      ['Hit Points', '22'],
    ],
    sections: [{ title: 'Actions', items: [{ n: 'Claws', t: 'Paralyzes' }] }],
  },
  image_path: 'u/ghoul.png',
  source: 'official',
  ai_generated: false,
  gm_notes: 'Four wait in the hall',
  created_at: '',
  updated_at: '',
  ...patch,
})

describe('journalStub', () => {
  it('carries only the name and image, with empty notes and no facts', () => {
    const stub = journalStub(npc())
    expect(stub).toMatchObject({
      title: 'Ghoul',
      body: '',
      image_path: 'u/ghoul.png',
      section: 'bestiary',
      visibility: 'party',
    })
    expect(stub.fields).toEqual({ role: '', attitude: '', notes: '', met: '', facts: [] })
    expect(JSON.stringify(stub)).not.toContain('Four wait')
    expect(JSON.stringify(stub)).not.toContain('22')
  })
  it('files people under NPCs', () => {
    expect(journalStub(npc({ kind: 'humanoid' })).section).toBe('npc')
  })
})

describe('facts', () => {
  const all = revealableFacts(npc().stat_block)
  it('lists type, headline lines and actions in order', () => {
    expect(all.map((f) => f.k)).toEqual(['Type', 'Armor Class', 'Hit Points', 'Claws'])
  })
  it('reveals and hides one at a time, keeping stat block order', () => {
    let r = toggleFact([], all[3]!, all)
    r = toggleFact(r, all[1]!, all)
    expect(r.map((f) => f.k)).toEqual(['Armor Class', 'Claws'])
    r = toggleFact(r, all[3]!, all)
    expect(r.map((f) => f.k)).toEqual(['Armor Class'])
  })
})
