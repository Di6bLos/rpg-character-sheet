// Helpers shared by the AI Edge Functions (generate-npc, lore-master): the
// HTTP plumbing, provider error messages, retries and the key check.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'

export type Provider = 'anthropic' | 'google' | 'openai'

/** Models used to draft NPC stat blocks (structured output, one long call). */
export const NPC_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  google: 'gemini-3.8-flash',
  openai: 'gpt-6-astra',
}

/** Models used by the Lore Master chat (many short turns on the user's key). */
export const CHAT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-5-5',
  google: 'gemini-3.8-flash',
  openai: 'gpt-6-astra',
}

export const LABELS: Record<Provider, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'ChatGPT',
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export function providerError(provider: Provider, status: number, detail: string): HttpError {
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
      `${who} took too long to answer. Try again, maybe with a shorter request.`,
    )
  }
  return new HttpError(502, `${who} couldn't answer right now (error ${status}). Try again.`)
}

/** Temporary provider failures worth retrying: overloaded, rate-spike, server errors. */
const TRANSIENT = new Set([500, 502, 503, 504, 529])
/** Each provider attempt gets this long before we give up on it. */
export const ATTEMPT_TIMEOUT_MS = 90_000

export interface RetryOptions {
  /** How long one attempt may take. */
  timeoutMs?: number
  /** Waits before each retry; [] for a single attempt. */
  delays?: number[]
}

/**
 * fetch with two quick retries (1.5 s, then 4 s) on transient errors, so a
 * momentary "high demand" spike doesn't fail the request.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { timeoutMs = ATTEMPT_TIMEOUT_MS, delays = [1500, 4000] }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
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

export async function pingProvider(provider: Provider, key: string): Promise<void> {
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
