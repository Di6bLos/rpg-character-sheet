import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { RosterEntry } from '~/types'
import type { Dnd5eSheet, NimbleSheet } from '~/types/sheets'
import { addEffect } from '~/utils/dnd5eEffects'
import { costWhy, payCost } from '~/utils/dnd5ePlay'
import { addCondition } from '~/utils/nimbleConditions'

interface HeroEffect {
  id: string
  effect: string
  from_name: string
}

/**
 * The Help reaction (Core p. 14) aimed at another hero in the campaign: `allies`
 * lists them, `help` pays the reaction and leaves a "Helped" status for them in
 * `hero_effects`, which their own sheet picks up (see `useHeroEffects`).
 */
export function useHelpAlly(options: { onResult?: (message: string) => void } = {}) {
  const { draft, campaignId, canEdit, say } = useSheet<NimbleSheet>()
  const store = useCampaignStore()
  const { toggleReaction, reactions } = useNimbleActions(options)
  const roster = ref<RosterEntry[]>([])

  watch(
    campaignId,
    async (id) => {
      roster.value = id ? await store.roster(id).catch(() => []) : []
    },
    { immediate: true },
  )

  const allies = computed(() =>
    roster.value
      .filter((r) => r.character_id && r.character_id !== draft.value.id)
      .map((r) => ({ id: r.character_id!, name: r.character_name ?? r.display_name })),
  )

  function report(message: string) {
    say(message)
    options.onResult?.(message)
  }

  async function help(characterId: string) {
    const ally = allies.value.find((a) => a.id === characterId)
    const campaign = campaignId.value
    if (!canEdit.value || !ally || !campaign) return
    if (reactions.value.find((r) => r.name === 'Help')?.used) return
    const paid = toggleReaction('Help', true)
    if (!paid) return
    report(`Help (${paid}): ${ally.name} has advantage on their next roll.`)
    const { error } = await supabase.from('hero_effects').insert({
      campaign_id: campaign,
      character_id: ally.id,
      effect: 'Helped',
    })
    if (error) {
      toggleReaction('Help')
      report(`Could not reach ${ally.name}: Help not used.`)
    }
  }

  return { allies, help }
}

/**
 * The 5e Help action (SRD 5.2.1 p. 10) aimed at another hero in the campaign: it takes your
 * action and leaves a "Helped" status for them in `hero_effects`, which their sheet turns into
 * Advantage on their next attack roll or ability check (useHeroEffects).
 */
export function useDnd5eHelp() {
  const { draft, campaignId, canEdit, say } = useSheet<Dnd5eSheet>()
  const store = useCampaignStore()
  const roster = ref<RosterEntry[]>([])
  watch(
    campaignId,
    async (id) => {
      roster.value = id ? await store.roster(id).catch(() => []) : []
    },
    { immediate: true },
  )
  const allies = computed(() =>
    roster.value
      .filter((r) => r.character_id && r.character_id !== draft.value.id)
      .map((r) => ({ id: r.character_id!, name: r.character_name ?? r.display_name })),
  )
  const why = computed(() => costWhy(draft.value.sheet, 'action'))

  async function help(characterId: string): Promise<string> {
    const ally = allies.value.find((a) => a.id === characterId)
    const campaign = campaignId.value
    if (!canEdit.value || !ally || !campaign) return ''
    if (why.value) return `Help: ${why.value}.`
    const before = JSON.stringify(draft.value.sheet.turn ?? null)
    payCost(draft.value.sheet, draft.value.level, 'action')
    const { error } = await supabase.from('hero_effects').insert({
      campaign_id: campaign,
      character_id: ally.id,
      effect: 'Helped',
    })
    if (error) {
      draft.value.sheet.turn = JSON.parse(before) ?? undefined
      return `Could not reach ${ally.name}: Help not used.`
    }
    const line = `Help: ${ally.name} has Advantage on their next attack roll or ability check.`
    say(line)
    return line
  }

  return { allies, help, why }
}

/**
 * Picks up statuses other heroes gave this one (Helped) while its sheet is open
 * or the next time it loads, adds them to the sheet (Nimble: the Helped condition; 5e: the
 * Helped effect) and clears them.
 */
export function useHeroEffects() {
  const { draft, canEdit, held, say } = useSheet<NimbleSheet>()
  let channel: RealtimeChannel | null = null

  const taken = new Set<string>()

  async function take(rows: HeroEffect[]) {
    const fresh = rows.filter((r) => !taken.has(r.id))
    if (!canEdit.value || held.value || !fresh.length) return
    for (const r of fresh) taken.add(r.id)
    for (const row of fresh) {
      if (draft.value.system === 'dnd5e')
        addEffect(draft.value.sheet as unknown as Dnd5eSheet, 'helped', { ends: 'encounter' })
      else addCondition(draft.value.sheet, row.effect)
      say(`${row.from_name || 'An ally'} Helped you: advantage on your next roll.`)
    }
    await supabase
      .from('hero_effects')
      .delete()
      .in(
        'id',
        fresh.map((r) => r.id),
      )
  }

  // Listen first, then read what is waiting, so nothing slips between the two;
  // start whenever editing turns on (the board panel's canEdit can arrive later).
  async function start() {
    if (channel || (draft.value.system !== 'nimble' && draft.value.system !== 'dnd5e')) return
    const id = draft.value.id
    channel = supabase
      .channel(`hero-effects-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hero_effects',
          filter: `character_id=eq.${id}`,
        },
        (payload) => void take([payload.new as HeroEffect]),
      )
      .subscribe()
    await catchUp(id)
  }

  async function catchUp(id: string) {
    const { data } = await supabase
      .from('hero_effects')
      .select('id, effect, from_name')
      .eq('character_id', id)
    await take((data ?? []) as HeroEffect[])
  }

  onMounted(() => {
    watch(
      canEdit,
      (on) => {
        if (on) void start()
      },
      { immediate: true },
    )
    watch(held, (on) => {
      if (!on && channel) void catchUp(draft.value.id)
    })
  })

  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })
}
