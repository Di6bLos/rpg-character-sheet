import type { CampaignNpc, JournalFact, JournalSection, StatBlock } from '~/types'

export interface JournalStub {
  campaign_id: string
  title: string
  body: string
  section: JournalSection
  visibility: 'party'
  image_path: string | null
  campaign_npc_id: string
  fields: { role: string; attitude: string; notes: string; met: string; facts: JournalFact[] }
}

/** Monsters go to the bestiary; people the party meets go to NPCs. */
export function journalSectionFor(npc: Pick<CampaignNpc, 'kind'>): JournalSection {
  return npc.kind === 'humanoid' ? 'npc' : 'bestiary'
}

/**
 * The entry the party gets when an NPC enters initiative or the GM records a
 * meeting: only the name and image. Everything else is left for players to
 * write, and no facts are revealed.
 */
export function journalStub(npc: CampaignNpc): JournalStub {
  return {
    campaign_id: npc.campaign_id,
    title: npc.name,
    body: '',
    section: journalSectionFor(npc),
    visibility: 'party',
    image_path: npc.image_path,
    campaign_npc_id: npc.id,
    fields: { role: '', attitude: '', notes: '', met: '', facts: [] },
  }
}

/** Every fact the GM could reveal from a stat block, in reading order. */
export function revealableFacts(block: StatBlock): JournalFact[] {
  const out: JournalFact[] = []
  if (block.size) out.push({ k: 'Size', v: block.size })
  if (block.type) out.push({ k: 'Type', v: block.type })
  if (block.alignment) out.push({ k: 'Alignment', v: block.alignment })
  for (const [k, v] of block.top ?? []) out.push({ k, v })
  for (const [k, v] of block.stats ?? []) out.push({ k, v })
  for (const [k, v] of block.lines ?? []) out.push({ k, v })
  for (const sec of block.sections ?? []) {
    for (const it of sec.items) out.push({ k: it.n, v: it.t })
  }
  return out
}

/** Reveal or hide one fact, keeping the stat block's order. */
export function toggleFact(
  revealed: JournalFact[],
  fact: JournalFact,
  all: JournalFact[],
): JournalFact[] {
  const key = (f: JournalFact) => `${f.k}\u0000${f.v}`
  const on = new Set(revealed.map(key))
  if (on.has(key(fact))) on.delete(key(fact))
  else on.add(key(fact))
  const ordered = all.filter((f) => on.has(key(f)))
  // Keep facts revealed earlier that are no longer in the stat block (it was edited).
  const extra = revealed.filter((f) => on.has(key(f)) && !all.some((a) => key(a) === key(f)))
  return [...ordered, ...extra]
}
