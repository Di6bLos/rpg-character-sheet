// Turns database rows into compact prompt text for the Lore Master. Pure
// TypeScript (no Deno APIs) so Vitest can test it (tests/loreMaster.test.ts).

export type GameSystem = 'nimble' | 'dnd5e' | 'pf2e'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export const MAX_TURNS = 20
export const MAX_TURN_CHARS = 4000
export const MAX_RULES_PACK = 40_000
const MAX_SHEET = 12_000
const MAX_GM_CONTEXT = 70_000

/** Bookkeeping keys that say nothing useful about the character. */
const NOISE = new Set([
  'levelHistory',
  'choices',
  'uses',
  'rulesVersion',
  'classSlug',
  'subclassSlug',
  'ancestrySlug',
  'backgroundSlug',
  'portrait',
])

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([k]) => !NOISE.has(k))
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  if (value === '' || value === null || value === undefined) return undefined
  return value
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export interface CharacterRow {
  name: string
  level: number
  system: GameSystem
  sheet: Record<string, unknown> | null
}

/** One character as compact JSON under a heading. */
export function serializeSheet(c: CharacterRow, max = MAX_SHEET): string {
  const body = JSON.stringify(prune(c.sheet ?? {}) ?? {})
  return `### ${c.name} (level ${c.level})\n${clip(body, max)}`
}

/** Keeps the last turns, in order, starting with a user turn, each capped. */
export function cleanTurns(input: unknown): ChatTurn[] {
  const list = Array.isArray(input) ? input : []
  const turns = list
    .filter(
      (t): t is ChatTurn =>
        !!t &&
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string' &&
        t.content.trim() !== '',
    )
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: clip(t.content.trim(), MAX_TURN_CHARS) }))
  while (turns[0]?.role === 'assistant') turns.shift()
  return turns
}

export interface RosterRow {
  display_name: string
  role: string
  character_name: string | null
  character_level: number | null
  summary: Record<string, unknown> | null
}

export interface NpcRow {
  name: string
  kind: string
  level: string
  stat_block: unknown
  gm_notes: string | null
}

export interface JournalRow {
  title: string
  body: string
  /** NPC and bestiary entries keep their text here, with an empty body. */
  fields?: {
    role?: string
    attitude?: string
    notes?: string
    met?: string
    facts?: { k: string; v: string }[]
  } | null
  section: string
  visibility: string
  created_at: string
}

export interface GmContextInput {
  campaign: { name: string; system: GameSystem; pitch: string | null }
  roster: RosterRow[]
  characters: CharacterRow[]
  npcs: NpcRow[]
  journal: JournalRow[]
}

/** An entry's text: the body, then any NPC or bestiary fields. */
function journalText(j: JournalRow): string {
  const f = j.fields ?? {}
  return [
    j.body,
    f.role && `Role: ${f.role}`,
    f.attitude && `Attitude: ${f.attitude}`,
    f.met && `Met: ${f.met}`,
    f.notes,
    ...(f.facts ?? []).filter((x) => x.k && x.v).map((x) => `${x.k}: ${x.v}`),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Everything the GM's co-pilot may see about the campaign, newest journal first. */
export function gmContext(input: GmContextInput): string {
  const parts: string[] = [`Campaign: ${input.campaign.name}`]
  if (input.campaign.pitch) parts.push(`Pitch: ${clip(input.campaign.pitch, 1500)}`)

  const players = input.roster.filter((r) => r.role !== 'gm')
  if (players.length) {
    parts.push(
      '## Party (live status)',
      ...players.map((r) => {
        const who = r.character_name
          ? `${r.character_name} (level ${r.character_level ?? '?'}), played by ${r.display_name}`
          : `${r.display_name} (no character seated)`
        const summary = prune(r.summary ?? {})
        return `- ${who}${summary ? `: ${JSON.stringify(summary)}` : ''}`
      }),
    )
  }
  if (input.characters.length) {
    parts.push('## Character sheets', ...input.characters.map((c) => serializeSheet(c, 6000)))
  }
  if (input.npcs.length) {
    parts.push(
      '## Campaign NPCs and monsters',
      ...input.npcs.slice(0, 40).map((n) => {
        const notes = n.gm_notes ? `\nGM notes: ${clip(n.gm_notes, 600)}` : ''
        const block = clip(JSON.stringify(prune(n.stat_block) ?? {}), 1500)
        return `### ${n.name} (${n.kind}, level ${n.level || '?'})\n${block}${notes}`
      }),
    )
  }
  if (input.journal.length) {
    parts.push(
      '## Journal (newest first)',
      ...input.journal.slice(0, 30).map((j) => {
        const tag = j.visibility === 'gm' ? 'GM only' : 'party'
        return `### ${j.title} [${j.section}, ${tag}, ${j.created_at.slice(0, 10)}]\n${clip(journalText(j), 700)}`
      }),
    )
  }
  return clip(parts.join('\n\n'), MAX_GM_CONTEXT)
}

export type KeySource = 'own' | 'free' | 'none'

/**
 * Whose key answers: the user's own key always wins; the site's free Gemini key
 * only stands in when the user has none and didn't ask for a specific provider.
 */
export function pickKeySource(input: {
  hasOwnKey: boolean
  requestedProvider: string | null | undefined
  freeEnabled: boolean
  freeKeySet: boolean
}): KeySource {
  if (input.hasOwnKey) return 'own'
  if (!input.requestedProvider && input.freeEnabled && input.freeKeySet) return 'free'
  return 'none'
}

/**
 * Provider errors on the free key are about the site's key, not the user's:
 * reword them so nobody is told to check a key they never added.
 */
export function freeAgentError(
  status: number,
  message: string,
): { status: number; message: string } {
  if (status === 422) return { status, message }
  if (status === 429)
    return { status: 503, message: 'The free agent is busy right now. Try again in a minute.' }
  return {
    status: 503,
    message: "The free agent couldn't answer right now. Try again in a minute.",
  }
}
