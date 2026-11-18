import { beastsFor } from '~/data/nimble/beasts'
import { summonById } from '~/data/nimble/summons'
import type { NimbleSheet, NimbleSummon } from '~/types/sheets'
import { actionsLeft, spendActions } from '~/utils/nimblePlay'
import {
  addCustomSummon,
  addSummon,
  availableSummons,
  commandMinions,
  companionAttack,
  companionBlocked,
  dismissSummon,
  minionCount,
  sacrificeSummon,
  slaySummon,
  spiritAct,
  summonLookKey,
  summonOptions,
  summonStats,
} from '~/utils/nimbleSummons'
import type { NimbleResultOptions } from './useNimbleActions'

const NO_ACTIONS = 'Not enough actions left: they come back when your turn ends.'

export function useNimbleSummons(options: NimbleResultOptions = {}) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)

  function report(message: string) {
    if (!message) return
    say(message)
    options.onResult?.(message)
  }

  const groups = computed(() => {
    const out = new Map<string, NimbleSummon[]>()
    for (const s of sheet.value.summons) out.set(s.def, [...(out.get(s.def) ?? []), s])
    return [...out.entries()].map(([defId, members]) => {
      const def = summonById(defId)
      const stats = def ? summonStats(sheet.value, level.value, def) : null
      return {
        id: defId || 'custom',
        name: def?.name ?? 'Other summons',
        desc: def?.desc ?? '',
        options: summonOptions(sheet.value, defId),
        duration: def?.duration ?? '',
        members,
        looks: defId ? [defId] : [...new Set(members.map(summonLookKey))],
        beasts: beastsFor(defId).length > 0,
        cap: stats && Number.isFinite(stats.cap) && stats.cap > 1 ? stats.cap : 0,
        notes: stats?.notes ?? [],
        canSacrifice: !!stats?.sacrifice.length,
        permanent: !!def?.permanent,
      }
    })
  })

  const available = computed(() =>
    availableSummons(sheet.value)
      .filter((def) => !def.permanent)
      .map((def) => {
        const stats = summonStats(sheet.value, level.value, def)
        const have = sheet.value.summons.filter((s) => s.def === def.id).length
        return { id: def.id, name: def.name, full: def.cap !== 1 && have >= stats.cap }
      }),
  )

  const minions = computed(() => minionCount(sheet.value))
  const spirit = computed(() => sheet.value.summons.find((s) => s.def === 'lifebinding-spirit'))
  const companion = computed(() => sheet.value.summons.find((s) => summonById(s.def)?.permanent))
  const armorOfShadows = computed(() =>
    sheet.value.abilities.some((a) => a.name === 'Armor of Shadows') ? minions.value : 0,
  )

  const left = computed(() => actionsLeft(sheet.value))

  function act(message: string, actions = 0) {
    if (!message) return
    if (actions > 0) spendActions(sheet.value, actions)
    report(message)
  }

  function spiritCost(): number {
    const def = summonById('lifebinding-spirit')
    const free = def && summonStats(sheet.value, level.value, def).freeWhileDying
    return free && sheet.value.dying ? 0 : 1
  }

  const run = (fn: () => void) => () => {
    if (canEdit.value) fn()
  }

  const sacrificeable = computed(
    () => new Set(groups.value.filter((g) => g.canSacrifice).map((g) => g.id)),
  )

  return {
    groups,
    sacrificeable,
    available,
    minions,
    spirit,
    companion,
    armorOfShadows,
    summon: (id: string) =>
      canEdit.value && report(addSummon(sheet.value, level.value, id, { ignoreCap: false })),
    addCustom: (name: string, hp: number) =>
      canEdit.value && report(addCustomSummon(sheet.value, name, hp)),
    dismiss: (id: string) => canEdit.value && report(dismissSummon(sheet.value, id)),
    slay: (id: string) => canEdit.value && report(slaySummon(sheet.value, level.value, id)),
    sacrifice: (id: string) =>
      canEdit.value && report(sacrificeSummon(sheet.value, level.value, id)),
    left,
    spiritCost,
    companionCost: computed(() => summonById(companion.value?.def ?? '')?.attack?.actions ?? 0),
    companionShort: computed(() => companionBlocked(sheet.value, level.value)),
    command: run(() => {
      if (left.value < 1) return report(NO_ACTIONS)
      act(commandMinions(sheet.value, level.value), 1)
    }),
    spiritAttack: run(() => {
      if (left.value < spiritCost()) return report(NO_ACTIONS)
      act(spiritAct(sheet.value, level.value, 'attack'), spiritCost())
    }),
    spiritHeal: run(() => {
      if (left.value < spiritCost()) return report(NO_ACTIONS)
      act(spiritAct(sheet.value, level.value, 'heal'), spiritCost())
    }),
    companionAttack: run(() => report(companionAttack(sheet.value, level.value))),
  }
}
