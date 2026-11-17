// Attacks, reactions and limited-use abilities of the Nimble sheet in the
// current sheet editor. Shared by the sheet's Actions panel and the board's action panel.
import { REACTIONS } from '~/data/nimble/core'
import type { NimbleSheet } from '~/types/sheets'
import { parseDice, rollNimble } from '~/utils/dice'
import { abilityBaseName, sheetResource } from '~/utils/nimbleBuild'
import { abilityCounters, actionsLeft, dyingAttackSave, spendActions } from '~/utils/nimblePlay'

/** Up to this many uses show as pips; larger pools (Lay on Hands) show a bar. */
export const MAX_PIPS = 10

export interface NimbleResultOptions {
  /** Called with each result message, after it is shown on the sheet. */
  onResult?: (message: string) => void
}

export interface AbilityCounterView {
  id: string
  max: number
  used: number
}

export function useNimbleActions(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const resource = computed(() => sheetResource(sheet.value, draft.value.level))

  function report(message: string) {
    say(message)
    options.onResult?.(message)
  }

  const attacks = computed(() =>
    sheet.value.attacks.map((w) => {
      const res = sheet.value.resource
      const raging = resource.value?.kind === 'rage' && res.active && w.melee
      const bonus = raging ? res.dice : 0
      const die = resource.value?.die ?? res.die
      // Swift Fists and the like say so in the weapon's properties.
      const rushed = /no rushed/i.test(w.props) ? 0 : sheet.value.rushed
      return {
        name: w.name,
        props: w.props,
        dmg: w.dmg + (bonus ? ` +${bonus}d${die}` : ''),
        rushed,
        roll: () => {
          if (!canEdit.value) return
          const expr = parseDice(w.dmg)
          if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d12+3`)
          const result = rollNimble(
            expr,
            bonus ? { count: bonus, sides: die } : null,
            Math.random,
            rushed,
          )
          // Still rolled with no actions left, for reactions (Opportunity Attack), but said so.
          const spent =
            actionsLeft(sheet.value) === 0 ? ' No actions left this turn: a reaction only.' : ''
          const dying =
            (dyingAttackSave(sheet.value) ? ' Dying: DC 10 STR save or take 1 Wound.' : '') + spent
          if (result.miss) report(`${w.name}: miss (first die rolled a 1).${dying}`)
          else
            report(
              `${w.name}: ${result.total} damage${result.crit ? ' · critical!' : ''}${
                result.bonus
                  ? ` (incl. ${result.bonus} ${resource.value?.diceName.toLowerCase() || 'bonus'})`
                  : ''
              }.${dying}`,
            )
          spendActions(sheet.value)
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
    })),
  )

  function toggleReaction(name: string) {
    if (!canEdit.value) return
    const used = sheet.value.reactionsUsed
    if (used.includes(name)) {
      sheet.value.reactionsUsed = used.filter((n) => n !== name)
      sheet.value.actionsSpent = Math.max(0, sheet.value.actionsSpent - 1)
      return
    }
    used.push(name)
    spendActions(sheet.value)
    report(`${name}: spent 1 action.`)
  }

  const abilities = computed(() =>
    abilityCounters(sheet.value, draft.value.level)
      // The class resource panel already counts this one.
      .filter(({ ability }) => abilityBaseName(ability.name) !== resource.value?.ability)
      .map(({ ability, counters }) => ({
        ...ability,
        key: abilityBaseName(ability.name),
        counters: counters.map((c) => {
          const left = c.max - c.used
          return {
            ...c,
            left,
            pips: c.max <= MAX_PIPS,
            pct: Math.round((left / c.max) * 100),
          }
        }),
      })),
  )

  /** Spends (or with a negative amount, regains) uses of an ability counter. */
  function spend(counter: AbilityCounterView, name: string, amount: number) {
    if (!canEdit.value) return
    const used = Math.max(0, Math.min(counter.max, counter.used + Math.floor(amount || 0)))
    sheet.value.uses[counter.id] = { ...sheet.value.uses[counter.id], used }
    if (amount > 0) report(`${name}: ${counter.max - used} of ${counter.max} left.`)
  }

  return { attacks, reactions, toggleReaction, abilities, spend }
}
