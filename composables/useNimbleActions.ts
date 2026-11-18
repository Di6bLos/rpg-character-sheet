// Attacks, reactions and limited-use abilities of the Nimble sheet in the
// current sheet editor. Shared by the sheet's Actions panel and the board's action panel.
import { REACTIONS, weaponByName } from '~/data/nimble/core'
import { summonBySource } from '~/data/nimble/summons'
import type { NimbleSheet } from '~/types/sheets'
import { parseDice, rollNimble } from '~/utils/dice'
import { abilityBaseName, malfunctionRisks, sheetResource } from '~/utils/nimbleBuild'
import {
  abilityRoll,
  afterEffectAttack,
  applyEffect,
  effectAttacks,
  effectSources,
  endEffect,
  endEffects,
  setMalfunction,
} from '~/utils/nimbleEffects'
import { itemAttack } from '~/utils/nimbleItems'
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
  payCost,
  refundActions,
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

export function useNimbleActions(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const resource = computed(() => sheetResource(sheet.value, draft.value.level))
  const ready = useState(`nimble-power-${draft.value.id}`, () => 0)
  const readied = computed(() => Math.min(ready.value, sheet.value.resource.count))
  const prepaid = useState(`nimble-prepaid-${draft.value.id}`, () => 0)
  watch(
    () => sheet.value.turnActive,
    (on, was) => {
      if (on !== was) prepaid.value = 0
    },
  )

  function spendAttackAction() {
    if (prepaid.value > 0) prepaid.value -= 1
    else spendActions(sheet.value)
  }

  function paidFor(cost: CounterCost | undefined, before: number) {
    if (cost?.attack && sheet.value.actionsSpent > before) prepaid.value += 1
  }
  const held = computed(() => sheet.value.resource.rolls.reduce((a, b) => a + b, 0))
  const left = computed(() => actionsLeft(sheet.value))
  const NO_ACTIONS = 'No actions left: they come back when your turn ends.'

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
      const rushed = /no rushed/i.test(w.props) ? 0 : sheet.value.rushed
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
      return {
        name: w.name,
        props: w.props,
        dmg:
          (w.flat !== undefined ? `${w.flat} (${w.dmg} to hit)` : w.dmg) +
          (fury ? ` +${fury}` : '') +
          (powered ? ` +${readied.value}d${die}` : '') +
          (judged ? ` +${held.value}` : ''),
        boost: note,
        rushed,
        poweredBy: poweredBy(r, w.props),
        blocked: left.value === 0 && prepaid.value === 0,
        roll: () => {
          if (!canEdit.value) return
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
            if (sneak)
              notes.push(`on a crit, add ${r?.roll}d${r?.die} Sneak Attack and mark it used`)
            const ended = endEffects(sheet.value, 'attack')
            spendAttackAction()
            sheet.value.rushed += 1
            const rush = rushed ? ` with ${rushed}× disadvantage (Rushed)` : ''
            return report(
              `${w.name}: attack made; roll ${w.flat !== undefined ? `${w.dmg} to hit, ${w.flat} damage` : w.dmg}${rush} yourself.${notes.length ? ` ${notes.join('. ')}.` : ''}${ended}`,
            )
          }
          const expr = parseDice(w.dmg)
          if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d12+3`)
          const result = rollNimble(expr, null, Math.random, rushed)
          if (w.flat !== undefined && !result.miss) result.total = w.flat
          if (fury && !result.miss) {
            result.total += fury
            result.bonus = fury
          }
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
          if (result.miss)
            report(`${w.name}: miss (first die rolled a 1).${extra.note}${after}${dying}`)
          else
            report(
              `${w.name}: ${result.total + extra.extra} damage${result.crit ? ' · critical!' : ''}${
                result.bonus
                  ? ` (incl. ${result.bonus} ${resource.value?.diceName.toLowerCase() || 'bonus'})`
                  : ''
              }.${extra.note}${after}${dying}`,
            )
          spendAttackAction()
          sheet.value.rushed += 1
        },
      }
    }),
  )

  const reactions = computed(() =>
    REACTIONS.map((r) => ({
      ...r,
      desc: r.name === 'Defend' ? `${r.desc} Your Armor is ${sheet.value.ac}.` : r.desc,
      used: sheet.value.reactionsUsed.includes(r.name),
      blocked: !sheet.value.reactionsUsed.includes(r.name) && left.value === 0,
    })),
  )

  function toggleReaction(name: string) {
    if (!canEdit.value) return
    const used = sheet.value.reactionsUsed
    const attack = name === 'Opportunity Attack'
    if (used.includes(name)) {
      sheet.value.reactionsUsed = used.filter((n) => n !== name)
      refundActions(sheet.value, 1)
      if (attack) prepaid.value = Math.max(0, prepaid.value - 1)
      return
    }
    if (left.value === 0) return report(NO_ACTIONS)
    used.push(name)
    spendActions(sheet.value)
    if (!attack) return report(`${name}: spent 1 action.`)
    prepaid.value += 1
    report(`${name}: spent 1 action; roll the attack next, it costs no more.`)
  }

  const linkedTo = computed(() => (resource.value ? resourcePattern(resource.value) : null))

  const abilities = computed(() =>
    abilityCounters(sheet.value, draft.value.level)
      // The class resource panel already counts this one.
      .filter(({ ability }) => abilityBaseName(ability.name) !== resource.value?.ability)
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
      const why =
        left === 0
          ? 'None left'
          : charges > sheet.value.resource.count
            ? `Needs ${charges} ${resource.value?.diceName.toLowerCase() || 'charge'}${charges === 1 ? '' : 's'}`
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
    let paid = ''
    if (amount > 0 && counter.cost) {
      const before = sheet.value.actionsSpent
      const result = payCost(sheet.value, counter.cost)
      if (result === null) return report(shortMessage(sheet.value, label, counter.cost))
      paidFor(counter.cost, before)
      paid = result
    }
    const used = Math.max(0, Math.min(counter.max, counter.used + Math.floor(amount || 0)))
    if (amount < 0 && used < counter.used && counter.cost && !counter.cost.reaction) {
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
    const text = sheet.value.abilities.find((a) => a.name === name)?.desc ?? ''
    const judgment = /Expend your Judgment Dice/.test(text) ? expendJudgment(sheet.value) : ''
    const summoned = [summonFromAbility(sheet.value, draft.value.level, base), judgment]
      .filter(Boolean)
      .join(' ')
    const effect = applyEffect(sheet.value, draft.value.level, base)
    report(
      `${label}: ${counter.max - used} of ${counter.max} left.${paid}${summoned ? ` ${summoned}` : ''}${abilityRoll(sheet.value, base)}${effect ? ` ${effect}` : ''}`,
    )
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
    heldInventions(sheet.value).map((i) => ({
      ...i,
      inoperable: sheet.value.malfunctions.includes(i.name),
      noActions: left.value < Math.max(i.actions, i.use === 'plate' || i.use === 'jerkin' ? 1 : 0),
    })),
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
        const dmg = i.use === 'cannon' ? `1d12+${dice}+${count * perDie}` : `2×(${dice}+${STR})`
        return {
          name: i.name,
          dmg,
          props:
            i.use === 'cannon'
              ? `Range 8 · the Mana Dice damage also hits ALL creatures between · +${perDie} per die`
              : 'Reach 1 · Heavy armor counts as Medium, Medium as none',
          cost: `${i.actions} action${i.actions === 1 ? '' : 's'}`,
          why: i.inoperable
            ? 'Inoperable'
            : n < i.min
              ? `Ready at least ${i.min} ${r.diceName} Die`
              : i.noActions
                ? 'No actions left'
                : '',
          inoperable: i.inoperable,
          run: () => operate(i.name),
        }
      })
  })

  function operate(name: string) {
    if (!canEdit.value) return
    const invention = inventions.value.find((i) => i.name === name)
    if (invention?.noActions)
      return report(
        invention.actions
          ? `${name} takes ${invention.actions} actions; you have ${left.value}.`
          : `${name} works when you Defend, which needs an action.`,
      )
    const message = operateInvention(sheet.value, draft.value.level, name, ready.value)
    if (!message) return
    if (invention?.actions && !/inoperable|needs at least/.test(message)) {
      spendActions(sheet.value, invention.actions)
      if (invention.use === 'blade') sheet.value.rushed += 1
      ready.value = 0
    } else if (!/inoperable|needs at least/.test(message)) ready.value = 0
    report(message)
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
      act(spendResourceMove(sheet.value, draft.value.level, name))
      paidFor(counterCost(resource.value?.moves.find((m) => m.name === name)?.desc ?? ''), before)
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
    spend,
    resource,
    readied,
    held,
    setReady,
    malfunctions,
    toggleMalfunction,
    inventions,
    inventionAttacks,
    operate,
    left,
    effects,
    useEffect,
    stopEffect,
    ...resourceActions,
  }
}
