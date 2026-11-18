import { beastsFor } from '~/data/nimble/beasts'
import { summonById } from '~/data/nimble/summons'
import type { NimbleCustomSummon, NimbleSheet, NimbleSummon } from '~/types/sheets'
import { actionsLeft, spendActions } from '~/utils/nimblePlay'
import {
  CUSTOM_ABILITIES,
  addCustomSummon,
  customSummonAttack,
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
  spiritDie,
  summonLookKey,
  summonOptions,
  summonStats,
} from '~/utils/nimbleSummons'
import type { NimbleResultOptions } from './useNimbleActions'

/** "minion" → "minions", "fox" → "foxes", "harpy" → "harpies". */
function plural(name: string): string {
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`
  return `${name}s`
}

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
        source: def?.source ?? '',
        options: summonOptions(sheet.value, defId),
        duration: def?.duration ?? '',
        members,
        looks: defId ? [defId] : [...new Set(members.map(summonLookKey))],
        beasts: beastsFor(defId).length > 0,
        cap: stats && Number.isFinite(stats.cap) && stats.cap > 1 ? stats.cap : 0,
        notes: stats?.notes ?? [],
        attack: def?.attack
          ? def.attack.dice.includes('LVL')
            ? `${def.attack.label ?? 'Attack'}: ${def.attack.dice.replace(/LVL/g, ' LVL')}`
            : `${def.attack.label ?? 'Attack'}: ${stats?.diceMult ?? 1}d${stats?.die ?? 0}${stats?.reach ? ` · Reach ${stats.reach}` : ''}`
          : '',
        canSacrifice: !!(def?.minionOf
          ? summonStats(sheet.value, level.value, summonById(def.minionOf) ?? def).sacrifice.length
          : stats?.sacrifice.length),
        permanent: !!def?.permanent,
        dismissable: !def?.permanent || !!def.minionOf,
      }
    })
  })

  const available = computed(() =>
    availableSummons(sheet.value)
      .filter((def) => !def.permanent || !sheet.value.summons.some((s) => s.def === def.id))
      .map((def) => {
        const stats = summonStats(sheet.value, level.value, def)
        const have = sheet.value.summons.filter((s) => s.def === def.id).length
        return { id: def.id, name: def.name, full: def.cap !== 1 && have >= stats.cap }
      }),
  )

  const minions = computed(() => minionCount(sheet.value))
  const spirit = computed(() => sheet.value.summons.find((s) => s.def === 'lifebinding-spirit'))
  const companion = computed(() =>
    sheet.value.summons.find((s) => summonById(s.def)?.permanent && summonById(s.def)?.attack),
  )
  const armorOfShadows = computed(() =>
    sheet.value.abilities.some((a) => a.name === 'Armor of Shadows') ? minions.value : 0,
  )

  const left = computed(() => actionsLeft(sheet.value))
  const offTurn = computed(() => sheet.value.inEncounter && !sheet.value.turnActive)

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

  const commandUsed = computed(() => !!sheet.value.uses['Command minions@turn']?.used)

  const command = run(() => {
    if (commandUsed.value) return report('You already commanded your minions this turn.')
    if (left.value < 1) return report(NO_ACTIONS)
    act(commandMinions(sheet.value, level.value), 1)
  })

  const spiritAttack = run(() => {
    if (left.value < spiritCost()) return report(NO_ACTIONS)
    act(spiritAct(sheet.value, level.value, 'attack'), spiritCost())
  })

  const companionStrike = run(() => report(companionAttack(sheet.value, level.value)))

  /** Attacks your summons make, for the Attacks list beside your weapons. */
  const summonAttacks = computed(() => {
    const out: {
      key: string
      name: string
      who: string
      summon: string
      dmg: string
      props: string
      cost: string
      why: string
      run: () => void
    }[] = []
    if (minions.value) {
      const stats = summonStats(sheet.value, level.value, summonById('shadow-minion')!)
      const custom = sheet.value.summonLooks['shadow-minion']?.name
      out.push({
        key: 'minions',
        name: `Command ${minions.value > 1 ? plural(custom || 'shadow minion') : custom || 'shadow minion'}`,
        who: '',
        summon: 'shadow-minion',
        dmg: `${minions.value}× 1d${stats.die}`,
        props: `${stats.damageType} · each moves 6 then attacks · Reach ${stats.reach} · a 1 misses, no crits`,
        cost: '1 action · 1/turn',
        why: offTurn.value
          ? 'Not your turn'
          : commandUsed.value
            ? 'Used this turn'
            : left.value < 1
              ? 'No actions left'
              : '',
        run: command,
      })
    }
    if (spirit.value) {
      const stats = summonStats(sheet.value, level.value, summonById('lifebinding-spirit')!)
      out.push({
        key: 'spirit',
        name: `${spirit.value.name} attacks`,
        who: summonById('lifebinding-spirit')?.name ?? '',
        summon: 'lifebinding-spirit',
        dmg: `${stats.diceMult}d${spiritDie(sheet.value, level.value, spirit.value.tier)}+WIL`,
        props: `${stats.damageType}, Reach ${stats.reach}, ignoring armor`,
        cost: spiritCost() ? '1 action' : 'free',
        why: offTurn.value ? 'Not your turn' : left.value < spiritCost() ? 'No actions left' : '',
        run: spiritAttack,
      })
    }
    const pet = companion.value
    const attack = pet ? summonById(pet.def)?.attack : undefined
    if (pet && attack) {
      out.push({
        key: 'companion',
        name: `${pet.name}: ${attack.label ?? 'Attack'}`,
        who: summonById(pet.def)?.name ?? '',
        summon: pet.def,
        dmg: attack.dice.replace(
          /\+(?:(\d+)×)?LVL$/,
          (_, mult?: string) => `+${Number(mult ?? 1) * level.value}`,
        ),
        props: 'Your quarry, ignoring armor; it can’t miss',
        cost: [
          attack.charges ? `${attack.charges} TotH charge${attack.charges === 1 ? '' : 's'}` : '',
          attack.actions ? `${attack.actions} action${attack.actions === 1 ? '' : 's'}` : 'free',
        ]
          .filter(Boolean)
          .join(' · '),
        why: offTurn.value ? 'Not your turn' : companionBlocked(sheet.value, level.value),
        run: companionStrike,
      })
    }
    const customs = new Map<string, NimbleSummon[]>()
    for (const m of sheet.value.summons)
      if (!m.def && m.custom?.attack) {
        const key = `${m.name.replace(/ [A-Z]$/, '')}|${m.custom.attack.name}|${m.custom.attack.dice}`
        customs.set(key, [...(customs.get(key) ?? []), m])
      }
    for (const [key, members] of customs) {
      const first = members[0]!
      const attack = first.custom!.attack!
      const n = members.length
      out.push({
        key: `custom:${key}`,
        name: `${n > 1 ? first.name.replace(/ [A-Z]$/, '') : first.name}: ${attack.name}`,
        who: n > 1 ? `${n} summons` : '',
        summon: '',
        dmg: `${n > 1 ? `${n}× ` : ''}${attack.dice}`,
        props: [
          attack.type,
          attack.reach ? `Reach ${attack.reach}` : '',
          first.custom!.kind === 'minion' ? 'a 1 misses, no crits' : '',
          ...(first.custom!.abilities ?? []).filter((a) =>
            CUSTOM_ABILITIES.some((x) => x.name === a && x.onHit),
          ),
        ]
          .filter(Boolean)
          .join(' · '),
        cost: attack.actions
          ? `${attack.actions} action${attack.actions === 1 ? '' : 's'}`
          : 'free',
        why: offTurn.value ? 'Not your turn' : left.value < attack.actions ? 'No actions left' : '',
        run: run(() => act(customSummonAttack(sheet.value, members), attack.actions)),
      })
    }
    return out
  })

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
    addCustom: (name: string, hp: number, custom?: NimbleCustomSummon, count = 1) =>
      canEdit.value && report(addCustomSummon(sheet.value, name, hp, custom, count)),
    dismiss: (id: string) => canEdit.value && report(dismissSummon(sheet.value, id)),
    slay: (id: string) => canEdit.value && report(slaySummon(sheet.value, level.value, id)),
    sacrifice: (id: string) =>
      canEdit.value && report(sacrificeSummon(sheet.value, level.value, id)),
    left,
    spiritCost,
    companionCost: computed(() => summonById(companion.value?.def ?? '')?.attack?.actions ?? 0),
    companionShort: computed(() => companionBlocked(sheet.value, level.value)),
    command,
    spiritAttack,
    summonAttacks,
    spiritHeal: run(() => {
      if (left.value < spiritCost()) return report(NO_ACTIONS)
      act(spiritAct(sheet.value, level.value, 'heal'), spiritCost())
    }),
    companionAttack: companionStrike,
  }
}
