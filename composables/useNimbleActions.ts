// Attacks, reactions and limited-use abilities of the Nimble sheet in the
// current sheet editor. Shared by the sheet's Actions panel and the board's action panel.
import { REACTIONS, weaponByName } from '~/data/nimble/core'
import { WEAPON_MISHAPS } from '~/data/nimble/effects'
import { summonBySource } from '~/data/nimble/summons'
import type { NimbleSheet } from '~/types/sheets'
import { parseDice, rollNimble } from '~/utils/dice'
import { abilityBaseName, malfunctionRisks, sheetResource } from '~/utils/nimbleBuild'
import {
  abilityRoll,
  isAttackRoll,
  afterEffectAttack,
  applyEffect,
  effectAttacks,
  effectSources,
  endEffect,
  endEffects,
  setMalfunction,
} from '~/utils/nimbleEffects'
import { itemAttack, rollRiders } from '~/utils/nimbleItems'
import { conditionMods, oddsReasons, spendHelp } from '~/utils/nimbleConditions'
import {
  armorDice,
  armorDiceWhy,
  armorHit,
  armorRule,
  ignoresArmor,
} from '~/utils/nimbleTargetArmor'
import {
  afterSummonedAttack,
  companionAttack,
  summonFromAbility,
  summonedWeapons,
} from '~/utils/nimbleSummons'
import {
  abilityCounters,
  actionsLeft,
  costLabel,
  costShort,
  counterCost,
  type CounterCost,
  dyingAttackSave,
  endTurn,
  expendJudgment,
  freeMove,
  afterAttack,
  critTriggerNames,
  attackBonus,
  isBloodied,
  manaCost,
  manaPool,
  noteMiss,
  zealotMax,
  payCost,
  refundActions,
  selfGains,
  spendMana,
  stealActions,
  stealState,
  sufferWound,
  shortMessage,
  heldInventions,
  operateInvention,
  poweredBy,
  resourceOnAttack,
  rollJudgment,
  spendActions,
  spendPower,
  spendResourceMove,
  startTurn,
  rage,
  endRage,
  spendFury,
  usedUpLabel,
} from '~/utils/nimblePlay'

/** Up to this many uses show as pips; larger pools (Lay on Hands) show a bar. */
export const MAX_PIPS = 10

export interface NimbleResultOptions {
  /** Called with each result message, after it is shown on the sheet. */
  onResult?: (message: string) => void
}

export interface AbilityCounterView {
  id: string
  name: string
  max: number
  used: number
  cost?: CounterCost
  text?: string
}

function resourcePattern(r: { name: string; ability: string; kind: string; diceName: string }) {
  const short = r.name
    .split(/\s+/)
    .map((w) => (/^(of|the|and)$/i.test(w) ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()))
    .join('')
  const dice = ['dice', 'power', 'judgment', 'rage'].includes(r.kind)
    ? `${r.diceName} Di(?:e|ce)`
    : ''
  const words = [r.name, r.ability]
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .concat(dice, short.length > 2 ? short : '')
    .filter(Boolean)
  return new RegExp(`\\b(?:${words.join('|')})\\b`)
}

const CLASS_REACTION = /^(?:\([^)]*\)\s*)?Reaction\b/
const STARTS_AS_ACTION =
  /^(?:\([^)]*\)\s*)?(?:Action(?::|\/Reaction\b)|\d+ actions?:|Spend \d+ actions?\b|You may spend \d+ actions?\b)/
const WOUND_USE = /\byou may (?:gain|suffer) (?:1|a) Wound to (?!gain\b|double\b)/
const EXTRA_ACTIONS = /\byou may spend (\d+) additional actions? to\b/
const STEAL = /\bSteal up to (?:STR|DEX|INT|WIL) actions from your next turn\b/
const ATTACK_TEXT =
  /\b(?:[Aa]ttack (?:a target|ALL|your|with a|them|on your turn)|make (?:an?|\d+) (?:melee |ranged |weapon )?attacks?|[Ss]hoot\b|shooting\b|This attack\b)/
const FREE_ATTACK = /\bmake (?:an?|\d+) (?:melee |ranged |weapon )?attacks?\b[^.]*\bfor free\b/i

export function useNimbleActions(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const resource = computed(() => sheetResource(sheet.value, draft.value.level))
  const resourceKey = computed(() =>
    resource.value?.ability ? abilityBaseName(resource.value.ability) : '',
  )
  const ready = useState(`nimble-power-${draft.value.id}`, () => 0)
  const readied = computed(() => Math.min(ready.value, sheet.value.resource.count))
  const zeal = useState(`nimble-zealot-${draft.value.id}`, () => 0)
  const quarry = useState<'' | 'damage' | 'advantage'>(`nimble-quarry-${draft.value.id}`, () => '')
  const hasMark = computed(() =>
    sheet.value.abilities.some((a) => /\bmarked as your quarry\b.*\+LVL damage/.test(a.desc)),
  )
  const NO_NEXT = { flat: 0, clean: false, note: '', ignoreArmor: '' }
  const nextAttack = useState(`nimble-next-attack-${draft.value.id}`, () => ({ ...NO_NEXT }))
  const zealMax = computed(() => zealotMax(sheet.value))
  const zealot = computed(() => Math.min(zeal.value, zealMax.value))
  const prepaid = useState(`nimble-prepaid-${draft.value.id}`, () => 0)
  const paidUses = useState<string[]>(`nimble-paid-uses-${draft.value.id}`, () => [])
  const opportunity = useState(`nimble-opportunity-${draft.value.id}`, () => false)
  const situation = useAttackSituation()
  const target = useAttackTarget()
  const critReady = useCritReady()
  watch(
    () => sheet.value.turnActive,
    (on, was) => {
      if (on !== was) {
        prepaid.value = 0
        paidUses.value = []
        opportunity.value = false
        situation.value = []
        nextAttack.value = { ...NO_NEXT }
        critReady.value = {}
      }
      if (on && !was) target.value = { ...target.value, sundered: false }
    },
  )

  /** The target's armor as it meets this attack (Core p. 14), with what bypasses it. */
  function armorFor(opts: { text?: string; melee?: boolean; ignore?: string; lighter?: boolean }) {
    const t = target.value
    const ignore =
      opts.ignore ||
      (opts.text && ignoresArmor(opts.text) ? 'ignores armor' : '') ||
      (opts.melee && t.sundered ? 'Sunder Armor' : '')
    return { armor: t.armor, vulnerable: t.vulnerable, ignore, lighter: opts.lighter }
  }

  function spendAttackAction() {
    opportunity.value = false
    if (prepaid.value > 0) prepaid.value -= 1
    else spendActions(sheet.value)
  }

  const frenzyOpportunity = computed(
    () =>
      sheet.value.resource.active &&
      sheet.value.abilities.some((a) =>
        /\bWhile Raging, you can make opportunity attacks without disadvantage\b/.test(a.desc),
      ),
  )

  /** An "Action: Attack" ability paid for the next attack roll; "ignoring their armor" carries over. */
  function paidFor(cost: CounterCost | undefined, before: number, text = '', name = '') {
    if (!cost?.attack || sheet.value.actionsSpent <= before) return
    prepaid.value += 1
    if (ignoresArmor(text))
      nextAttack.value = {
        ...nextAttack.value,
        ignoreArmor: abilityBaseName(name) || 'ignores armor',
      }
  }
  const held = computed(() => sheet.value.resource.rolls.reduce((a, b) => a + b, 0))
  const left = computed(() => actionsLeft(sheet.value))
  const NO_ACTIONS = 'No actions left: they come back when your turn ends.'
  const NOT_TURN = 'Not your turn'
  /** Waiting for your turn in combat; outside combat anything can be rolled. */
  const offTurn = computed(() => sheet.value.inEncounter && !sheet.value.turnActive)
  const cond = computed(() => conditionMods(sheet.value, situation.value))

  function report(message: string) {
    say(message)
    options.onResult?.(message)
  }

  const attacks = computed(() =>
    [
      ...sheet.value.attacks.map((a) => {
        const item = sheet.value.inventory.find((i) => i.name === a.name && i.custom)
        return (item && itemAttack(sheet.value, item, draft.value.level)) ?? a
      }),
      ...summonedWeapons(sheet.value, draft.value.level),
      ...effectAttacks(sheet.value, draft.value.level),
    ].map((w) => {
      const res = sheet.value.resource
      const weapon = weaponByName(w.name)
      const strAttack = weapon ? weapon.stat === 'STR' : w.melee
      const fury =
        resource.value?.kind === 'rage' && res.active && strAttack
          ? res.rolls.reduce((a, b) => a + b, 0)
          : 0
      const die = resource.value?.die ?? res.die
      // Swift Fists and the like say so in the weapon's properties.
      const next = nextAttack.value
      const oa = opportunity.value && prepaid.value > 0
      const rushed = oa || /no rushed/i.test(w.props) || next.clean ? 0 : sheet.value.rushed
      const oaDisadvantage = oa && !frenzyOpportunity.value ? 1 : 0
      const odds = rushed + cond.value.disadvantage + oaDisadvantage
      const meleeOnly = oa && !w.melee
      const r = resource.value
      const powered = poweredBy(r, w.props) && readied.value > 0
      const judged = r?.kind === 'judgment' && w.melee && held.value > 0
      const note =
        r?.kind === 'rage' && strAttack
          ? res.active
            ? `${r.name}: +${fury} Fury`
            : 'Not raging'
          : r?.kind === 'judgment' && w.melee
            ? held.value
              ? `${r.diceName} Dice held: +${held.value} radiant`
              : `No ${r.diceName} Dice held`
            : r?.kind === 'crit'
              ? res.count === 0
                ? `${r.name}: +${r.roll}d${r.die} on a crit`
                : `${r.name} used this turn`
              : ''
      const sneak = r?.kind === 'crit' && res.count === 0 ? note : ''
      const bonus = attackBonus(sheet.value, draft.value.level, w, held.value)
      const zealous = w.melee && zealMax.value > 0
      const zealDamage = zealous ? zealot.value * 5 : 0
      const quarryFlat = hasMark.value && quarry.value === 'damage' ? draft.value.level : 0
      const flat = bonus.flat + quarryFlat + next.flat
      const armor = armorFor({ text: w.props, melee: w.melee, ignore: next.ignoreArmor })
      const diceDmg = `${w.flat !== undefined ? '' : w.dmg}${powered ? `+${readied.value}d${die}` : ''}`
      const rolledDice = fury + (judged ? held.value : 0)
      const has = (pattern: RegExp) => sheet.value.abilities.some((a) => pattern.test(a.desc))
      const situational = [
        hasMark.value && quarry.value === 'advantage' ? 'advantage vs quarry' : '',
        quarryFlat ? `+${quarryFlat} vs quarry` : '',
        isBloodied(sheet.value) &&
        sheet.value.rushed === 0 &&
        has(/\bWhile you are Bloodied, gain advantage on the first attack you make each turn\b/)
          ? 'advantage (Pain Sharpens the Mind)'
          : '',
        w.melee &&
        held.value > 0 &&
        has(/\bIncrease your primary die rolls on melee attacks by 1\b/)
          ? '+1 primary die (Unerring Judgment)'
          : '',
        !sheet.value.uses['Ambusher@encounter']?.used &&
        sheet.value.inEncounter &&
        has(/\bGain advantage on the first attack you make each encounter\b/)
          ? 'advantage (Ambusher)'
          : '',
        next.note,
      ].filter(Boolean)
      const burning = has(/\bDouble any fire damage you deal\b/) ? 'fire' : ''
      const finish = (miss: boolean, crit: boolean) => {
        nextAttack.value = { ...NO_NEXT }
        if (has(/\bGain advantage on the first attack you make each encounter\b/))
          sheet.value.uses['Ambusher@encounter'] = { used: 1 }
        const help = spendHelp(sheet.value)
        return sheet.value.ownDice
          ? help
          : help +
              afterAttack(sheet.value, draft.value.level, {
                melee: w.melee,
                miss,
                crit,
                quarry: hasMark.value && !!quarry.value,
              })
      }
      return {
        name: w.name,
        props: w.props,
        dmg:
          (w.flat !== undefined ? `${w.flat} (${w.dmg} to hit)` : w.dmg) +
          (fury ? ` +${fury}` : '') +
          (powered ? ` +${readied.value}d${die}` : '') +
          (judged ? ` +${held.value}` : '') +
          (flat ? ` +${flat}` : '') +
          (zealDamage ? ` +${zealDamage}` : ''),
        armorDmg: armorDice(diceDmg, armor, rolledDice),
        critBy: [
          ...critTriggerNames(sheet.value, {
            melee: w.melee,
            quarry: hasMark.value && !!quarry.value,
          }),
          r?.kind === 'crit' && res.count === 0 ? r.name : '',
          w.onCrit?.length ? `${w.name} on-crit damage` : '',
          w.name === 'Sting' ? 'Sting' : '',
        ].filter(Boolean),
        critReady: !!critReady.value[`w:${w.name}`],
        /** The player rolled a crit themselves: set off what the app would have, once. */
        crit: () => {
          if (!canEdit.value || !spendCrit(critReady, `w:${w.name}`)) return
          const notes = [
            afterAttack(sheet.value, draft.value.level, {
              melee: w.melee,
              miss: false,
              crit: true,
              quarry: hasMark.value && !!quarry.value,
            }).trim(),
          ]
          if (r?.kind === 'crit' && res.count === 0) {
            res.count = 1
            notes.push(`${r.name}: add ${r.roll}d${r.die} (used this turn).`)
          }
          if (w.onCrit?.length) notes.push(`Add ${w.onCrit.join(' + ')}.`)
          notes.push(
            afterEffectAttack(sheet.value, draft.value.level, w.name, {
              miss: false,
              crit: true,
            }).note.trim(),
          )
          report(`${w.name} crit! ${notes.filter(Boolean).join(' ') || 'Nothing else triggers.'}`)
        },
        armorWhy: armorDiceWhy(diceDmg || w.dmg, armor),
        boost: [
          oa && !oaDisadvantage ? 'Opportunity Attack (no disadvantage: Opportunistic Frenzy)' : '',
          note,
          ...bonus.notes,
          ...situational,
        ]
          .filter(Boolean)
          .join(' · '),
        oddsWhy: oddsReasons(rushed, cond.value, oaDisadvantage ? 'Opportunity Attack' : ''),
        zealot: zealous,
        melee: w.melee,
        rushed: Math.max(0, odds),
        advantage: Math.max(0, -odds),
        poweredBy: poweredBy(r, w.props),
        mishap: poweredBy(r, w.props) ? WEAPON_MISHAPS[w.name] : undefined,
        blocked:
          !!cond.value.incapacitated ||
          meleeOnly ||
          ((left.value === 0 || offTurn.value) && prepaid.value === 0),
        why: cond.value.incapacitated
          ? cond.value.incapacitated
          : meleeOnly
            ? 'Opportunity attacks are melee'
            : prepaid.value > 0
              ? ''
              : offTurn.value
                ? NOT_TURN
                : left.value === 0
                  ? 'No actions left'
                  : '',
        roll: () => {
          if (!canEdit.value) return
          const onTurn = sheet.value.turnActive && !oa
          if (cond.value.incapacitated)
            return report(`${w.name}: you are ${cond.value.incapacitated} and can’t act.`)
          if (meleeOnly) return report(`${w.name}: an opportunity attack has to be a melee attack.`)
          if (offTurn.value && prepaid.value === 0)
            return report(
              `${w.name}: not your turn. Start your turn to attack (reactions still work).`,
            )
          if (left.value === 0 && prepaid.value === 0) return report(NO_ACTIONS)
          if (sheet.value.ownDice) {
            const notes: string[] = []
            if (powered && readied.value > 0) {
              const n = Math.min(readied.value, res.count)
              res.count -= n
              ready.value = 0
              notes.push(
                `spent ${n} ${r?.diceName} ${n === 1 ? 'Die' : 'Dice'}, add ${n}d${die}; mishap if any die rolls ${n} or less`,
              )
            }
            if (judged) notes.push(`${expendJudgment(sheet.value)} Add it on a hit`)
            if (fury) notes.push(`add ${fury} Fury`)
            if (flat) notes.push(`add ${flat}`)
            if (situational.length) notes.push(situational.join(', '))
            if (zealDamage) {
              const n = zealot.value
              spendMana(sheet.value, n)
              zeal.value = 0
              notes.push(
                `Zealot: spent ${n} mana; on a hit add +${zealDamage} radiant (or use Blessed Aim)`,
              )
            }
            if (w.onHit?.length) notes.push(`on a hit, add ${w.onHit.join(' + ')}`)
            if (w.onCrit?.length) notes.push(`on a crit, add ${w.onCrit.join(' + ')}`)
            if (sneak)
              notes.push(`on a crit, add ${r?.roll}d${r?.die} Sneak Attack and mark it used`)
            const ended = endEffects(sheet.value, 'attack')
            finish(false, false)
            spendAttackAction()
            if (onTurn) sheet.value.rushed += 1
            critReady.value = { ...critReady.value, [`w:${w.name}`]: 1 }
            const rush =
              odds > 0 ? ` with ${odds}× disadvantage` : odds < 0 ? ` with ${-odds}× advantage` : ''
            return report(
              `${w.name}: attack made; roll ${w.flat !== undefined ? `${w.dmg} to hit, ${w.flat} damage` : w.dmg}${rush} yourself.${notes.length ? ` ${notes.join('. ')}.` : ''}${armorRule(armor)}${ended}`,
            )
          }
          const expr = parseDice(w.dmg)
          if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d12+3`)
          const result = rollNimble(expr, null, Math.random, odds)
          if (w.flat !== undefined && !result.miss) result.total = w.flat
          if (fury && !result.miss) {
            result.total += fury
            result.bonus = fury
          }
          const riders = result.miss
            ? { total: 0, note: '' }
            : rollRiders(
                [...(w.onHit ?? []), ...(result.crit ? (w.onCrit ?? []) : [])],
                Math.random,
                burning,
              )
          result.total += riders.total
          let zealNote = ''
          if (zealDamage) {
            const n = zealot.value
            spendMana(sheet.value, n)
            zeal.value = 0
            zealNote = ` Zealot: spent ${n} mana${result.miss ? '' : `, +${zealDamage} radiant`}.`
            if (!result.miss) result.total += zealDamage
          }
          if (result.miss) noteMiss(sheet.value)
          else result.total += flat
          const extra = resourceOnAttack(sheet.value, draft.value.level, w, result, ready.value)
          if (poweredBy(resource.value, w.props)) ready.value = 0
          const form = afterEffectAttack(sheet.value, draft.value.level, w.name, result)
          result.total += form.extra
          const after =
            form.note +
            afterSummonedAttack(sheet.value, draft.value.level, w.name, result) +
            endEffects(sheet.value, 'attack')
          const dying = dyingAttackSave(sheet.value)
            ? ' Dying: DC 10 STR save or take 1 Wound.'
            : ''
          const triggers = finish(result.miss, result.crit)
          const mods = (w.flat ?? expr.mod) + flat + zealDamage
          const hit = armorHit(result.total + extra.extra, mods, armor, result.crit)
          const hints = situational.length ? ` (${situational.join(', ')})` : ''
          if (result.miss)
            report(
              `${w.name}: miss (first die rolled a 1)${hints}.${zealNote}${extra.note}${after}${triggers}${dying}`,
            )
          else
            report(
              `${w.name}: ${hit.damage} damage${hit.note}${riders.note}${result.crit ? ' · critical' : ''}${
                result.bonus
                  ? ` (incl. ${result.bonus} ${resource.value?.diceName.toLowerCase() || 'bonus'})`
                  : ''
              }${hints}.${zealNote}${extra.note}${after}${triggers}${dying}`,
            )
          spendAttackAction()
          if (onTurn) sheet.value.rushed += 1
        },
      }
    }),
  )

  const opportunityOptions = computed(() => {
    const used = sheet.value.reactionsUsed.includes('Opportunity Attack')
    const paid = used && opportunity.value && prepaid.value > 0
    return attacks.value
      .filter((w) => w.melee)
      .map((w) => ({
        name: w.name,
        dmg: w.dmg,
        odds: (frenzyOpportunity.value ? 0 : 1) + cond.value.disadvantage,
        why: cond.value.incapacitated
          ? cond.value.incapacitated
          : used && !paid
            ? 'Used this round'
            : !paid && left.value === 0
              ? 'No actions left'
              : '',
        roll: () => {
          if (!canEdit.value) return
          if (!paid) {
            if (used || left.value === 0) return report(NO_ACTIONS)
            toggleReaction('Opportunity Attack')
          }
          attacks.value.find((a) => a.name === w.name)?.roll()
        },
      }))
  })

  const limitedNames = computed(
    () =>
      new Set(
        abilityCounters(sheet.value, draft.value.level).map((e) => abilityBaseName(e.ability.name)),
      ),
  )

  const classReactions = computed(() =>
    sheet.value.abilities
      .filter(
        (a) =>
          CLASS_REACTION.test(a.desc) &&
          !limitedNames.value.has(abilityBaseName(a.name)) &&
          !summonBySource(abilityBaseName(a.name)),
      )
      .map((a) => ({ name: abilityBaseName(a.name), desc: a.desc.replace(/^Reaction\s*/, '') })),
  )

  function reactionMax(name: string): number {
    const expert =
      name === 'Defend' &&
      sheet.value.abilities.some((a) => /\byou may Defend 2× each round\b/.test(a.desc)) &&
      sheet.value.inventory.some((i) => i.tag === 'Shield' || i.custom?.kind === 'shield')
    return expert ? 2 : 1
  }

  function reactionCount(name: string): number {
    return sheet.value.reactionsUsed.filter((n) => n === name).length
  }

  function freeReaction(name: string): boolean {
    const texts = sheet.value.abilities.map((a) => a.desc)
    if (name === 'Interpose') return texts.some((t) => /\bYou can Interpose for free\b/.test(t))
    return (
      name === 'Defend' &&
      sheet.value.reactionsUsed.includes('Interpose') &&
      texts.some((t) => /\bDefend for free whenever you Interpose\b/.test(t))
    )
  }

  function reactionExtras(name: string): string {
    const notes: string[] = []
    for (const a of sheet.value.abilities) {
      const own = abilityBaseName(a.name)
      const temp = new RegExp(
        `\\bWhenever you ${name}, gain temp HP equal to your (STR|DEX|INT|WIL)\\b`,
      ).exec(a.desc)?.[1] as keyof NimbleSheet['stats'] | undefined
      if (temp) {
        const amount = Math.max(0, sheet.value.stats[temp])
        sheet.value.tempHp = Math.max(sheet.value.tempHp, amount)
        notes.push(`${own}: ${amount} temp HP.`)
      }
      const strike = new RegExp(
        `\\bWhen you ${name}, you may first make an unarmed strike\\b[^.]*\\bfor free\\b`,
      )
      if (strike.test(a.desc)) {
        prepaid.value += 1
        notes.push(`${own}: your next attack roll is free.`)
      }
    }
    return notes.length ? ` ${notes.join(' ')}` : ''
  }

  const reactions = computed(() =>
    [...REACTIONS, ...classReactions.value].map((r) => {
      const count = reactionCount(r.name)
      const max = reactionMax(r.name)
      const used = count >= max
      const free = freeReaction(r.name)
      return {
        ...r,
        desc: r.name === 'Defend' ? `${r.desc} Your Armor is ${sheet.value.ac}.` : r.desc,
        used,
        free,
        costText: `${free ? 'Free' : 'Costs 1 action'}${max > 1 ? ` · ${max - count} of ${max} left` : ''}`,
        blocked: !used && !free && left.value === 0,
      }
    }),
  )

  /**
   * Uses a reaction, or undoes it when it's already used. Returns what using it
   * cost ("free", "spent 1 action"), or null when nothing was spent. `quiet`
   * leaves the result message to the caller (Help names its ally instead).
   */
  function toggleReaction(name: string, quiet = false): string | null {
    if (!canEdit.value) return null
    const used = sheet.value.reactionsUsed
    const attack = name === 'Opportunity Attack'
    const free = freeReaction(name)
    if (reactionCount(name) >= reactionMax(name)) {
      if (attack) opportunity.value = false
      const at = used.lastIndexOf(name)
      sheet.value.reactionsUsed = used.filter((_, i) => i !== at)
      if (!free) refundActions(sheet.value, 1)
      if (attack) prepaid.value = Math.max(0, prepaid.value - 1)
      return null
    }
    if (!free && left.value === 0) {
      report(NO_ACTIONS)
      return null
    }
    used.push(name)
    if (!free) spendActions(sheet.value)
    const paid = free ? 'free' : 'spent 1 action'
    const text = sheet.value.abilities.find((a) => abilityBaseName(a.name) === name)?.desc ?? ''
    const judgment = /\bexpend your Judgment Dice\b/i.test(text)
      ? ` ${expendJudgment(sheet.value)}`
      : ''
    const extras = reactionExtras(name)
    if (!attack) {
      if (!quiet) report(`${name}: ${paid}.${judgment}${extras}`)
      return paid
    }
    prepaid.value += 1
    opportunity.value = true
    report(`${name}: ${paid}; roll a melee attack next, it costs no more.`)
    return paid
  }

  const linkedTo = computed(() => (resource.value ? resourcePattern(resource.value) : null))

  const abilities = computed(() =>
    abilityCounters(sheet.value, draft.value.level)
      // The class resource panel already counts this one.
      .filter(({ ability }) => abilityBaseName(ability.name) !== resourceKey.value)
      .map(({ ability, counters }) => {
        const key = abilityBaseName(ability.name)
        const views = counters.map((c) => {
          const left = c.max - c.used
          return {
            ...c,
            left,
            pips: c.max <= MAX_PIPS,
            pct: Math.round((left / c.max) * 100),
            costText: costLabel(c.cost),
            short: costShort(sheet.value, c.cost),
            linked: !!linkedTo.value?.test(c.text || ability.desc),
          }
        })
        return {
          ...ability,
          key,
          companion: !!summonBySource(key)?.permanent,
          linked: views.every((c) => c.linked),
          counters: views,
        }
      }),
  )

  type AbilityView = (typeof abilities.value)[number]

  /** "Costs 2 TotH charges": what an option takes from the class resource. */
  function chargesNeeded(text: string): number {
    return Number(/\bCosts (\d+) [^:,.]*?charges?\b/i.exec(text)?.[1] ?? 0)
  }

  /** One card per option of an ability, its limits used together. */
  function optionCards(a: AbilityView, counters: AbilityView['counters']) {
    const groups = new Map<string, AbilityView['counters']>()
    for (const c of counters)
      groups.set(c.name || a.name, [...(groups.get(c.name || a.name) ?? []), c])
    return [...groups].map(([name, list]) => {
      const [first, ...rest] = list as [AbilityView['counters'][number], ...AbilityView['counters']]
      const left = Math.min(...list.map((c) => c.left))
      const charges = chargesNeeded(first.text || a.desc)
      const mana = manaCost(first.text || a.desc)
      const why =
        left === 0
          ? usedUpLabel(list.find((c) => c.left === 0))
          : charges > sheet.value.resource.count
            ? `Needs ${charges} ${resource.value?.diceName.toLowerCase() || 'charge'}${charges === 1 ? '' : 's'}`
            : mana > manaPool(sheet.value)
              ? `Needs ${mana} mana`
              : list.some((c) => c.short)
                ? 'Not enough actions'
                : ''
      return {
        key: `${a.key}:${name}`,
        ability: a.key,
        name,
        text: first.text || a.desc,
        uses: list.map((c) => `${c.left}/${c.max} ${c.label}`).join(' · '),
        max: first.max,
        period: list.map((c) => c.label).join(' · '),
        costText: first.costText,
        left,
        used: list.some((c) => c.used > 0),
        short: list.some((c) => c.short),
        off: !!why,
        why,
        use: () => spend(first, a.name, 1, rest),
        undo: () => spend(first, a.name, -1, rest),
      }
    })
  }

  /** Spends (or with a negative amount, regains) uses of an ability counter. */
  function spend(
    counter: AbilityCounterView,
    name: string,
    amount: number,
    also: AbilityCounterView[] = [],
  ) {
    if (!canEdit.value) return
    const base = abilityBaseName(name)
    const companion = summonBySource(base)
    if (
      amount > 0 &&
      companion?.permanent &&
      companion.attack?.label === counter.name &&
      sheet.value.summons.some((s) => s.def === companion.id)
    )
      return report(companionAttack(sheet.value, draft.value.level))
    const label = counter.name ? `${name} — ${counter.name}` : name
    const text = sheet.value.abilities.find((a) => a.name === name)?.desc ?? ''
    const mana = amount > 0 ? manaCost(counter.text || text) : 0
    if (mana > manaPool(sheet.value)) return report(`${label} needs ${mana} mana.`)
    let paid = ''
    if (amount > 0 && counter.cost) {
      const before = sheet.value.actionsSpent
      const result = payCost(sheet.value, counter.cost)
      if (result === null) return report(shortMessage(sheet.value, label, counter.cost))
      paidFor(counter.cost, before, counter.text || text, name)
      if (sheet.value.actionsSpent > before && !counter.cost.reaction)
        paidUses.value = [...paidUses.value, counter.id]
      paid = result
    }
    const used = Math.max(0, Math.min(counter.max, counter.used + Math.floor(amount || 0)))
    const paidNow = paidUses.value.indexOf(counter.id)
    if (amount < 0 && used < counter.used && counter.cost && paidNow >= 0) {
      paidUses.value = paidUses.value.filter((_, i) => i !== paidNow)
      refundActions(sheet.value, counter.cost.actions)
      if (counter.cost.attack) prepaid.value = Math.max(0, prepaid.value - 1)
    }
    sheet.value.uses[counter.id] = { ...sheet.value.uses[counter.id], used }
    for (const c of also)
      sheet.value.uses[c.id] = {
        ...sheet.value.uses[c.id],
        used: Math.max(0, Math.min(c.max, c.used + Math.floor(amount || 0))),
      }
    if (amount <= 0) return
    if (mana) {
      spendMana(sheet.value, mana)
      paid += ` Spent ${mana} mana.`
    }
    paid += selfGains(sheet.value, draft.value.level, counter.text || text)
    if (!counter.cost?.attack && FREE_ATTACK.test(counter.text || text)) paid += freeAttack(base)
    const judgment = /\bExpend your Judgment Dice\b/i.test(text) ? expendJudgment(sheet.value) : ''
    const summoned = [summonFromAbility(sheet.value, draft.value.level, base), judgment]
      .filter(Boolean)
      .join(' ')
    const effect = applyEffect(sheet.value, draft.value.level, base)
    report(
      `${label}: ${counter.max - used} of ${counter.max} left.${paid}${summoned ? ` ${summoned}` : ''}${gadgetRoll(base)}${effect ? ` ${effect}` : ''}`,
    )
  }

  /** An ability's dice; a damaging gadget used on your turn is an attack, so Rushed applies. */
  function gadgetRoll(source: string): string {
    const attack = isAttackRoll(sheet.value, source) && sheet.value.turnActive
    const odds = attack ? sheet.value.rushed + cond.value.disadvantage : 0
    const line = abilityRoll(
      sheet.value,
      source,
      Math.random,
      odds,
      attack ? armorFor({}) : { armor: 'none' },
    )
    if (!attack || !line) return line
    sheet.value.rushed += 1
    return line + spendHelp(sheet.value)
  }

  function freeAttack(source: string): string {
    prepaid.value += 1
    const name = source.replace(/[!?.]+$/, '')
    const mentions = (pattern: string) =>
      sheet.value.abilities.filter((a) => new RegExp(pattern.replace('NAME', name)).test(a.desc))
    const armor = mentions('\\bWhen you use NAME, you deal extra damage equal to your armor\\b')
    const clean = mentions(
      '\\bAttacks made (?:from|with) your NAMEs? (?:also )?(?:grant advantage and )?ignore (?:all )?disadvantage\\b',
    )
    const notes = [
      armor.length
        ? `+${sheet.value.ac} (${armor.map((a) => abilityBaseName(a.name)).join(', ')})`
        : '',
      clean.length
        ? `no disadvantage (${clean.map((a) => abilityBaseName(a.name)).join(', ')})`
        : '',
    ].filter(Boolean)
    nextAttack.value = {
      ...NO_NEXT,
      flat: armor.length ? sheet.value.ac : 0,
      clean: clean.length > 0,
      note: notes.join(', '),
    }
    return ` Your next attack roll is free${notes.length ? `: ${notes.join(', ')}` : ''}.`
  }

  /** Options that spend the class resource (Thrill of the Hunt…), shown beside its moves. */
  const linkedOptions = computed(() =>
    abilities.value.flatMap((a) =>
      optionCards(
        a,
        a.counters.filter((c) => c.linked),
      ),
    ),
  )

  /** A companion's own limited options, shown on its card in Summons. */
  const companionOptions = computed(() =>
    abilities.value.filter((a) => a.companion).flatMap((a) => optionCards(a, a.counters)),
  )

  const malfunctions = computed(() =>
    malfunctionRisks(sheet.value).map((m) => ({
      ...m,
      on: sheet.value.malfunctions.includes(m.name),
    })),
  )

  function toggleMalfunction(name: string) {
    const risk = malfunctions.value.find((m) => m.name === name)
    if (!canEdit.value || !risk) return
    report(setMalfunction(sheet.value, name, !risk.on))
  }

  const effects = computed(() =>
    effectSources(sheet.value).map((e) => {
      const cost =
        e.form &&
        !(e.form.freeWith && sheet.value.abilities.some((a) => a.name === e.form?.freeWith))
          ? abilities.value
              .flatMap((a) => (a.key === e.form?.cost ? a.counters : []))
              .find((c) => c.period === 'rest')
          : undefined
      return {
        ...e,
        on: sheet.value.effects.some((x) => x.source === e.source),
        cost,
      }
    }),
  )

  function useEffect(source: string) {
    if (!canEdit.value) return
    const effect = effects.value.find((e) => e.source === source)
    if (!effect) return
    const limited = !effect.cost && abilities.value.find((a) => a.key === source)
    const counter = limited ? limited.counters[0] : undefined
    if (limited && counter) {
      if (counter.left < 1) return report(`${source}: no uses left ${counter.label}.`)
      return spend(counter, limited.name, 1)
    }
    const own = effect.cost
      ? undefined
      : counterCost(
          sheet.value.abilities.find((a) => abilityBaseName(a.name) === source)?.desc ?? '',
        )
    if (own) {
      const before = sheet.value.actionsSpent
      const paidOwn = payCost(sheet.value, own)
      if (paidOwn === null) return report(shortMessage(sheet.value, source, own))
      paidFor(own, before)
      return report(`${applyEffect(sheet.value, draft.value.level, source)}${paidOwn}`)
    }
    if (effect.cost && effect.cost.left < 1)
      return report(`${source}: no ${effect.form?.cost} charges left.`)
    const paid = payCost(sheet.value, effect.cost?.cost)
    if (paid === null && effect.cost?.cost)
      return report(shortMessage(sheet.value, source, effect.cost.cost))
    if (effect.cost)
      sheet.value.uses[effect.cost.id] = {
        ...sheet.value.uses[effect.cost.id],
        used: effect.cost.used + 1,
      }
    report(`${applyEffect(sheet.value, draft.value.level, source)}${paid ?? ''}`)
  }

  function stopEffect(source: string) {
    if (canEdit.value) report(endEffect(sheet.value, source))
  }

  const inventions = computed(() =>
    heldInventions(sheet.value).map((i) => {
      const inoperable = sheet.value.malfunctions.includes(i.name)
      const noActions =
        left.value < Math.max(i.actions, i.use === 'plate' || i.use === 'jerkin' ? 1 : 0)
      const r = resource.value
      return {
        ...i,
        inoperable,
        noActions,
        attack: i.use === 'cannon' || i.use === 'blade',
        desc: sheet.value.abilities.find((a) => abilityBaseName(a.name) === i.name)?.desc ?? '',
        cost:
          i.use === 'plate' || i.use === 'jerkin'
            ? 'with Defend'
            : i.use === 'tether'
              ? 'Tether 1 action · Coil 2 actions'
              : `${i.actions} action${i.actions === 1 ? '' : 's'}`,
        why: inoperable
          ? 'Inoperable'
          : readied.value < i.min
            ? `Ready at least ${i.min} ${r?.diceName ?? 'Mana'} Die`
            : noActions
              ? 'Not enough actions left'
              : '',
        label: readied.value ? `Use with ${readied.value}d${r?.die ?? 0}` : 'Use',
      }
    }),
  )

  const abilityActions = computed(() => {
    const moves = new Set((resource.value?.moves ?? []).map((m) => m.name))
    const inventionNames = new Set(heldInventions(sheet.value).map((i) => i.name))
    return sheet.value.abilities.flatMap((a) => {
      const key = abilityBaseName(a.name)
      if (limitedNames.value.has(key) || moves.has(a.name) || inventionNames.has(key)) return []
      if (key === resourceKey.value || summonBySource(key)) return []
      if (STEAL.test(a.desc)) {
        const steal = stealState(sheet.value)
        const why = steal?.pending
          ? 'Repaid next turn'
          : steal?.cooldown
            ? 'Not 2 turns in a row'
            : ''
        return [
          {
            name: a.name,
            key,
            desc: a.desc,
            attack: false,
            costText: `Gain ${steal?.max ?? 0} actions`,
            short: !!why,
            why,
            use: () => {
              if (canEdit.value) report(stealActions(sheet.value))
            },
          },
        ]
      }
      const woundUse = WOUND_USE.test(a.desc)
      const extra = Number(EXTRA_ACTIONS.exec(a.desc)?.[1] ?? 0)
      if (!woundUse && !extra && (!STARTS_AS_ACTION.test(a.desc) || CLASS_REACTION.test(a.desc)))
        return []
      const cost: CounterCost | undefined = woundUse
        ? undefined
        : extra
          ? { actions: extra }
          : counterCost(a.desc)
      if (!woundUse && (!cost || cost.reaction)) return []
      const attack = ATTACK_TEXT.test(a.desc)
      if (attack && cost && !cost.attack && !FREE_ATTACK.test(a.desc)) cost.attack = true
      const mana = manaCost(a.desc)
      const short = costShort(sheet.value, cost)
      const why = short
        ? 'Not enough actions'
        : mana > manaPool(sheet.value)
          ? `Needs ${mana} mana`
          : ''
      return [
        {
          name: a.name,
          key,
          desc: a.desc,
          attack,
          costText: [woundUse ? 'Free · 1 Wound' : costLabel(cost), mana ? `${mana} mana` : '']
            .filter(Boolean)
            .join(' · '),
          short: !!why,
          why,
          use: () => {
            if (!canEdit.value) return
            if (mana > manaPool(sheet.value)) return report(`${a.name} needs ${mana} mana.`)
            const before = sheet.value.actionsSpent
            const paid = payCost(sheet.value, cost)
            if (paid === null && cost) return report(shortMessage(sheet.value, a.name, cost))
            paidFor(cost, before, a.desc, a.name)
            const spent = mana && spendMana(sheet.value, mana) ? ` Spent ${mana} mana.` : ''
            const free = !cost?.attack && FREE_ATTACK.test(a.desc) ? freeAttack(key) : ''
            const wound = woundUse ? ` ${sufferWound(sheet.value, draft.value.level)}` : ''
            const effect = applyEffect(sheet.value, draft.value.level, key)
            report(
              `${a.name}:${paid ?? ''}${spent}${free}${wound}${woundUse ? '' : selfGains(sheet.value, draft.value.level, a.desc)}${gadgetRoll(key)}${effect ? ` ${effect}` : ''}`,
            )
          },
        },
      ]
    })
  })

  const attackAbilities = computed(() => {
    const r = resource.value
    const res = sheet.value.resource
    const word = r?.kind === 'dice' ? `${r.diceName} Die` : r?.diceName.toLowerCase() || 'charge'
    const maneuverUsed = !!sheet.value.uses[`${resourceKey.value}@turn`]?.used
    const list = [
      ...abilityActions.value
        .filter((a) => a.attack)
        .map((a) => ({
          key: `act:${a.key}`,
          name: a.name,
          desc: a.desc,
          costText: a.costText,
          why: a.why,
          use: a.use,
        })),
      ...(r?.moves ?? [])
        .filter((m) => ATTACK_TEXT.test(m.desc))
        .map((m) => {
          const cost = counterCost(m.desc)
          const why =
            m.src === 'Maneuver' && maneuverUsed
              ? 'Maneuver used this turn'
              : res.count < 1 && !freeMove(m.desc)
                ? `No ${word}s left`
                : costShort(sheet.value, cost)
                  ? 'Not enough actions'
                  : ''
          return {
            key: `move:${m.name}`,
            name: m.name,
            desc: m.desc,
            costText: [costLabel(cost) || 'free', `1 ${word}`].join(' · '),
            why,
            use: () => resourceActions.useMove(m.name),
          }
        }),
      ...abilities.value
        .filter((a) => !a.linked && !a.companion)
        .flatMap((a) => optionCards(a, a.counters))
        .filter((o) => ATTACK_TEXT.test(o.text))
        .map((o) => ({
          key: `use:${o.key}`,
          name: o.name,
          desc: o.text,
          costText: [o.uses, o.costText].filter(Boolean).join(' · '),
          why: o.why,
          use: o.use,
        })),
    ]
    return list.map((a) => ({
      ...a,
      why: offTurn.value ? NOT_TURN : a.why,
      armorWhy: armorDiceWhy('', armorFor({ text: a.desc })),
      ignoresArmor: target.value.armor !== 'none' && ignoresArmor(a.desc),
    }))
  })

  const attackAbilityKeys = computed(
    () =>
      new Set(
        abilities.value
          .filter(
            (a) => a.counters.length && a.counters.every((c) => ATTACK_TEXT.test(c.text || a.desc)),
          )
          .map((a) => a.key),
      ),
  )

  const inventionAttacks = computed(() => {
    const r = resource.value
    if (r?.kind !== 'power') return []
    const n = readied.value
    const { INT, STR } = sheet.value.stats
    return inventions.value
      .filter((i) => i.use === 'cannon' || i.use === 'blade')
      .map((i) => {
        const has = (upgrade: string) =>
          sheet.value.abilities.some((a) => a.name === `${i.name}: ${upgrade}`)
        const perDie = INT + (has('Amplified Conduit') ? 2 : 0)
        const count = Math.max(n, i.min)
        const dice = `${count}d${r.die}`
        const stabilized = i.use === 'blade' && has('Stabilized Mana Core')
        const odds = sheet.value.rushed + cond.value.disadvantage - (stabilized ? 1 : 0)
        const dmg = i.use === 'cannon' ? `1d12+${dice}+${count * perDie}` : `2×(${dice}+${STR})`
        const armor = armorFor({ lighter: i.use === 'blade' })
        return {
          name: i.name,
          dmg,
          armorDmg: armorDice(dmg, armor),
          armorWhy: armorDiceWhy(dmg, armor),
          props:
            i.use === 'cannon'
              ? `Range 8 · the Mana Dice damage also hits ALL creatures between · +${perDie} per die`
              : 'Reach 1 · Heavy armor counts as Medium, Medium as none',
          cost: `${i.actions} action${i.actions === 1 ? '' : 's'}`,
          rushed: Math.max(0, odds),
          advantage: Math.max(0, -odds),
          oddsWhy: oddsReasons(
            sheet.value.rushed,
            cond.value,
            stabilized ? 'Stabilized Mana Core (advantage)' : '',
          ),
          why: cond.value.incapacitated
            ? cond.value.incapacitated
            : offTurn.value
              ? NOT_TURN
              : i.inoperable
                ? 'Inoperable'
                : n < i.min
                  ? `Ready at least ${i.min} ${r.diceName} Die`
                  : i.noActions
                    ? 'Not enough actions left'
                    : '',
          inoperable: i.inoperable,
          mishap: i.mishap,
          run: () => operate(i.name),
        }
      })
  })

  function operate(name: string, mode?: 'tether' | 'coil') {
    if (!canEdit.value) return
    const invention = inventions.value.find((i) => i.name === name)
    const actions = mode === 'coil' ? 2 : mode === 'tether' ? 1 : (invention?.actions ?? 0)
    if (mode ? left.value < actions : invention?.noActions)
      return report(
        actions
          ? `${name} takes ${actions} action${actions === 1 ? '' : 's'}; you have ${left.value}.`
          : `${name} works when you Defend, which needs an action.`,
      )
    const message = operateInvention(
      sheet.value,
      draft.value.level,
      name,
      ready.value,
      Math.random,
      mode,
      invention?.use === 'blade' || invention?.use === 'cannon'
        ? sheet.value.rushed + cond.value.disadvantage
        : 0,
      armorFor({ lighter: invention?.use === 'blade' }),
    )
    if (!message) return
    let help = ''
    if (actions && !/inoperable|needs at least/.test(message)) {
      spendActions(sheet.value, actions)
      if (invention?.use === 'blade' || invention?.use === 'cannon') {
        sheet.value.rushed += 1
        help = spendHelp(sheet.value)
      }
      ready.value = 0
    } else if (!/inoperable|needs at least/.test(message)) ready.value = 0
    report(message + help)
  }

  function setZealot(n: number) {
    zeal.value = Math.max(0, Math.min(zealMax.value, Math.floor(n) || 0))
  }

  function setReady(n: number) {
    ready.value = Math.max(0, Math.min(sheet.value.resource.count, Math.floor(n) || 0))
  }

  function act(message: string) {
    if (message) report(message)
  }

  const resourceActions = {
    rollPower: () => {
      if (!canEdit.value) return
      act(spendPower(sheet.value, draft.value.level, ready.value))
      ready.value = 0
    },
    endTurn: () => canEdit.value && act(endTurn(sheet.value, draft.value.level)),
    startTurn: () => canEdit.value && act(startTurn(sheet.value, draft.value.level)),
    rage: (values?: number[]) => {
      if (!canEdit.value) return
      if (left.value === 0) return report(NO_ACTIONS)
      const message = rage(sheet.value, draft.value.level, false, Math.random, values)
      if (message && !/already used|enter what you rolled/.test(message)) spendActions(sheet.value)
      act(message)
    },
    addFury: (values: number[]) =>
      canEdit.value &&
      values.length > 0 &&
      act(rage(sheet.value, draft.value.level, true, Math.random, values)),
    endRage: () => canEdit.value && act(endRage(sheet.value)),
    spendFury: (index: number) => canEdit.value && act(spendFury(sheet.value, index)),
    rollJudgment: (values?: number[]) =>
      canEdit.value && act(rollJudgment(sheet.value, draft.value.level, Math.random, values)),
    setOwnDice: (on: boolean) => {
      if (canEdit.value) sheet.value.ownDice = on
    },
    expendJudgment: () => canEdit.value && act(expendJudgment(sheet.value)),
    toggleCrit: () => {
      if (canEdit.value) sheet.value.resource.count = sheet.value.resource.count ? 0 : 1
    },
    useMove: (name: string) => {
      if (!canEdit.value) return
      const before = sheet.value.actionsSpent
      const move = resource.value?.moves.find((m) => m.name === name)
      const message = spendResourceMove(sheet.value, draft.value.level, name)
      act(message)
      paidFor(counterCost(move?.desc ?? ''), before, move?.desc, name)
      if (move?.src === 'Maneuver' && /^Attack\b/.test(move.desc) && /spent 1/.test(message))
        prepaid.value += 1
    },
  }

  return {
    attacks,
    reactions,
    toggleReaction,
    abilities,
    linkedOptions,
    companionOptions,
    prepaid: readonly(prepaid),
    opportunity: readonly(opportunity),
    opportunityOptions,
    spend,
    resource,
    readied,
    held,
    setReady,
    zealot,
    zealMax,
    setZealot,
    quarry,
    hasMark,
    malfunctions,
    toggleMalfunction,
    inventions,
    inventionAttacks,
    abilityActions,
    attackAbilities,
    attackAbilityKeys,
    operate,
    left,
    effects,
    useEffect,
    stopEffect,
    ...resourceActions,
  }
}
