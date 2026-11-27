import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { RosterEntry } from '~/types'
import type { Dnd5eSheet, NimbleSheet } from '~/types/sheets'
import { addEffect } from '~/utils/dnd5eEffects'
import { costWhy, dnd5eHero, payCost } from '~/utils/dnd5ePlay'
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

  /**
   * Bardic Inspiration (SRD 5.2.1 p. 33) for an ally in the campaign: `pay` uses the entry
   * (the Bonus Action and the use; the caller checked it can), then this leaves the die for the
   * ally in `hero_effects` ("Bardic Inspiration d8", "… Valor" from a College of Valor bard),
   * and on failure puts the turn and uses back.
   */
  async function inspire(characterId: string, die: string, pay: () => void): Promise<string> {
    const ally = allies.value.find((a) => a.id === characterId)
    const campaign = campaignId.value
    const sides = /d(6|8|10|12)\b/.exec(die)?.[1]
    if (!canEdit.value || !ally || !campaign || !sides) return ''
    const sheet = draft.value.sheet
    const before = JSON.stringify({ turn: sheet.turn ?? null, used: sheet.used ?? {} })
    pay()
    const valor = dnd5eHero(sheet, draft.value.level).has('Combat Inspiration')
    const { error } = await supabase.from('hero_effects').insert({
      campaign_id: campaign,
      character_id: ally.id,
      effect: `Bardic Inspiration d${sides}${valor ? ' Valor' : ''}`,
      from_name: draft.value.name.slice(0, 80),
    })
    if (error) {
      const was = JSON.parse(before) as {
        turn: Dnd5eSheet['turn'] | null
        used: Record<string, number>
      }
      sheet.turn = was.turn ?? undefined
      sheet.used = was.used
      return `Could not reach ${ally.name}: Bardic Inspiration not used.`
    }
    const line = `Bardic Inspiration: ${ally.name} gains your d${sides}${valor ? ' (Combat Inspiration too)' : ''} to add to a failed D20 Test within the hour.`
    say(line)
    return line
  }

  return { allies, help, why, inspire }
}

/**
 * Picks up statuses other heroes gave this one (Helped, a 5e Bardic Inspiration die) while its
 * sheet is open or the next time it loads, adds them to the sheet (Nimble: the Helped
 * condition; 5e: the Helped or Bardic Inspiration effect) and clears them.
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
      const from = row.from_name || 'An ally'
      const bardic = /^Bardic Inspiration d(\d+)( Valor)?$/.exec(row.effect)
      if (draft.value.system === 'dnd5e' && bardic) {
        const e = addEffect(draft.value.sheet as unknown as Dnd5eSheet, 'bardic-inspiration', {
          value: Number(bardic[1]),
          name: `Bardic Inspiration d${bardic[1]}`,
        })
        if (e) {
          e.from = from
          if (bardic[2]) e.valor = true
        }
        say(
          `${from} inspired you: a d${bardic[1]} to add to a failed D20 Test${bardic[2] ? ', or to a hit’s damage or your AC (Combat Inspiration)' : ''}.`,
        )
        continue
      }
      if (draft.value.system === 'dnd5e')
        addEffect(draft.value.sheet as unknown as Dnd5eSheet, 'helped', { ends: 'encounter' })
      else addCondition(draft.value.sheet, row.effect)
      say(`${from} Helped you: advantage on your next roll.`)
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
