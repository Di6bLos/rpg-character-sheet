// generate-npc: drafts an NPC stat block in the campaign's system with the
// caller's own AI provider key (Claude, Gemini or ChatGPT). Keys live in
// Supabase Vault and are read here with the service role; they never reach
// the browser. Body { ping: true, provider } only checks that a key works.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import {
  NPC_SCHEMA,
  systemPrompt,
  userPrompt,
  type GameSystem,
  type NpcDraft,
  type NpcKind,
  type Threat,
} from './prompt.ts'

type Provider = 'anthropic' | 'google' | 'openai'

interface InFile {
  name: string
  type: string
  data: string
}

interface Body {
  ping?: boolean
  provider?: Provider | null
  campaignId?: string
  system?: GameSystem
  kind?: NpcKind
  threat?: Threat
  /** Monster level (or party level for Nimble minions and bosses), CR for 5e. */
  level?: string
  partyLevel?: boolean
  /** Target numbers from the GM's Guide tables, computed by the app (utils/npcBudget.ts). */
  budget?: string[]
  sourceSystem?: string
  description?: string
  files?: InFile[]
}

const MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  google: 'gemini-3.8-flash',
  openai: 'gpt-6-astra',
}
const LABELS: Record<Provider, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'ChatGPT',
}
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const TEXT_TYPES = new Set(['text/plain', 'text/markdown'])
const MAX_FILES = 4
/** Base64 length of ~8 MB of files. */
const MAX_BASE64 = 11_500_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function decodeText(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes).slice(0, 60_000)
}

function providerError(provider: Provider, status: number, detail: string): HttpError {
  const who = LABELS[provider]
  // Gemini answers a bad key with 400 API_KEY_INVALID rather than 401.
  const badKey = /API_KEY_INVALID|API key not valid|invalid_api_key|Incorrect API key/i.test(detail)
  if (status === 401 || status === 403 || badKey) {
    return new HttpError(400, `${who} rejected your API key. Check it in Settings → AI providers.`)
  }
  if (status === 429) {
    return new HttpError(
      429,
      `${who} says you're over your rate limit or out of credit. Try again later.`,
    )
  }
  console.error(`${provider} error ${status}: ${detail.slice(0, 500)}`)
  if (status === 503 || status === 529 || /overloaded|high demand|UNAVAILABLE/i.test(detail)) {
    return new HttpError(
      503,
      `${who} is overloaded right now (that's on their side, not your key). Try again in a minute, or pick another provider.`,
    )
  }
  if (status === 504 || status === 408) {
    return new HttpError(
      504,
      `${who} took too long to answer. Try again, maybe with a shorter description.`,
    )
  }
  return new HttpError(502, `${who} couldn't draft that right now (error ${status}). Try again.`)
}

/** Temporary provider failures worth retrying: overloaded, rate-spike, server errors. */
const TRANSIENT = new Set([500, 502, 503, 504, 529])
/** Each provider attempt gets this long before we give up on it. */
const ATTEMPT_TIMEOUT_MS = 90_000

/**
 * fetch with two quick retries (1.5 s, then 4 s) on transient errors, so a
 * momentary "high demand" spike doesn't fail the GM's request.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const delays = [1500, 4000]
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) })
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        res = new Response('timeout', { status: 504 })
      } else {
        throw err
      }
    }
    const delay = delays[attempt]
    if (!TRANSIENT.has(res.status) || delay === undefined) return res
    await res.body?.cancel()
    await new Promise((r) => setTimeout(r, delay))
  }
}

// --- Providers ---------------------------------------------------------------------------

async function pingProvider(provider: Provider, key: string): Promise<void> {
  // Listing models costs no tokens and fails fast on a bad key.
  if (provider === 'anthropic') {
    try {
      await new Anthropic({ apiKey: key, maxRetries: 0 }).models.list({ limit: 1 })
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502
      throw providerError(provider, status, String(err))
    }
    return
  }
  const res =
    provider === 'google'
      ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
          headers: { 'x-goog-api-key': key },
        })
      : await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
  if (!res.ok) throw providerError(provider, res.status, await res.text())
}

async function draftWithClaude(key: string, system: string, user: string, files: InFile[]) {
  // The SDK retries 429/5xx/529 (overloaded) with backoff on its own.
  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: ATTEMPT_TIMEOUT_MS })
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const f of files) {
    if (IMAGE_TYPES.has(f.type)) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: f.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
          data: f.data,
        },
      })
    } else if (f.type === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: f.data },
        title: f.name,
      })
    } else {
      content.push({ type: 'text', text: `File ${f.name}:\n${decodeText(f.data)}` })
    }
  }
  content.push({ type: 'text', text: user })

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model: MODELS.anthropic,
      max_tokens: 16000,
      // Opus 5.5 always thinks; medium effort is plenty for one stat block.
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: NPC_SCHEMA } },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502
    throw providerError('anthropic', status, String(err))
  }
  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'Claude declined to draft that. Try rewording the description.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'The draft was cut off. Try a shorter description.')
  }
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new HttpError(502, 'Claude returned no stat block.')
  return JSON.parse(text.text) as NpcDraft
}

/** Gemini's schema dialect is a JSON Schema subset; drop the keys it may not accept. */
function forGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forGemini)
  if (schema && typeof schema === 'object') {
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([k]) => k !== 'additionalProperties')
        .map(([k, v]) => [k, forGemini(v)]),
    )
  }
  return schema
}

async function draftWithGemini(key: string, system: string, user: string, files: InFile[]) {
  const parts: unknown[] = files.map((f) =>
    TEXT_TYPES.has(f.type)
      ? { text: `File ${f.name}:\n${decodeText(f.data)}` }
      : { inlineData: { mimeType: f.type, data: f.data } },
  )
  parts.push({ text: user })
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: forGemini(NPC_SCHEMA) } },
        },
      }),
    },
  )
  if (!res.ok) throw providerError('google', res.status, await res.text())
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
  if (!text) {
    const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason
    throw new HttpError(422, `Gemini returned no stat block${reason ? ` (${reason})` : ''}.`)
  }
  return JSON.parse(text) as NpcDraft
}

async function draftWithOpenAI(key: string, system: string, user: string, files: InFile[]) {
  const content: unknown[] = files.map((f) => {
    if (IMAGE_TYPES.has(f.type)) {
      return { type: 'input_image', image_url: `data:${f.type};base64,${f.data}` }
    }
    if (f.type === 'application/pdf') {
      return {
        type: 'input_file',
        filename: f.name,
        file_data: `data:application/pdf;base64,${f.data}`,
      }
    }
    return { type: 'input_text', text: `File ${f.name}:\n${decodeText(f.data)}` }
  })
  content.push({ type: 'input_text', text: user })
  const res = await fetchWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.openai,
      input: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      text: {
        format: { type: 'json_schema', name: 'npc_stat_block', schema: NPC_SCHEMA, strict: true },
      },
    }),
  })
  if (!res.ok) throw providerError('openai', res.status, await res.text())
  const data = await res.json()
  const parts: { type: string; text?: string; refusal?: string }[] = (data?.output ?? [])
    .filter((o: { type: string }) => o.type === 'message')
    .flatMap((o: { content?: unknown[] }) => o.content ?? [])
  const refusal = parts.find((p) => p.type === 'refusal')
  if (refusal)
    throw new HttpError(422, 'ChatGPT declined to draft that. Try rewording the description.')
  const text = parts
    .filter((p) => p.type === 'output_text')
    .map((p) => p.text ?? '')
    .join('')
  if (!text) throw new HttpError(502, 'ChatGPT returned no stat block.')
  return JSON.parse(text) as NpcDraft
}

/** Draft → the app's StatBlock shape. */
function toNpc(draft: NpcDraft, system: GameSystem, fallbackKind: NpcKind) {
  const pairs = (list: { k: string; v: string }[]) =>
    (list ?? []).filter((p) => p.k && p.v).map((p) => [p.k, p.v] as [string, string])
  return {
    name: (draft.name || 'Unnamed').slice(0, 80),
    kind: draft.kind === 'humanoid' || draft.kind === 'monster' ? draft.kind : fallbackKind,
    level: String(draft.level ?? '').slice(0, 20),
    stat_block: {
      type: draft.type || undefined,
      size: draft.size || undefined,
      alignment: draft.alignment || undefined,
      top: pairs(draft.top),
      stats: system === 'nimble' ? [] : pairs(draft.stats),
      lines: pairs(draft.lines),
      sections: (draft.sections ?? [])
        .map((s) => ({ title: s.title, items: (s.items ?? []).filter((i) => i.n || i.t) }))
        .filter((s) => s.title && s.items.length),
      hp: Number.isFinite(draft.hp) ? Math.max(0, Math.round(draft.hp)) : undefined,
      ac: system === 'nimble' || !Number.isFinite(draft.ac) ? undefined : Math.round(draft.ac),
      initMod:
        system === 'nimble' || !Number.isFinite(draft.initMod)
          ? undefined
          : Math.round(draft.initMod),
    },
  }
}

// --- Handler -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: userData, error: userError } = await asUser.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    )
    const user = userData?.user
    if (userError || !user) throw new HttpError(401, 'Sign in first.')

    const body = (await req.json()) as Body

    const { data: settings } = await admin.from('site_settings').select('ai_enabled').maybeSingle()
    if (!settings?.ai_enabled) throw new HttpError(403, 'An admin has turned the AI features off.')

    const { data: keyRows, error: keyError } = await admin.rpc('ai_key_for', {
      p_user: user.id,
      p_provider: body.provider ?? null,
    })
    if (keyError) throw keyError
    const keyRow = (keyRows as { provider: Provider; api_key: string }[] | null)?.[0]
    if (!keyRow) {
      throw new HttpError(
        400,
        body.provider
          ? `Add a ${LABELS[body.provider]} API key in Settings → AI providers first.`
          : 'Add an API key in Settings → AI providers first.',
      )
    }

    if (body.ping) {
      await pingProvider(keyRow.provider, keyRow.api_key)
      return json({ ok: true, message: `${LABELS[keyRow.provider]} accepted the key.` })
    }

    // Only the GM of the campaign can draft for it (and spend their key on it).
    // Staff draft for the shared pool from the admin area, without a campaign.
    if (body.campaignId) {
      const { data: member } = await asUser
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', body.campaignId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (member?.role !== 'gm')
        throw new HttpError(403, 'Only the GM can generate NPCs for this campaign.')
    } else {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role !== 'admin' && profile?.role !== 'moderator')
        throw new HttpError(400, 'Missing campaign.')
    }

    const system: GameSystem = body.system ?? 'nimble'
    if (!['nimble', 'dnd5e', 'pf2e'].includes(system))
      throw new HttpError(400, 'Unknown game system.')
    const kind: NpcKind = body.kind === 'humanoid' ? 'humanoid' : 'monster'
    const threat: Threat = (['Minion', 'Standard', 'Elite', 'Boss'] as const).includes(
      body.threat as Threat,
    )
      ? (body.threat as Threat)
      : 'Standard'
    const description = String(body.description ?? '').slice(0, 4000)
    const files = (body.files ?? [])
      .slice(0, MAX_FILES)
      .filter(
        (f) =>
          f &&
          typeof f.data === 'string' &&
          (IMAGE_TYPES.has(f.type) || TEXT_TYPES.has(f.type) || f.type === 'application/pdf'),
      )
    if (files.reduce((n, f) => n + f.data.length, 0) > MAX_BASE64) {
      throw new HttpError(413, 'Uploads are limited to 8 MB in total.')
    }
    if (!description && !files.length)
      throw new HttpError(400, 'Describe the creature or upload a file.')

    const sys = systemPrompt(system)
    const user_ = userPrompt({
      description,
      kind,
      threat,
      system,
      level: /^-?\d{1,2}(\/\d)?$/.test(String(body.level ?? '')) ? String(body.level) : '',
      partyLevel: body.partyLevel === true,
      budget: (Array.isArray(body.budget) ? body.budget : [])
        .filter((l): l is string => typeof l === 'string')
        .slice(0, 8)
        .map((l) => l.slice(0, 400)),
      sourceSystem: body.sourceSystem ?? 'auto',
      fileNames: files.map((f) => f.name.slice(0, 120)),
    })
    const draft =
      keyRow.provider === 'anthropic'
        ? await draftWithClaude(keyRow.api_key, sys, user_, files)
        : keyRow.provider === 'google'
          ? await draftWithGemini(keyRow.api_key, sys, user_, files)
          : await draftWithOpenAI(keyRow.api_key, sys, user_, files)

    return json({
      npc: toNpc(draft, system, kind),
      assumptions: (draft.assumptions ?? []).filter((a) => typeof a === 'string').slice(0, 12),
      provider: keyRow.provider,
      model: MODELS[keyRow.provider],
    })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    if (err instanceof SyntaxError)
      return json({ error: 'The AI returned a malformed stat block. Try again.' }, 502)
    console.error('generate-npc failed', err)
    return json({ error: 'Something went wrong drafting the NPC.' }, 500)
  }
})
