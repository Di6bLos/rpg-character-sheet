// Every action of the 5e hero in the current sheet editor as battle-board tiles, as
// useBattleActions does for Nimble. Nothing here is a rule: each tile's `unavailable` is the
// reason the sheet's own button shows (costWhy, casting.why, entryWhy, a reaction
// attack's), and its `use` is the call that button makes (useDnd5eAttacks, useDnd5eReactions,
// useDnd5eActions, useDnd5eCasting, useEntry, takeCoreAction).
import type { Dnd5eSheet, Dnd5eSpellRef } from '~/types/sheets'
import type { Dnd5eAttackCard } from '~/composables/useDnd5eAttacks'
import type { Dnd5eGrip } from '~/utils/dnd5eAttacks'
import type { BattleChoice, BattleGrip, BattleTile } from '~/composables/useBattleActions'
import { sign } from '~/utils/dice'
import { DND5E_CORE_ACTIONS, type Dnd5eEntry, entryWhy, useEntry } from '~/utils/dnd5eFeatures'
import { COST_LABEL, type Dnd5eCost, costWhy, newTurn, usesLeft } from '~/utils/dnd5ePlay'
import { type Dnd5eCastOption, levelName, spellCost } from '~/utils/dnd5eSpells'
import { dnd5eReadyNote } from '~/utils/battleActions'

/** A manual-dice roll waiting for the player's dice: whose prompt to show, and where. */
interface Pending {
  name: string
  prompt: (key: string) => string
  submit: (values: number[]) => void
  key: string
}

/** The cast option's label on the tile's button: "L2", "Pact", "Free", "Rit". */
function shortOf(o: Dnd5eCastOption | undefined): string {
  if (!o) return ''
  if (o.kind === 'ritual') return 'Rit'
  if (o.kind === 'pact') return 'Pact'
  if (o.kind === 'free' || o.kind === 'resource' || o.kind === 'atWill') return 'Free'
  return o.level ? `L${o.level}` : '—'
}

/** Points to offer for a pool (Lay on Hands): 1, 5, 10 and all that's left. */
function poolAmounts(left: number): number[] {
  return [...new Set([1, 5, 10, left])].filter((n) => n >= 1 && n <= left).sort((a, b) => a - b)
}

export function useBattleDnd5eActions(options: { onResult?: (message: string) => void } = {}) {
  const { draft, lastRoll, say } = useSheet<Dnd5eSheet>()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const result = useBattleResult()
  const attacks = useDnd5eAttacks()
  const reactions = useDnd5eReactions()
  const acting = useDnd5eActions()
  const casting = useDnd5eCasting()
  const typed = useTypedRoll()

  const pending = shallowRef<Pending | null>(null)

  /** Posts what the sheet said while `run` ran: to the result bar and party chat. */
  function post(line: string) {
    if (!line) return
    result.set(line)
    options.onResult?.(line)
  }

  /** Runs a sheet call and posts the line it said; a manual-dice roll waits for its dice. */
  function run(name: string, roll: Omit<Pending, 'name'> | null, call: () => void) {
    lastRoll.value = ''
    call()
    const said = lastRoll.value
    pending.value = roll && roll.prompt(roll.key) ? { name, ...roll } : null
    if (pending.value) {
      result.set(`${draft.value.name}: roll for ${name}`, pending.value.prompt(roll!.key))
      return
    }
    post(said)
  }

  /** The dice the player typed for the waiting roll. */
  function submitDice(values: number[]) {
    const p = pending.value
    if (!p) return
    run(p.name, p, () => p.submit(values))
  }

  const prompt = computed(() => pending.value?.prompt(pending.value.key) ?? '')

  const turn = computed(() => sheet.value.turn ?? newTurn())
  const onTurn = computed(() => !sheet.value.inEncounter || !!sheet.value.turn?.active)
  const waiting = computed(() => !!sheet.value.inEncounter && !sheet.value.turn?.active)

  const base = { tier: null, actions: 0, mana: 0, dice: '', detail: '', desc: '', school: null }
  const costOf = (c: Dnd5eCost | null | undefined) => (c ? COST_LABEL[c] : 'Free')

  /** The toggles the sheet's weapon card shows above Roll, with its labels. */
  function gripsOf(c: Dnd5eAttackCard): BattleGrip[] {
    const now = attacks.grips.value[c.key] ?? {}
    const grip = (part: keyof Dnd5eGrip, label: string, short: string, title: string) => ({
      key: part,
      label,
      short,
      title,
      on: !!now[part],
      toggle: () => attacks.setGrip(c.key, part),
    })
    const out: BattleGrip[] = []
    if (c.canGrip.twoHands)
      out.push(grip('twoHands', 'Two hands', '2H', 'Versatile: the bigger damage die in two hands'))
    if (c.canGrip.thrown)
      out.push(grip('thrown', 'Thrown', 'Thr', 'Thrown: a ranged attack with the same ability'))
    if (c.canGrip.offhand)
      out.push(
        grip(
          'offhand',
          'Off-hand',
          'Off',
          'Light: the extra attack with a second Light weapon (a Bonus Action, or part of the Attack action with Nick)',
        ),
      )
    if (c.canGrip.long || now.thrown)
      out.push(grip('long', 'Long range', 'Far', 'Beyond normal range: Disadvantage'))
    if (attacks.sneakable(c.plan)) {
      const on = attacks.sneakOn(c)
      out.push({
        key: 'sneak',
        label: 'Sneak Attack',
        short: 'SA',
        title:
          'Sneak Attack, once a turn: with Advantage, or an ally within 5 ft of the target and no Disadvantage',
        on,
        toggle: () => {
          attacks.sneakPick.value = { ...attacks.sneakPick.value, [c.key]: !on }
        },
      })
    }
    return out
  }

  const weaponTiles = computed<BattleTile[]>(() =>
    attacks.cards.value.map((c) => ({
      ...base,
      key: `weapon:${c.key}`,
      name: c.plan.name,
      kind: 'weapon' as const,
      group: 'attack' as const,
      cost: c.plan.cost === 'attack' ? 'Attack action' : costOf(c.plan.cost),
      dice: attacks.damageOf(c),
      detail: `${sign(c.plan.test.bonus)} to hit`,
      desc: c.props.map((p) => p.label).join(' · '),
      offTurn: false,
      unavailable: costWhy(sheet.value, c.plan.cost),
      oddsText: [attacks.oddsText(c.plan), attacks.modeLabel(c.plan)].filter(Boolean).join(' · '),
      grips: gripsOf(c),
      use: () => run(c.plan.name, { ...attacks.typed, key: c.key }, () => attacks.attack(c)),
    })),
  )

  function spellTile(r: Dnd5eSpellRef, group: 'attack' | 'support' | 'react'): BattleTile | null {
    const def = casting.defOf(r.slug)
    if (!def) return null
    const opts = casting.options(r)
    const at = casting.option(r)
    const key = `spell:${r.slug}`
    return {
      ...base,
      key: group === 'react' ? `react:${key}` : key,
      name: r.name,
      kind: group === 'react' ? ('reaction' as const) : ('spell' as const),
      group,
      tier: r.level,
      tierLabel: levelName(r.level),
      school: def.school,
      cost: costOf(spellCost(def)),
      dice: casting.damage(r),
      detail: group === 'react' ? (def.trigger ?? '') : def.range,
      desc: [def.concentration ? 'Concentration' : '', def.duration, def.summary ?? def.text]
        .filter(Boolean)
        .join(' · '),
      offTurn: group === 'react' || (waiting.value && !casting.why(r)),
      unavailable: casting.why(r),
      castWith: {
        options: opts.map((o) => ({
          key: o.key,
          label: `${o.label}${o.left !== undefined ? ` (${o.left} left)` : ''}`,
        })),
        at: at?.key ?? '',
        short: shortOf(at),
        set: (k: string) => casting.choose(r, k),
      },
      use: () => run(r.name, { ...casting.typed, key }, () => casting.cast(r)),
    }
  }

  const spellTiles = computed<BattleTile[]>(() => {
    const attackSlugs = new Set(attacks.spellAttacks.value.map((r) => r.slug))
    return casting.spells.value
      .filter((r) => !r.book)
      .map((r) => {
        const reaction = casting.defOf(r.slug)?.activation === 'reaction'
        return spellTile(r, reaction ? 'react' : attackSlugs.has(r.slug) ? 'attack' : 'support')
      })
      .filter((t): t is BattleTile => t !== null)
  })

  function entryTile(e: Dnd5eEntry, group: 'attack' | 'support' | 'react'): BattleTile {
    const key = `act:${e.key}`
    const why = entryWhy(sheet.value, e)
    const left = e.resource ? usesLeft(sheet.value, e.resource) : 0
    const max = sheet.value.resources?.find((x) => x.name === e.resource)?.max ?? 0
    const useWith = (amount: number) => () =>
      run(e.name, { ...typed, key }, () =>
        typed.run(key, e.name, () => say(useEntry(sheet.value, level.value, e, { amount }))),
      )
    const choices: BattleChoice[] | undefined = e.rule?.pool
      ? poolAmounts(left).map((n) => ({
          key: String(n),
          label: `Spend ${n} of ${left}`,
          unavailable: '',
          use: useWith(n),
        }))
      : undefined
    return {
      ...base,
      key: `${group === 'react' ? 'react' : 'ability'}:${e.key}`,
      name: e.name,
      kind: group === 'react' ? ('reaction' as const) : ('ability' as const),
      group,
      cost: costOf(e.cost),
      dice: e.dice ? `${e.dice}${e.damageType ? ` ${e.damageType}` : ''}` : '',
      detail: e.resource
        ? `${left}/${max} ${e.resource === e.name ? 'left' : e.resource}`
        : e.save
          ? `DC ${e.save.dc} ${e.save.ability}`
          : e.from,
      desc: e.text,
      offTurn: group === 'react' || (waiting.value && why === ''),
      unavailable: why || (e.rule?.pool && left < 1 ? 'None left' : ''),
      choices,
      use: useWith(1),
    }
  }

  const entryTiles = computed<BattleTile[]>(() => [
    ...attacks.abilities.value.map((e) => entryTile(e, 'attack')),
    ...acting.usable.value.map((e) => entryTile(e, 'support')),
    ...attacks.riders.value.map((e) => entryTile(e, 'support')),
    ...reactions.shown.value.map((e) => entryTile(e, 'react')),
  ])

  const reactionAttackTiles = computed<BattleTile[]>(() =>
    reactions.attacks.value.map((r) => {
      const key = `rea:${r.key}`
      const list = reactions.usable(r)
      const fire = () => run(r.name, { ...reactions.typed, key }, () => reactions.reactionAttack(r))
      return {
        ...base,
        key: `react:attack:${r.key}`,
        name: r.name,
        kind: 'reaction' as const,
        group: 'react' as const,
        cost: 'Reaction',
        dice: r.dice ?? '',
        detail: r.spend ? `1 ${r.spend}` : '',
        desc: r.note,
        offTurn: true,
        unavailable: reactions.why(r),
        choices:
          list.length > 1
            ? list.map((m) => ({
                key: String(m.i),
                label: m.w.name,
                unavailable: '',
                use: () => {
                  reactions.picked.value = { ...reactions.picked.value, [r.key]: m.i }
                  fire()
                },
              }))
            : undefined,
        use: fire,
      }
    }),
  )

  const meetTiles = computed<BattleTile[]>(() =>
    reactions.meet.value.map((m) => ({
      ...base,
      key: `react:meet:${m.key}`,
      name: m.ac ? `${m.name} +${m.ac}` : m.name,
      kind: 'reaction' as const,
      group: 'react' as const,
      cost: 'Reaction',
      detail: 'An attack comes at you',
      desc: m.note,
      offTurn: true,
      unavailable: m.why,
      use: () => run(m.name, null, () => reactions.meetAttack(m.key)),
    })),
  )

  const coreTiles = computed<BattleTile[]>(() =>
    DND5E_CORE_ACTIONS.filter((a) => a.id !== 'attack' && a.id !== 'magic').map((a) => {
      const help = a.id === 'help' && acting.helping.allies.value.length > 0
      return {
        ...base,
        key: `core:${a.id}`,
        name: a.name,
        kind: 'core' as const,
        group: 'support' as const,
        cost: costOf(a.cost),
        desc: a.text,
        offTurn: false,
        unavailable: help ? acting.helping.why.value : costWhy(sheet.value, a.cost),
        choices: help
          ? acting.helping.allies.value.map((ally) => ({
              key: ally.id,
              label: ally.name,
              unavailable: '',
              use: () => void acting.helping.help(ally.id).then(post),
            }))
          : undefined,
        use: () => run(a.name, null, () => acting.core(a.id)),
      }
    }),
  )

  const actions = computed<BattleTile[]>(() => [
    ...weaponTiles.value,
    ...spellTiles.value,
    ...entryTiles.value,
    ...reactionAttackTiles.value,
    ...meetTiles.value,
    ...coreTiles.value,
  ])

  const turnModel = useDnd5eTurnSteps().model
  const movement = computed(() =>
    sheet.value.inEncounter && turn.value.active ? (turnModel.value.movement ?? null) : null,
  )

  const note = computed(() =>
    dnd5eReadyNote(actions.value, {
      onTurn: onTurn.value,
      actions: turn.value.actions,
      bonus: turn.value.bonus,
      reaction: turn.value.reaction,
      movement: movement.value,
    }),
  )

  /** Healing the last spell rolled, offered to the caster (the sheet's "Heal yourself"). */
  const healed = computed(() => casting.healed.value?.amount ?? 0)
  function healSelf() {
    run('Heal yourself', null, () => casting.healSelf())
  }

  return {
    actions,
    onTurn,
    note,
    prompt,
    submitDice,
    healed,
    healSelf,
    chips: attacks.chips,
    toggleMode: attacks.toggleMode,
    lastResult: result.text,
    lastDetail: result.detail,
  }
}
