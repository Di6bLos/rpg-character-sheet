// The Lore Master chat for the current campaign board. History lives in
// sessionStorage (per campaign and user) and is gone when the tab closes.
// Questions go to the `lore-master` Edge Function, which picks the GM or
// player context on the server; this side only adds the public rules pack.
// Users without a key of their own ask the free agent (the site's Gemini key),
// which has a daily allowance per user.
import { supabase } from '~/lib/supabase'
import { functionError } from '~/stores/aiKeys'
import type { NimbleSheet } from '~/types/sheets'
import { buildRulesPack } from '~/utils/loreContext'

export interface LoreMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Turns sent per question; matches MAX_TURNS in the function. */
const SEND_TURNS = 20
/** Turns kept in the session. */
const KEEP_TURNS = 60

export function useLoreMaster() {
  const auth = useAuthStore()
  const aiKeys = useAiKeysStore()
  const site = useSiteStore()
  const characters = useCharacterStore()
  const { campaign, campaignId, isGm } = useCampaignBoard()

  const messages = ref<LoreMessage[]>([])
  const pending = ref(false)
  const error = ref('')

  /** On the site's free key: no key of their own. */
  const free = computed(() => aiKeys.loaded && aiKeys.keys.length === 0)
  /** Free questions left today; null when on their own key or not known yet. */
  const freeRemaining = ref<number | null>(null)

  async function loadFreeRemaining() {
    if (!free.value || !auth.userId) {
      freeRemaining.value = null
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('ai_free_usage')
      .select('count')
      .eq('user_id', auth.userId)
      .eq('day', today)
      .maybeSingle()
    freeRemaining.value = Math.max(site.settings.free_ai_daily_limit - (data?.count ?? 0), 0)
  }
  watch([free, () => site.settings.free_ai_daily_limit], () => void loadFreeRemaining(), {
    immediate: true,
  })

  const storageKey = computed(() => `lantern:lore:${campaignId.value}:${auth.userId ?? ''}`)

  watch(
    storageKey,
    (key) => {
      messages.value = []
      error.value = ''
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? '[]') as unknown
        if (Array.isArray(saved)) {
          messages.value = saved.filter(
            (m): m is LoreMessage =>
              !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
          )
        }
      } catch {
        // Storage blocked or corrupt: start fresh.
      }
    },
    { immediate: true },
  )

  function persist() {
    try {
      sessionStorage.setItem(storageKey.value, JSON.stringify(messages.value.slice(-KEEP_TURNS)))
    } catch {
      // Not remembered; fine.
    }
  }

  /** The player's Nimble sheet, for their class and spells in the rules pack. */
  async function playerSheet(): Promise<NimbleSheet | null> {
    const id = campaign.value?.myCharacterId
    if (!id || campaign.value?.system !== 'nimble') return null
    try {
      const found = await characters.fetchOne(id)
      return (found?.sheet as NimbleSheet | undefined) ?? null
    } catch {
      // The rules pack is optional: the function still has the sheet itself.
      return null
    }
  }

  async function send(text: string) {
    const question = text.trim()
    if (!question || pending.value || !campaign.value) return
    error.value = ''
    messages.value.push({ role: 'user', content: question })
    persist()
    pending.value = true
    const key = storageKey.value
    try {
      const mode = isGm.value ? 'gm' : 'player'
      const sheet = mode === 'player' ? await playerSheet() : null
      const { data, error: invokeError } = await supabase.functions.invoke('lore-master', {
        body: {
          campaignId: campaignId.value,
          provider: aiKeys.defaultKey?.provider ?? null,
          messages: messages.value.slice(-SEND_TURNS),
          rulesPack: buildRulesPack(campaign.value.system, mode, sheet),
        },
      })
      if (key !== storageKey.value) return
      if (invokeError) throw invokeError
      const result = data as { reply?: string; free?: boolean; freeRemaining?: number } | null
      if (!result?.reply) throw new Error('The Lore Master had nothing to say. Try again.')
      messages.value.push({ role: 'assistant', content: result.reply })
      persist()
      if (result.free && typeof result.freeRemaining === 'number') {
        freeRemaining.value = result.freeRemaining
      }
    } catch (err) {
      if (key === storageKey.value) error.value = await functionError(err)
      // A failed free question is refunded, or the allowance just ran out: re-read it.
      if (free.value) void loadFreeRemaining()
    } finally {
      pending.value = false
    }
  }

  /** Drops a question that failed so it can be asked again. */
  function retry() {
    const last = messages.value.at(-1)
    if (last?.role !== 'user') return
    messages.value.pop()
    void send(last.content)
  }

  function clear() {
    messages.value = []
    error.value = ''
    persist()
  }

  return { messages, pending, error, free, freeRemaining, send, retry, clear }
}
