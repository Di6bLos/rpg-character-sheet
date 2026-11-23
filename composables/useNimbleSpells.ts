// Spells the Nimble hero in the current sheet editor can cast, and casting them:
// spends the spell's actions and its mana (or a use of Pilfered Power, or a
// Reaver's minions or Wound), and starts Concentration when the spell needs it.
// Shared by the sheet's Spells panel and the board's action panel.
import { castReason, spellNotNow } from '~/utils/battleActions'
import { SPELL_RULES } from '~/data/nimble/spells'
import { summonBySource } from '~/data/nimble/summons'
import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import {
  abilityBaseName,
  knownSpells,
  knownUtilitySpells,
  sheetResource,
} from '~/utils/nimbleBuild'
import {
  abilityCounters,
  actionsLeft,
  armorNow,
  castingBlocks,
  castSpell,
  critTriggerSources,
  critTriggers,
  gainWounds,
  heal,
  initiativeCastReady,
  initiativeCasts,
  isHollowOne,
  manaPool,
  payBloodCast,
  payShadowExploit,
  shadowExploitCost,
  spellActions,
  spendMana,
  takeDamage,
} from '~/utils/nimblePlay'
import { endEffects } from '~/utils/nimbleEffects'
import { rollSpellDamage, spellDamage } from '~/utils/nimbleSpellDamage'
import {
  chargedActions,
  critBonus,
  spellOnCrit,
  spellRollRules,
  spellNeeds,
  spellOnHit,
  spellSelfEffects,
  missHitsCaster,
  freeDefend,
  dyingDiscount,
  healDice,
  lifeDrain,
  wardNote,
} from '~/utils/nimbleSpellRules'
import { conditionMods, oddsReasons, spendHelp, statusFromSpell } from '~/utils/nimbleConditions'
import { parseDice, rollDice, rollDie, showOutcome, sign } from '~/utils/dice'
import {
  armorDice,
  armorDiceWhy,
  armorHit,
  armorRule,
  ignoresArmor,
} from '~/utils/nimbleTargetArmor'
import { sacrificeMinions } from '~/utils/nimbleSummons'
import type { NimbleResultOptions } from './useNimbleActions'

/** A spell that is itself 1/turn ("… 1/turn. …"), not one with a 1/turn part (Summon Shadows' command). */
const ONCE_PER_TURN = /(?:^|\.\s+)1\/turn\./
const REACTION = /\bReaction:/

export function useNimbleSpells(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const situation = useAttackSituation()
  const target = useAttackTarget()
  const attackOdds = useAttackOdds()
  const critReady = useCritReady()
  const armorOf = (s: { desc: string }) => ({
    armor: target.value.armor,
    vulnerable: target.value.vulnerable,
    ignore: ignoresArmor(s.desc) ? 'ignores armor' : '',
  })

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

  const archmage = computed(() => {
    const counter = abilityCounters(sheet.value, draft.value.level).find(
      (e) =>
        abilityBaseName(e.ability.name) === 'Archmage' &&
        /costs 1 action less and 5 fewer mana/.test(e.ability.desc),
    )?.counters[0]
    return counter && counter.used < counter.max ? counter : null
  })

  const abilityMatch = (pattern: RegExp) => {
    for (const a of sheet.value.abilities) {
      const m = pattern.exec(a.desc)
      if (m) return { name: abilityBaseName(a.name), m }
    }
    return null
  }
  const has = (pattern: RegExp) => sheet.value.abilities.some((a) => pattern.test(a.desc))
  const chaos = computed(() =>
    has(/\bWhenever you cast a spell, you can choose to spend 1 less mana\b/),
  )

  type AltKey = 'chaos' | 'self' | 'temp' | 'hp' | 'free' | 'wounds' | 'initiative'
  interface SpellAlt {
    key: AltKey
    label: string
    why: string
    /** Cast without actions, so neither the turn nor a spell in progress holds it back. */
    free?: boolean
  }

  function spellAlts(s: SpellDef, mana: number, plain: boolean): SpellAlt[] {
    if (s.tier === 0) return []
    const alts: SpellAlt[] = []
    const pool = manaPool(sheet.value)
    if (chaos.value && plain && mana >= 1)
      alts.push({
        key: 'chaos',
        label: `Cast · ${mana - 1} mana · Invoke Chaos`,
        why: mana - 1 > pool ? 'Not enough mana' : '',
      })
    const self = abilityMatch(
      /\bYou may cast ([A-Z][\w ]+?) without Pilfering Power by including yourself in the damage\b/,
    )
    if (self?.m[1] === s.name && pact.value)
      alts.push({ key: 'self', label: `Cast · you're in the blast (${self.name})`, why: '' })
    const temp = abilityMatch(
      /\bYou can cast ([A-Z][\w ]+?) or ([A-Z][\w ]+?) without Pilfering Power by expending (\d+) temp HP\b/,
    )
    if (temp && (temp.m[1] === s.name || temp.m[2] === s.name)) {
      const n = Number(temp.m[3])
      alts.push({
        key: 'temp',
        label: `Cast · ${n} temp HP (${temp.name})`,
        why: sheet.value.tempHp < n ? `Needs ${n} temp HP` : '',
      })
    }
    const hp = abilityMatch(/\bPay half your max HP to cast ANY (\w+) spell\b/)
    if (hp && s.school === hp.m[1]!.toLowerCase()) {
      const half = Math.floor(sheet.value.hpMax / 2)
      alts.push({
        key: 'hp',
        label: `Cast · ${half} HP (${hp.name})`,
        why: sheet.value.hp <= half ? 'Not enough HP' : '',
      })
    }
    const free = abilityMatch(/\(1\/Safe Rest\) You can cast ([A-Z][\w ]+?) for 0 mana\b/)
    if (free?.m[1] === s.name) {
      const counter = freeCounter(free.name)
      alts.push({
        key: 'free',
        label: `Cast · 0 mana (${free.name})`,
        why: !counter || counter.used >= counter.max ? 'Used this Safe Rest' : '',
      })
    }
    const initiative = initiativeCasts(sheet.value).find((c) => c.spell === s.name)
    if (initiative && initiativeCastReady(sheet.value, s.name)) {
      const extra = castTier(s) - s.tier
      alts.push({
        key: 'initiative',
        label: `Cast · ${extra ? `${extra} mana` : 'free'} (${initiative.ability})`,
        why: extra > pool ? 'Not enough mana' : '',
        free: true,
      })
    }
    const wounds = abilityMatch(/\bGain 1d4 Wounds to cast ([A-Z][\w ]+)\b/)
    if (wounds?.m[1]?.trim() === s.name)
      alts.push({ key: 'wounds', label: `Cast · 1d4 Wounds (${wounds.name})`, why: '' })
    return alts
  }

  function freeCounter(name: string) {
    return abilityCounters(sheet.value, draft.value.level)
      .find((e) => abilityBaseName(e.ability.name) === name)
      ?.counters.find((c) => c.period === 'rest')
  }

  function primordial(s: SpellDef, spent: number): string {
    if (spent < 2 || !has(/\bSpending 2\+ mana on a spell grants an additional effect\b/)) return ''
    const wil = sheet.value.stats.WIL
    if (s.school === 'ice') {
      sheet.value.tempHp = Math.max(sheet.value.tempHp, wil)
      return `Primordial Force: ${wil} temp HP.`
    }
    const effect: Record<string, string> = {
      lightning: `deal ${wil} more damage`,
      radiant: `you may heal a creature within 6 spaces ${wil} HP`,
      wind: 'gain a flying speed this turn and move up to 6 spaces for free',
    }
    return effect[s.school] ? `Primordial Force: ${effect[s.school]}.` : ''
  }

  function greedyPact(hurt: number): string {
    if (!has(/\bWhen you would take damage from Pilfer Power, make a STR save\b/))
      return takeDamage(sheet.value, hurt, draft.value.level)
    if (sheet.value.ownDice)
      return `Greedy Pact: make a STR save (1–9: take ${hurt}; 10–19: take 10; 20+: no damage and the spell is 1 tier higher), then apply it.`
    const save = rollDie(20) + sheet.value.stats.STR
    if (save >= 20)
      return `Greedy Pact: STR save ${save}, no damage and the spell is cast 1 tier higher.`
    const taken = save >= 10 ? Math.min(10, hurt) : hurt
    return `Greedy Pact: STR save ${save}, you take ${taken}. ${takeDamage(sheet.value, taken, draft.value.level)}`
  }

  /**
   * Tier each spell is set to be cast at, when upcast. Shared per sheet, so the
   * spell cards, the attack cards and the board's Cast menu all set the same one.
   */
  const upcast = useState<Record<string, number>>(`nimble-upcast-${draft.value.id}`, () => ({}))

  function castTier(s: SpellDef): number {
    if (s.tier === 0) return 0
    if (pact.value || reaver.value) return Math.max(s.tier, maxTier.value)
    return Math.max(s.tier, Math.min(maxTier.value, upcast.value[s.name] ?? s.tier))
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
        const usesPact = !!pact.value && s.tier > 0
        const usesMinions = reaver.value && s.tier > 0
        const discount = !!archmage.value && s.tier > 0 && !usesPact && !usesMinions
        const actions =
          chargedActions(sheet.value, s) ?? Math.max(0, spellActions(s.cast) - (discount ? 1 : 0))
        const mana = Math.max(0, (discount ? at - 5 : at) - dyingDiscount(sheet.value, s))
        const left = actionsLeft(sheet.value)
        const spread = actions > left && left > 0
        const acts = spread ? ` · ${left} of ${actions} act` : actions ? ` · ${actions} act` : ''
        const verb = spread ? 'Start casting' : 'Cast'
        const n = minionCost.value
        // Waiting for your turn in combat: only reaction spells and free (0-action) casts;
        // a damaging spell is an attack and waits whatever it costs (castReason).
        const waiting = sheet.value.inEncounter && !sheet.value.turnActive
        const notNow = spellNotNow(
          {
            reaction: REACTION.test(s.desc),
            actions,
            damaging: waiting && !!spellDamage(sheet.value, draft.value.level, s, at),
          },
          sheet.value,
        )
        return {
          ...s,
          at,
          /** 'Not your turn' while waiting in combat (reaction spells and free casts excepted). */
          notNow,
          mana,
          discount,
          used: ONCE_PER_TURN.test(s.desc) && !!sheet.value.uses[`${s.name}@turn`]?.used,
          /** What the spell needs that isn't there (you Charged, a Smoldering target). */
          needs: spellNeeds(sheet.value, s, target.value),
          alts: spellAlts(s, mana, !usesPact && !usesMinions),
          actions,
          usesPact,
          usesMinions,
          bloodLabel: usesMinions && bloodCast.value ? `Cast · 1 Wound${acts}` : '',
          canUpcast: !pact.value && !reaver.value && s.tier > 0 && maxTier.value > s.tier,
          short: usesMinions
            ? n > sheet.value.summons.filter((m) => m.def === 'shadow-minion').length
            : !usesPact && mana > manaPool(sheet.value),
          spread,
          busy: castingBlocks(sheet.value, actions),
          noActions: actions > 0 && actionsLeft(sheet.value) === 0,
          /** Short cost, for compact lists. */
          cost:
            s.tier === 0
              ? 'free'
              : usesMinions
                ? `${n} minion${n === 1 ? '' : 's'}`
                : usesPact
                  ? '1 use'
                  : `${mana} mana`,
          label:
            s.tier === 0
              ? `${verb} · free${acts}`
              : usesMinions
                ? `${verb} at tier ${at} · ${n} minion${n === 1 ? '' : 's'}${acts}`
                : usesPact
                  ? `${verb} at tier ${at} · 1 use${acts}`
                  : `${verb} · ${mana} mana${discount ? ' (Archmage)' : ''}${acts}`,
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
    upcast.value = { ...upcast.value, [s.name]: Math.max(s.tier, Math.min(maxTier.value, tier)) }
  }

  function cast(s: CastableSpell, withWound = false, alt?: AltKey, roll = false) {
    const free = !!s.alts.find((a) => a.key === alt)?.free
    if (!canEdit.value || (s.busy && !free)) return
    const incapacitated = conditionMods(sheet.value, situation.value).incapacitated
    if (incapacitated) return say(`${s.name}: you are ${incapacitated} and can’t cast.`)
    if (s.notNow && !free) return say(`${s.name}: not your turn.`)
    if (s.used) return say(`${s.name}: already cast this turn (1/turn).`)
    if (s.needs) return say(`${s.name}: ${s.needs.toLowerCase()}.`)
    if (s.noActions && !free) {
      const message = 'No actions left: they come back when your turn ends.'
      say(message)
      return
    }
    const notes: string[] = []
    const option = alt ? s.alts.find((a) => a.key === alt) : undefined
    if (alt && (!option || option.why)) return option?.why && say(`${s.name}: ${option.why}.`)
    if (s.tier === 0) notes.push(`Cast ${s.name} (cantrip).`)
    else if (alt) {
      const paid = payAlt(s, alt)
      if (!paid) return
      notes.push(`Cast ${s.name} at tier ${s.at} · ${paid}`)
    } else if (s.usesMinions && withWound) {
      const charges = payBloodCast(sheet.value, draft.value.level)
      notes.push(`Cast ${s.name} at tier ${s.at} · took 1 Wound (My Blood, My Power).${charges}`)
    } else if (s.usesMinions) {
      const n = payShadowExploit(sheet.value)
      notes.push(
        `Cast ${s.name} at tier ${s.at} · sacrifice ${n} shadow minion${n === 1 ? '' : 's'}.${sacrificeMinions(sheet.value, n, draft.value.level)}`,
      )
    } else if (s.usesPact) {
      const res = sheet.value.resource
      res.count += 1
      notes.push(`Cast ${s.name} at tier ${s.at}.`)
      if (res.count > pactLimit.value) {
        const hurt = Math.floor(sheet.value.hpMax / 2)
        notes.push(`Over your limit: your patron deals ${hurt} damage to you.`)
        notes.push(greedyPact(hurt))
      }
    } else {
      if (!spendMana(sheet.value, s.mana)) return
      notes.push(
        `Cast ${s.name}${s.at > s.tier ? ` upcast to tier ${s.at}` : ''} · ${s.mana} mana${s.discount ? ' (Archmage: 1 action and 5 mana less)' : ''}.`,
      )
      const counter = s.discount ? archmage.value : null
      if (counter)
        sheet.value.uses[counter.id] = { ...sheet.value.uses[counter.id], used: counter.used + 1 }
      notes.push(primordial(s, s.mana))
    }
    notes.push(spellSelfEffects(sheet.value, s).trim())
    notes.push(freeDefend(s, s.at, armorNow(sheet.value, draft.value.level).value).trim())
    notes.push(healing(s).trim(), wardNote(s).trim())
    const status = statusFromSpell(s.name)
    if (status && !sheet.value.conditions.includes(status))
      notes.push(`On yourself? Turn on ${status} in Conditions.`)
    // Actions the turn can't cover carry over; Concentration starts once it is cast.
    const progress = castSpell(
      sheet.value,
      s.name,
      free ? 0 : s.actions,
      draft.value.level,
      s.at,
    ).trim()
    if (progress) notes.push(progress)
    if (ONCE_PER_TURN.test(s.desc)) sheet.value.uses[`${s.name}@turn`] = { used: 1 }
    if (roll) notes.push(damageNote(s))
    if (sheet.value.ownDice && spellDamage(sheet.value, draft.value.level, s, s.at))
      critReady.value = { ...critReady.value, [`spell:${s.name}`]: 1 }
    if (spellDamage(sheet.value, draft.value.level, s, s.at)) {
      if (sheet.value.turnActive) sheet.value.rushed += 1
      notes.push(spendHelp(sheet.value).trim())
    }
    if (sheet.value.dying) notes.push('Dying: DC 10 STR save or take 1 Wound.')
    if (/\bdamage\b/i.test(s.desc)) notes.push(endEffects(sheet.value, 'attack').trim())
    notes.push(endEffects(sheet.value, 'spell').trim())
    const message = notes.filter(Boolean).join(' ')
    say(message)
    options.onResult?.(message)
  }

  function payAlt(s: CastableSpell, alt: AltKey): string {
    const v = sheet.value
    if (alt === 'chaos') {
      if (!spendMana(v, s.mana - 1)) return ''
      const twice = has(/\bWhenever you Invoke Chaos, you may roll twice\b/) ? ', twice' : ''
      const adv = has(/\bWhenever you Invoke Chaos, roll with advantage\b/)
        ? ', with advantage'
        : ''
      return `${s.mana - 1} mana. Invoke Chaos: roll on the Chaos Table${adv}${twice}. ${primordial(s, s.mana - 1)}`.trim()
    }
    if (alt === 'self')
      return 'no Pilfered Power: you are in the damage too (advantage on the save).'
    if (alt === 'temp') {
      const n = Number(
        /by expending (\d+) temp HP/.exec(v.abilities.map((a) => a.desc).join(' '))?.[1] ?? 0,
      )
      v.tempHp -= n
      return `spent ${n} temp HP.`
    }
    if (alt === 'hp') {
      const half = Math.floor(v.hpMax / 2)
      v.hp -= half
      return `paid ${half} HP. The next creature to hit you in melee this encounter takes ${Math.floor(half / 2)} cold damage.`
    }
    if (alt === 'free') {
      const owner = s.alts.find((a) => a.key === 'free')?.label.match(/\(([^)]+)\)/)?.[1] ?? ''
      const counter = freeCounter(owner)
      if (counter) v.uses[counter.id] = { ...v.uses[counter.id], used: counter.used + 1 }
      return `0 mana (${owner}).`
    }
    if (alt === 'initiative') {
      const extra = s.at - s.tier
      if (extra && !spendMana(v, extra)) return ''
      v.uses[`${s.name}~ready`] = { used: 0 }
      const owner = initiativeCasts(v).find((c) => c.spell === s.name)?.ability ?? ''
      return `${extra ? `${extra} mana for the upcast` : 'free'}, no actions (${owner}).`
    }
    if (v.ownDice) return 'roll 1d4 and mark that many Wounds.'
    const n = rollDie(4)
    return `${n} Wound${n === 1 ? '' : 's'} (1d4).${gainWounds(v, n, draft.value.level)}`
  }

  /** Heal's roll, and Vampiric Greed's Wound, damage and healing. */
  function healing(s: CastableSpell): string {
    const h = healDice(sheet.value, s, s.at, s.mana)
    if (h) {
      const cleanse = h.cleanse ? ' You may also heal 1 negative condition or 1 Wound.' : ''
      if (sheet.value.ownDice)
        return `Roll ${h.count}d${h.sides}+${h.mod} healing yourself.${cleanse}`
      const r = rollDice({ count: h.count, sides: h.sides, mod: h.mod })
      const line = `Heals ${r.total} HP (${h.count}d${h.sides}: ${r.rolls.join(', ')} ${sign(h.mod)}).${cleanse}`
      showOutcome({ label: s.name, total: r.total, detail: line })
      return line
    }
    const d = lifeDrain(s)
    if (!d) return ''
    const wound = gainWounds(sheet.value, d.wounds, draft.value.level)
    const cost = `You gain ${d.wounds} Wound${d.wounds === 1 ? '' : 's'}.${wound}`
    const saves = ' Gain 1 more Wound for each creature that makes its STR save.'
    if (sheet.value.ownDice)
      return `${cost} Roll ${d.count}d${d.sides} against each adjacent creature and heal the damage done.${saves}`
    const r = rollDice({ count: d.count, sides: d.sides, mod: 0 })
    heal(sheet.value, r.total)
    const line = `${cost} ${r.total} damage to each adjacent creature (${d.count}d${d.sides}: ${r.rolls.join(', ')}); healed ${r.total} HP, ${r.total} more for each other creature hit.${saves}`
    showOutcome({ label: s.name, total: r.total, detail: line })
    return line
  }

  function damageNote(s: CastableSpell): string {
    const damage = spellDamage(sheet.value, draft.value.level, s, s.at)
    if (!damage) return ''
    const type = damage.type ? ` ${damage.type}` : ''
    const rushed =
      sheet.value.rushed +
      conditionMods(sheet.value, situation.value, {
        ...attackOdds.value,
        condemned: target.value.condemned ?? 0,
        covered: !!target.value.covered,
      }).disadvantage
    const rush =
      rushed > 0 ? ` with ${rushed}× disadvantage` : rushed < 0 ? ` with ${-rushed}× advantage` : ''
    const rules = spellRollRules(s, s.at, target.value)
    // This attack takes the target's Condemn advantage.
    if (target.value.condemned) target.value = { ...target.value, condemned: 0 }
    const backfire = missHitsCaster(s)
    if (sheet.value.ownDice || !damage.rollable) {
      const onHit = spellOnHit(s, { miss: false, crit: false }, target.value, s.at)
      const chips = onHit.chips.length
        ? ` If it hits, ${onHit.chips.join(' and ')} on the Target row.`
        : ''
      const strikesYou = backfire ? ' On a miss it strikes you instead: take that damage.' : ''
      const bump = rules.bump ? ` Upcast: raise any die by ${rules.bump}.` : ''
      const anyMax = rules.critOnAnyMax
        ? ' Any die at its max counts as a crit (the target is Hampered).'
        : ''
      return `Roll ${damage.text}${type}${rush} yourself${damage.single ? ' (a 1 on the first die misses)' : ''}.${armorRule(armorOf(s))}${anyMax}${bump}${onHit.note}${chips}${strikesYou}`
    }
    const result = rollSpellDamage(damage, Math.random, rushed, rules)
    if (!result) return ''
    if (result.miss) {
      let back = ''
      if (backfire) {
        const hurt = takeDamage(sheet.value, result.total, draft.value.level).trim()
        back = ` It strikes you instead: ${result.total}${type} damage.${hurt ? ` ${hurt}` : ''}`
      }
      showOutcome({ label: s.name, total: 0, detail: `Miss (first die rolled a 1).${back}` })
      return `Miss (first die rolled a 1)${rush} [${result.detail}].${back}`
    }
    const expr = parseDice(damage.dice)
    const isCrit = result.crit
    const maxCrit = isCrit && !!rules.critOnAnyMax && result.dice[0] !== expr?.sides
    const bonus = isCrit ? critBonus(s, s.at) : 0
    const crit = isCrit ? ` ${critTriggers(sheet.value, draft.value.level, s.name)}` : ''
    const hit = armorHit(result.total + bonus, expr?.mod ?? 0, armorOf(s), isCrit)
    const effects = spellOnHit(s, { miss: false, crit: isCrit }, target.value, s.at)
    target.value = { ...target.value, ...effects.target }
    const why = maxCrit ? ' (a max die against a Hampered target)' : ''
    const extra = `${rules.bump ? `, upcast +${rules.bump} to the dice` : ''}${bonus ? `, +${bonus} on the crit` : ''}`
    const line = `${hit.damage}${type} damage${hit.note}${isCrit ? ` · critical${why}` : ''}${rush} [${damage.dice}: ${result.detail}${extra}].${effects.note}${crit.trimEnd()}`
    // The tray's total: modifiers, crit damage and armor, not just the dice.
    showOutcome({ label: s.name, total: hit.damage, detail: line })
    return line
  }

  const spellAttacks = computed(() =>
    tiers.value
      .flatMap((g) => g.spells)
      .flatMap((s) => {
        const damage = spellDamage(sheet.value, draft.value.level, s, s.at)
        if (!damage || REACTION.test(s.desc)) return []
        const range = /^(Range|Reach|Line|Cone)[^.]*/.exec(s.desc)?.[0] ?? ''
        const cond = conditionMods(sheet.value, situation.value, {
          ...attackOdds.value,
          condemned: target.value.condemned ?? 0,
          covered: !!target.value.covered,
        })
        const odds = sheet.value.rushed + cond.disadvantage
        const why = castReason(s, {
          turnActive: !sheet.value.inEncounter || sheet.value.turnActive,
          incapacitated: cond.incapacitated,
        })
        return [
          {
            key: `spell:${s.name}`,
            name: s.name,
            dmg: damage.text,
            armorDmg: armorDice(damage.text, armorOf(s)),
            critBy: [
              ...critTriggerSources(sheet.value, s.name),
              spellOnCrit(s, target.value).note ? `${s.name}’s crit` : '',
            ].filter(Boolean),
            critReady: !!critReady.value[`spell:${s.name}`],
            /**
             * The player rolled a crit themselves: the spell's own crit effect on the
             * target (Flame Dart: Smoldering) and "whenever they would crit", once.
             */
            crit: () => {
              if (!canEdit.value || !spendCrit(critReady, `spell:${s.name}`)) return
              const own = spellOnCrit(s, target.value)
              target.value = { ...target.value, ...own.target }
              const message = `${s.name} crit!${own.note} ${critTriggers(sheet.value, draft.value.level, s.name)}`
              say(message.trim())
              options.onResult?.(message.trim())
            },
            armorWhy: armorDiceWhy(damage.text, armorOf(s)),
            props: [
              range,
              damage.type,
              ONCE_PER_TURN.test(s.desc) ? '1/turn' : '',
              damage.single ? '' : 'does not miss',
            ]
              .filter(Boolean)
              .join(' · '),
            tier: s.tier,
            price: s.cost,
            rushed: Math.max(0, odds),
            advantage: Math.max(0, -odds),
            oddsWhy: oddsReasons(sheet.value.rushed, cond),
            cost: [
              `${s.actions} action${s.actions === 1 ? '' : 's'}`,
              s.at > s.tier || s.discount
                ? `${s.cost}${s.at > s.tier ? ` (tier ${s.at})` : ''}`
                : '',
            ]
              .filter(Boolean)
              .join(' · '),
            why,
            spell: s,
            run: () => cast(s, false, undefined, true),
          },
        ]
      }),
  )

  const spellAttackTiers = computed(() =>
    [...new Set(spellAttacks.value.map((a) => a.tier))]
      .sort((a, b) => a - b)
      .map((tier) => ({
        tier,
        label: tiers.value.find((g) => g.tier === tier)?.label ?? `Tier ${tier}`,
        spells: spellAttacks.value.filter((a) => a.tier === tier),
      })),
  )

  /** Spells cast as a reaction ("Reaction: When attacked…"), offered beside the reactions. */
  const reactionSpells = computed(() =>
    tiers.value
      .flatMap((g) => g.spells)
      .filter((s) => REACTION.test(s.desc))
      .map((s) => ({
        ...s,
        trigger: /\bReaction:\s*([^.]+)/.exec(s.desc)?.[1]?.trim() ?? '',
        blocked: s.needs
          ? s.needs
          : s.used
            ? 'Used this turn'
            : s.busy
              ? 'Finish casting first'
              : s.noActions
                ? 'No actions left'
                : s.short
                  ? s.usesMinions
                    ? `Needs ${s.cost}`
                    : `Needs ${s.mana} mana`
                  : '',
      })),
  )

  /** Spells that summon (Summon Shadows, Lifebinding Spirit…), cast from the Summons panel. */
  const summonSpells = computed(() =>
    tiers.value
      .flatMap((g) => g.spells)
      .filter((s) => !!summonBySource(s.name))
      .map((s) => ({
        ...s,
        summon: summonBySource(s.name)!.id,
        blocked:
          sheet.value.inEncounter && !sheet.value.turnActive
            ? 'Not your turn'
            : s.needs
              ? s.needs
              : s.used
                ? 'Used this turn'
                : s.busy
                  ? 'Finish casting first'
                  : s.noActions
                    ? 'No actions left'
                    : s.short
                      ? s.usesMinions
                        ? `Needs ${s.cost}`
                        : `Needs ${s.mana} mana`
                      : '',
      })),
  )

  const pool = computed(() => {
    if (reaver.value) {
      const minions = sheet.value.summons.filter((m) => m.def === 'shadow-minion').length
      return { label: 'Shadow minions', value: `${minions}`, low: minions < minionCost.value }
    }
    if (pact.value) {
      const left = pactLimit.value - sheet.value.resource.count
      return { label: pact.value.name, value: `${left}/${pactLimit.value}`, low: left <= 0 }
    }
    const { current, max, temp } = sheet.value.mana
    if (max <= 0 && temp <= 0) return null
    return {
      label: 'Mana',
      value: `${current}/${max}${temp ? ` +${temp}` : ''}`,
      low: current + temp <= 0,
    }
  })

  return {
    known,
    utility,
    maxTier,
    tiers,
    reactionSpells,
    summonSpells,
    spellAttacks,
    spellAttackTiers,
    pool,
    help,
    setUpcast,
    cast,
  }
}
