// lore-master: the board's AI chat, on the caller's own provider key.
// The caller's role is worked out here from campaign_members, never taken from
// the request. A GM gets the whole campaign as context; a player gets only the
// rules and their own character, so even a jailbroken reply has no campaign
// secrets to give away.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import {
  ATTEMPT_TIMEOUT_MS,
  CHAT_MODELS,
  HttpError,
  LABELS,
  cors,
  fetchWithRetry,
  json,
  providerError,
  type Provider,
  type RetryOptions,
} from '../_shared/ai.ts'
import {
  MAX_RULES_PACK,
  cleanTurns,
  clip,
  freeAgentError,
  gmContext,
  pickKeySource,
  serializeSheet,
  type CharacterRow,
  type ChatTurn,
  type GameSystem,
  type JournalRow,
  type NpcRow,
  type RosterRow,
} from './context.ts'
import { gmPrompt, playerPrompt } from './prompt.ts'

interface Body {
  campaignId?: string
  provider?: Provider | null
  messages?: unknown
  rulesPack?: string
}

const MAX_TOKENS = 16000
/**
 * The free agent's models, aliases Google keeps current: the lite model answers
 * fast on the free tier; the full one is the second try when it's busy.
 * FREE_AI_MODEL replaces the first.
 */
const FREE_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']
/** One 30 s attempt per model, so a busy free tier fails in about a minute, not past the gateway. */
const FREE_ATTEMPT: RetryOptions = { timeoutMs: 30_000, delays: [] }
/** Busy-provider statuses worth trying the other model for. */
const FREE_RETRY = new Set([429, 500, 502, 503, 504])

// --- Providers ---------------------------------------------------------------------------

async function chatWithClaude(key: string, system: string, turns: ChatTurn[]): Promise<string> {
  // The SDK retries 429/5xx/529 (overloaded) with backoff on its own.
  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: ATTEMPT_TIMEOUT_MS })
  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model: CHAT_MODELS.anthropic,
      max_tokens: MAX_TOKENS,
      // Chat answers: low effort keeps replies quick and cheap on the user's key.
      output_config: { effort: 'low' },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The system prompt (rules and campaign context) repeats every turn: cache it.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: turns,
    })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502
    throw providerError('anthropic', status, String(err))
  }
  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'Claude declined to answer that. Try rewording the question.')
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
  if (!text) throw new HttpError(502, 'Claude returned an empty answer. Try again.')
  return response.stop_reason === 'max_tokens' ? `${text}\n\n*(The answer was cut off.)*` : text
}

async function chatWithGemini(
  key: string,
  system: string,
  turns: ChatTurn[],
  model: string = CHAT_MODELS.google,
  retry?: RetryOptions,
): Promise<string> {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
      }),
    },
    retry,
  )
  if (!res.ok) throw providerError('google', res.status, await res.text())
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim()
  if (!text) {
    const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason
    throw new HttpError(422, `Gemini returned no answer${reason ? ` (${reason})` : ''}.`)
  }
  return text
}

async function chatWithOpenAI(key: string, system: string, turns: ChatTurn[]): Promise<string> {
  const res = await fetchWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODELS.openai,
      input: [{ role: 'system', content: system }, ...turns],
    }),
  })
  if (!res.ok) throw providerError('openai', res.status, await res.text())
  const data = await res.json()
  const parts: { type: string; text?: string }[] = (data?.output ?? [])
    .filter((o: { type: string }) => o.type === 'message')
    .flatMap((o: { content?: unknown[] }) => o.content ?? [])
  if (parts.some((p) => p.type === 'refusal')) {
    throw new HttpError(422, 'ChatGPT declined to answer that. Try rewording the question.')
  }
  const text = parts
    .filter((p) => p.type === 'output_text')
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) throw new HttpError(502, 'ChatGPT returned an empty answer. Try again.')
  return text
}

// --- Handler -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') ?? ''
    // Campaign data is read as the caller, so row-level security applies to it.
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
    if (!body.campaignId) throw new HttpError(400, 'Missing campaign.')
    const turns = cleanTurns(body.messages)
    if (turns.at(-1)?.role !== 'user') throw new HttpError(400, 'Ask a question first.')
    const rulesPack = clip(typeof body.rulesPack === 'string' ? body.rulesPack : '', MAX_RULES_PACK)

    const { data: settings } = await admin
      .from('site_settings')
      .select('ai_enabled, free_ai_enabled')
      .maybeSingle()
    if (!settings?.ai_enabled) throw new HttpError(403, 'An admin has turned the AI features off.')

    const { data: member } = await asUser
      .from('campaign_members')
      .select('role, character_id, campaigns(name, system, pitch)')
      .eq('campaign_id', body.campaignId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) throw new HttpError(403, 'You are not in this campaign.')
    const campaign = member.campaigns as unknown as {
      name: string
      system: GameSystem
      pitch: string | null
    }

    const { data: keyRows, error: keyError } = await admin.rpc('ai_key_for', {
      p_user: user.id,
      p_provider: body.provider ?? null,
    })
    if (keyError) throw keyError
    const keyRow = (keyRows as { provider: Provider; api_key: string }[] | null)?.[0]
    const freeKey = Deno.env.get('FREE_AI_GEMINI_KEY') ?? ''
    const source = pickKeySource({
      hasOwnKey: !!keyRow,
      requestedProvider: body.provider,
      freeEnabled: !!settings.free_ai_enabled,
      freeKeySet: !!freeKey,
    })
    if (source === 'none') {
      throw new HttpError(
        400,
        body.provider
          ? `Add a ${LABELS[body.provider]} API key in Settings → AI providers first.`
          : 'Add an API key in Settings → AI providers first.',
      )
    }

    let system: string
    if (member.role === 'gm') {
      const [roster, members, npcs, journal] = await Promise.all([
        asUser.rpc('campaign_roster', { p_campaign: body.campaignId }),
        asUser
          .from('campaign_members')
          .select('characters(name, level, system, sheet)')
          .eq('campaign_id', body.campaignId)
          .not('character_id', 'is', null),
        asUser
          .from('campaign_npcs')
          .select('name, kind, level, stat_block, gm_notes')
          .eq('campaign_id', body.campaignId)
          .order('updated_at', { ascending: false })
          .limit(40),
        asUser
          .from('journal_entries')
          .select('title, body, section, visibility, created_at')
          .eq('campaign_id', body.campaignId)
          .order('created_at', { ascending: false })
          .limit(30),
      ])
      const characters = (members.data ?? [])
        .map((m) => m.characters as unknown as CharacterRow | null)
        .filter((c): c is CharacterRow => !!c)
      system = gmPrompt(
        campaign.system,
        gmContext({
          campaign,
          roster: (roster.data ?? []) as RosterRow[],
          characters,
          npcs: (npcs.data ?? []) as NpcRow[],
          journal: (journal.data ?? []) as JournalRow[],
        }),
        rulesPack,
      )
    } else {
      // A player's context is their own character and nothing else from the campaign.
      let sheet = ''
      if (member.character_id) {
        const { data: character } = await asUser
          .from('characters')
          .select('name, level, system, sheet')
          .eq('id', member.character_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (character) sheet = serializeSheet(character as CharacterRow)
      }
      system = playerPrompt(campaign.system, sheet, rulesPack)
    }

    const role = member.role === 'gm' ? 'gm' : 'player'

    if (source === 'free') {
      // Taken before the call (so parallel requests can't overshoot), given back on failure.
      const { data: left, error: quotaError } = await admin.rpc('use_free_ai', { p_user: user.id })
      if (quotaError) throw quotaError
      if ((left as number) < 0) {
        throw new HttpError(
          429,
          "You've used today's free questions. Add your own key in Settings → AI providers for unlimited use.",
        )
      }
      const models = [Deno.env.get('FREE_AI_MODEL') || FREE_MODELS[0]!, FREE_MODELS[1]!]
      let model = models[0]!
      let reply: string
      try {
        try {
          reply = await chatWithGemini(freeKey, system, turns, model, FREE_ATTEMPT)
        } catch (err) {
          // Free-tier capacity comes and goes: try the other model before giving up.
          if (!(err instanceof HttpError) || !FREE_RETRY.has(err.status)) throw err
          model = models[1]!
          reply = await chatWithGemini(freeKey, system, turns, model, FREE_ATTEMPT)
        }
      } catch (err) {
        await admin.rpc('refund_free_ai', { p_user: user.id })
        if (err instanceof HttpError) {
          const free = freeAgentError(err.status, err.message)
          throw new HttpError(free.status, free.message)
        }
        throw err
      }
      return json({
        reply,
        role,
        provider: 'google',
        model,
        free: true,
        freeRemaining: left as number,
      })
    }

    const own = keyRow!
    const reply =
      own.provider === 'anthropic'
        ? await chatWithClaude(own.api_key, system, turns)
        : own.provider === 'google'
          ? await chatWithGemini(own.api_key, system, turns)
          : await chatWithOpenAI(own.api_key, system, turns)

    return json({
      reply,
      role,
      provider: own.provider,
      model: CHAT_MODELS[own.provider],
      free: false,
      freeRemaining: null,
    })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error('lore-master failed', err)
    return json({ error: 'Something went wrong asking the Lore Master.' }, 500)
  }
})
