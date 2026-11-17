// Spells the Nimble hero in the current sheet editor can cast, and casting them:
// spends the spell's actions and its mana (or a use of Pilfered Power, or a
// Reaver's minions or Wound), and starts Concentration when the spell needs it.
// Shared by the sheet's Spells panel and the board's action panel.
import { SPELL_RULES } from '~/data/nimble/spells'
import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { knownSpells, knownUtilitySpells, sheetResource } from '~/utils/nimbleBuild'
import {
  castingBlocks,
  castSpell,
  isHollowOne,
  manaPool,
  payBloodCast,
  payShadowExploit,
  shadowExploitCost,
  spellActions,
  spendMana,
} from '~/utils/nimblePlay'
import type { NimbleResultOptions } from './useNimbleActions'

export function useNimbleSpells(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const known = computed(() => knownSpells(sheet.value))
  const utility = computed(() => knownUtilitySpells(sheet.value))
  const maxTier = computed(() => sheet.value.spells.tier)

  /**
   * Reavers can't use Pilfered Power: they sacrifice minions (Shadow Exploit) or,
   * from level 11, take a Wound (My Blood, My Power), both at the highest tier.
   */
  const reaver = computed(() => isHollowOne(sheet.value))
  const bloodCast = computed(() =>
    sheet.value.abilities.some((a) => a.name === 'My Blood, My Power'),
  )
  const minionCost = computed(() => shadowExploitCost(sheet.value))

  /** Shadowmancers have no mana: tiered spells use Pilfered Power at the highest tier. */
  const pact = computed(() => {
    if (reaver.value) return null
    const r = sheetResource(sheet.value, draft.value.level)
    return r?.kind === 'uses' && sheet.value.mana.max === 0 ? r : null
  })
  const pactLimit = computed(() => {
    const stat = pact.value?.stat
    return stat ? Math.max(0, sheet.value.stats[stat]) : 0
  })

  /** Tier each spell is set to be cast at, when upcast. */
  const upcast = reactive<Record<string, number>>({})

  function castTier(s: SpellDef): number {
    if (s.tier === 0) return 0
    if (pact.value || reaver.value) return Math.max(s.tier, maxTier.value)
    return Math.max(s.tier, Math.min(maxTier.value, upcast[s.name] ?? s.tier))
  }

  const tiers = computed(() => {
    const groups = new Map<number, SpellDef[]>()
    for (const s of known.value) groups.set(s.tier, [...(groups.get(s.tier) ?? []), s])
    return [...groups.entries()].map(([tier, list]) => ({
      tier,
      label:
        tier === 0
          ? 'Cantrips · free'
          : reaver.value
            ? `Tier ${tier} · Shadow Exploit`
            : pact.value
              ? `Tier ${tier} · ${pact.value.name}`
              : `Tier ${tier} · ${tier} mana`,
      spells: list.map((s) => {
        const at = castTier(s)
        const actions = spellActions(s.cast)
        const acts = actions ? ` · ${actions} act` : ''
        const usesPact = !!pact.value && s.tier > 0
        const usesMinions = reaver.value && s.tier > 0
        const n = minionCost.value
        return {
          ...s,
          at,
          actions,
          usesPact,
          usesMinions,
          bloodLabel: usesMinions && bloodCast.value ? `Cast · 1 Wound${acts}` : '',
          canUpcast: !pact.value && !reaver.value && s.tier > 0 && maxTier.value > s.tier,
          short: !usesPact && !usesMinions && at > manaPool(sheet.value),
          busy: castingBlocks(sheet.value, actions),
          /** Short cost, for compact lists. */
          cost:
            s.tier === 0
              ? 'free'
              : usesMinions
                ? `${n} minion${n === 1 ? '' : 's'}`
                : usesPact
                  ? '1 use'
                  : `${at} mana`,
          label:
            s.tier === 0
              ? `Cast · free${acts}`
              : usesMinions
                ? `Cast at tier ${at} · ${n} minion${n === 1 ? '' : 's'}${acts}`
                : usesPact
                  ? `Cast at tier ${at} · 1 use${acts}`
                  : `Cast · ${at} mana${acts}`,
        }
      }),
    }))
  })

  type CastableSpell = (typeof tiers.value)[number]['spells'][number]

  const help = computed(() =>
    reaver.value
      ? `Cut off from your patron: tiered spells are cast at your highest tier by sacrificing shadow minions (Shadow Exploit: 1, then 1 more for each spell cast that way this encounter)${bloodCast.value ? ' or by taking 1 Wound (My Blood, My Power)' : ''}. Cantrips cost nothing.`
      : pact.value
        ? `Tiered spells use ${pact.value.name} in place of mana; cantrips cost nothing. Save DC is 10+KEY. Multi-target and AoE spells do not miss or crit.`
        : SPELL_RULES,
  )

  function setUpcast(s: SpellDef, tier: number) {
    upcast[s.name] = Math.max(s.tier, Math.min(maxTier.value, tier))
  }

  function cast(s: CastableSpell, withWound = false) {
    if (!canEdit.value || s.busy) return
    const notes: string[] = []
    if (s.tier === 0) notes.push(`Cast ${s.name} (cantrip).`)
    else if (s.usesMinions && withWound) {
      payBloodCast(sheet.value)
      notes.push(`Cast ${s.name} at tier ${s.at} · took 1 Wound (My Blood, My Power).`)
    } else if (s.usesMinions) {
      const n = payShadowExploit(sheet.value)
      notes.push(
        `Cast ${s.name} at tier ${s.at} · sacrifice ${n} shadow minion${n === 1 ? '' : 's'}.`,
      )
    } else if (s.usesPact) {
      const res = sheet.value.resource
      res.count += 1
      notes.push(`Cast ${s.name} at tier ${s.at}.`)
      if (res.count > pactLimit.value)
        notes.push(
          `Over your limit: your patron deals ${Math.floor(sheet.value.hpMax / 2)} damage to you.`,
        )
    } else {
      if (!spendMana(sheet.value, s.at)) return
      notes.push(`Cast ${s.name}${s.at > s.tier ? ` upcast to tier ${s.at}` : ''} · ${s.at} mana.`)
    }
    // Actions the turn can't cover carry over; Concentration starts once it is cast.
    const progress = castSpell(sheet.value, s.name, s.actions).trim()
    if (progress) notes.push(progress)
    if (sheet.value.dying) notes.push('Dying: DC 10 STR save or take 1 Wound.')
    const message = notes.join(' ')
    say(message)
    options.onResult?.(message)
  }

  return { known, utility, maxTier, tiers, help, setUpcast, cast }
}
