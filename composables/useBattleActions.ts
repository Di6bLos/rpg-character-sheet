// Every action of the Nimble hero in the current sheet editor as one flat list of
// battle-board tiles. Nothing here is a rule: availability comes from the fields
// the sheet panels already read (via utils/battleActions.ts), and each tile's
// `use` is the exact call the matching sheet button makes.
import type { NimbleSheet } from '~/types/sheets'
import { reactionReason, weaponReason, type BattleAction } from '~/utils/battleActions'
import { usedUpLabel } from '~/utils/nimblePlay'
import type { NimbleResultOptions } from './useNimbleActions'

/** A pick that completes a tile (Opportunity Attack's weapon, Help's ally). */
export interface BattleChoice {
  key: string
  label: string
  unavailable: string
  use: () => void
}

export type BattleTile = BattleAction & {
  use: () => void
  /** When set, the tile opens these picks instead of acting on a click (the sheet's dropdown). */
  choices?: BattleChoice[]
  /** The spell's upcast control, for spells the sheet lets you upcast. */
  upcast?: { at: number; max: number; set: (tier: number) => void }
}

/** "2 actions · 3 mana" → the number before the word; 0 when the text doesn't say. */
function count(text: string, word: string): number {
  return Number(new RegExp(`(\\d+) ${word}`).exec(text)?.[1] ?? 0)
}

/** The first part of a "Range 8 · fire · 1/turn" line. */
function first(text: string): string {
  return text.split(' · ')[0] ?? ''
}

const RANGE = /^(Range|Reach|Line|Cone)[^.]*/

export function useBattleActions(options: NimbleResultOptions = {}) {
  const { draft } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const lastResult = ref('')
  const onResult = (message: string) => {
    lastResult.value = message
    options.onResult?.(message)
  }

  const nimble = useNimbleActions({ onResult })
  const spells = useNimbleSpells({ onResult })
  const summons = useNimbleSummons({ onResult })
  const { allies, help } = useHelpAlly({ onResult })

  const onTurn = computed(() => !sheet.value.inEncounter || sheet.value.turnActive)
  const waiting = computed(() => sheet.value.inEncounter && !sheet.value.turnActive)

  const base = { tier: null, actions: 0, mana: 0, dice: '', detail: '', desc: '', school: null }

  const weapons = computed<BattleTile[]>(() => [
    ...nimble.attacks.value.map((w, i) => ({
      ...base,
      key: `weapon:${i}:${w.name}`,
      name: w.name,
      kind: 'weapon' as const,
      group: 'attack' as const,
      actions: 1,
      dice: w.dmg,
      detail: first(w.props),
      desc: [w.props, w.boost].filter(Boolean).join(' · '),
      offTurn: false,
      unavailable: weaponReason(w),
      use: w.roll,
    })),
    ...nimble.inventionAttacks.value.map((inv) => ({
      ...base,
      key: `weapon:inv:${inv.name}`,
      name: inv.name,
      kind: 'weapon' as const,
      group: 'attack' as const,
      actions: count(inv.cost, 'action'),
      dice: inv.dmg,
      detail: first(inv.props),
      desc: inv.props,
      offTurn: false,
      unavailable: inv.why,
      use: inv.run,
    })),
  ])

  const spellTiles = computed<BattleTile[]>(() => {
    const attackNames = new Set(spells.spellAttacks.value.map((a) => a.name))
    const reactionNames = new Set(spells.reactionSpells.value.map((s) => s.name))
    const summonOf = new Map(spells.summonSpells.value.map((s) => [s.name, s]))
    const full = (summon: string) => !!summons.available.value.find((a) => a.id === summon)?.full
    type Castable = (typeof spells.tiers.value)[number]['spells'][number]
    const fields = (s: Castable) => ({
      tier: s.tier,
      actions: s.actions,
      mana: s.tier > 0 && !s.usesPact && !s.usesMinions ? s.mana : 0,
      desc: s.desc,
      school: s.school,
      upcast: s.canUpcast
        ? { at: s.at, max: spells.maxTier.value, set: (t: number) => spells.setUpcast(s, t) }
        : undefined,
    })
    const attacks = spells.spellAttacks.value.map((a) => ({
      ...base,
      ...fields(a.spell),
      key: a.key,
      name: a.name,
      kind: 'spell' as const,
      group: 'attack' as const,
      dice: a.dmg,
      detail: first(a.props),
      offTurn: false,
      unavailable: a.why,
      use: a.run,
    }))
    const support = spells.tiers.value
      .flatMap((g) => g.spells)
      .filter((s) => !attackNames.has(s.name) && !reactionNames.has(s.name))
      .map((s) => {
        // Summoning spells: exactly the Summons panel's card (its `blocked`, then At the max).
        // Others: exactly SpellCard's cast button (notNow, busy, no actions, short).
        const summon = summonOf.get(s.name)
        const unavailable = summon
          ? summon.blocked || (full(summon.summon) ? 'At the max' : '')
          : s.notNow ||
            (s.busy
              ? 'Finish casting first'
              : s.noActions
                ? 'No actions left'
                : s.short
                  ? s.usesMinions
                    ? `Needs ${s.cost}`
                    : 'Not enough mana'
                  : '')
        return {
          ...base,
          ...fields(s),
          key: `spell:${s.name}`,
          name: s.name,
          kind: 'spell' as const,
          group: 'support' as const,
          detail: RANGE.exec(s.desc)?.[0] ?? '',
          offTurn: waiting.value && unavailable === '',
          unavailable,
          use: () => spells.cast(s),
        }
      })
    const reacts = spells.reactionSpells.value.map((s) => ({
      ...base,
      ...fields(s),
      key: `react:spell:${s.name}`,
      name: s.name,
      // 'reaction', not 'spell': All lists it once, under Reactions.
      kind: 'reaction' as const,
      group: 'react' as const,
      detail: s.trigger,
      offTurn: true,
      // The sheet's Reactions panel reads `blocked` (no turn or condition check there).
      unavailable: s.blocked,
      use: () => spells.cast(s),
    }))
    return [...attacks, ...support, ...reacts]
  })

  const reactionTiles = computed<BattleTile[]>(() =>
    nimble.reactions.value.map((r) => {
      const choices: BattleChoice[] | undefined =
        r.name === 'Opportunity Attack' && nimble.opportunityOptions.value.length
          ? nimble.opportunityOptions.value.map((o) => ({
              key: o.name,
              label: `${o.name} · ${o.dmg}`,
              unavailable: o.why,
              use: o.roll,
            }))
          : r.name === 'Help' && allies.value.length
            ? allies.value.map((a) => ({
                key: a.id,
                label: a.name,
                unavailable: reactionReason(r),
                use: () => void help(a.id),
              }))
            : undefined
      return {
        ...base,
        key: `react:${r.name}`,
        name: r.name,
        kind: 'reaction' as const,
        group: 'react' as const,
        actions: r.free ? 0 : 1,
        detail: r.costText,
        desc: r.desc,
        offTurn: true,
        unavailable: reactionReason(r),
        choices,
        use: () => void nimble.toggleReaction(r.name),
      }
    }),
  )

  const abilityTiles = computed<BattleTile[]>(() => {
    const attacks = [
      ...summons.summonAttacks.value.map((a) => ({
        ...base,
        key: `summon:${a.key}`,
        name: a.name,
        kind: 'summon' as const,
        actions: count(a.cost, 'action'),
        dice: a.dmg,
        detail: first(a.props),
        desc: [a.who, a.props].filter(Boolean).join(' · '),
        unavailable: a.why,
        use: a.run,
      })),
      ...nimble.attackAbilities.value.map((a) => ({
        ...base,
        key: `ability:${a.key}`,
        name: a.name,
        kind: 'ability' as const,
        actions: count(a.costText, 'action'),
        mana: count(a.costText, 'mana'),
        detail: a.costText,
        desc: a.desc,
        unavailable: a.why,
        use: a.use,
      })),
    ].map((a) => ({ ...a, group: 'attack' as const, offTurn: false }))
    const actions = nimble.abilityActions.value
      .filter((a) => !a.attack)
      .map((a) => ({
        ...base,
        key: `ability:${a.key}`,
        name: a.name,
        actions: count(a.costText, 'action'),
        mana: count(a.costText, 'mana'),
        detail: a.costText,
        desc: a.desc,
        unavailable: a.why,
        use: a.use,
      }))
    // The Actions panel's limited-use abilities (SheetActions `mine`), one tile per counter.
    const counters = nimble.abilities.value
      .filter((a) => !a.linked && !a.companion && !nimble.attackAbilityKeys.value.has(a.key))
      .flatMap((a) =>
        a.counters.map((c) => ({
          ...base,
          key: `counter:${c.id}`,
          name: c.name || a.name,
          actions: c.cost?.actions ?? 0,
          mana: 0,
          detail: `${c.left}/${c.max} ${c.label}`,
          desc: a.desc,
          unavailable:
            c.left === 0 ? usedUpLabel(c) : c.notNow || (c.short ? 'Not enough actions' : ''),
          use: () => nimble.spend(c, a.name, 1),
        })),
      )
    const support = [...actions, ...counters].map((a) => ({
      ...a,
      kind: 'ability' as const,
      group: 'support' as const,
      offTurn: waiting.value && a.unavailable === '',
    }))
    return [...attacks, ...support]
  })

  const actions = computed<BattleTile[]>(() => [
    ...weapons.value,
    ...spellTiles.value,
    ...abilityTiles.value,
    ...reactionTiles.value,
  ])

  const mana = computed(() => {
    const { current, max, temp } = sheet.value.mana
    return max <= 0 && temp <= 0 ? null : current + temp
  })

  return {
    actions,
    onTurn,
    actionsLeft: computed(() => nimble.left.value),
    mana,
    lastResult,
  }
}
