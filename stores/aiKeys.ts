import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { AiKeyInfo, AiProvider } from '~/types'

export const AI_PROVIDERS: {
  id: AiProvider
  label: string
  product: string
  keyHint: string
  keysUrl: string
}[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    product: 'Anthropic',
    keyHint: 'sk-ant-…',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    label: 'Gemini',
    product: 'Google AI Studio',
    keyHint: 'AIza…',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openai',
    label: 'ChatGPT',
    product: 'OpenAI',
    keyHint: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
]

export function providerLabel(id: AiProvider | null | undefined) {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? 'AI'
}

/**
 * The signed-in user's AI provider keys. Keys are encrypted in Supabase Vault
 * and never come back to the browser; only the provider and last 4 characters do.
 */
export const useAiKeysStore = defineStore('aiKeys', () => {
  const keys = ref<AiKeyInfo[]>([])
  const loaded = ref(false)

  const defaultKey = computed(() => keys.value.find((k) => k.is_default) ?? keys.value[0] ?? null)

  async function fetch(force = false) {
    if (loaded.value && !force) return
    // Explicit columns: secret_id isn't readable by the browser at all.
    const { data, error } = await supabase
      .from('user_ai_keys')
      .select('provider, last4, is_default, created_at')
      .order('created_at')
    if (error) throw error
    keys.value = (data ?? []) as AiKeyInfo[]
    loaded.value = true
  }

  async function save(provider: AiProvider, key: string) {
    const { error } = await supabase.rpc('set_ai_key', { p_provider: provider, p_key: key })
    if (error) throw error
    await fetch(true)
  }

  async function remove(provider: AiProvider) {
    const { error } = await supabase.rpc('delete_ai_key', { p_provider: provider })
    if (error) throw error
    await fetch(true)
  }

  async function makeDefault(provider: AiProvider) {
    const { error } = await supabase.rpc('set_default_ai_provider', { p_provider: provider })
    if (error) throw error
    await fetch(true)
  }

  /** Asks the Edge Function to make a tiny call with the stored key. */
  async function test(provider: AiProvider): Promise<{ ok: boolean; message: string }> {
    const { data, error } = await supabase.functions.invoke('generate-npc', {
      body: { ping: true, provider },
    })
    if (error) return { ok: false, message: await functionError(error) }
    return { ok: true, message: (data as { message?: string })?.message ?? 'The key works' }
  }

  function reset() {
    keys.value = []
    loaded.value = false
  }

  return { keys, loaded, defaultKey, fetch, save, remove, makeDefault, test, reset }
})

/** Readable message from a functions.invoke error (the function returns `{ error }` JSON). */
export async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.clone().json()) as { error?: string; message?: string }
      if (body?.error) return body.error
      // The gateway's own errors ({ message }) mean the function never ran.
      if (ctx.status === 404 || ctx.status === 503 || ctx.status === 502) {
        return 'The AI service isn’t available right now (the generate-npc function isn’t running or deployed).'
      }
      if (body?.message) return body.message
    } catch {
      // Not JSON; fall through.
    }
    if (ctx.status >= 500) return `The AI service failed (error ${ctx.status}). Try again.`
  }
  if (error instanceof Error && /Failed to send a request/i.test(error.message)) {
    return 'Couldn’t reach the AI service. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
