import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import { rollAttack5e, weaponAttack, weaponDef } from '~/utils/dnd5eAttacks'
import {
  DND5E_GUARDS,
  type Dnd5eReactionAttack,
  acReactions,
  reactionAttacks,
  useAcReaction,
} from '~/utils/dnd5eDefense'
import { attackRiders, defaultRiders, riderPlan } from '~/utils/dnd5eRiders'
import { payCost, spendUses } from '~/utils/dnd5ePlay'

/** Reactions shown elsewhere: the guards beside Hit points and the reaction attacks. */
const GUARD_NAMES = new Set([
  ...DND5E_GUARDS.map((g) => g.name),
  'Riposte',
  'Retaliation',
  'Soul of Vengeance',
  'Bloodthirst',
  'Masterful Shots',
])

/**
 * The 5e Reactions for the hero in the current sheet editor (SRD 5.2.1 pp. 13, 15): the
 * Opportunity Attack and the other reaction attacks (Riposte, Retaliation…) with the weapons
 * each can use and the hero's automatic riders, what meets an attack before it's known to hit
 * (`acReactions`), reaction spells and the other reaction features. Shared by the sheet's
 * Reactions panel and the battle board's action tiles.
 */
export function useDnd5eReactions() {
  const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
  const { claim, resultFor, unclaimed } = useResultOwner()
  const { data, columns, entries, target, attackMode } = useDnd5eSheet()
  const casting = useDnd5eCasting()
  const typed = useTypedRoll()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const ready = computed(() => sheet.value.turn?.reaction !== false)

  const weapons = computed(() =>
    sheet.value.weapons.map((w, i) => {
      const def = weaponDef(w, data.value?.weapons ?? [])
      const ranged = def ? def.type === 'Ranged' : /\d+\s*\/\s*\d+/.test(w.range)
      return { w, i, def, ranged }
    }),
  )
  const attacks = computed(() => reactionAttacks(sheet.value, level.value))
  const picked = ref<Record<string, number>>({})
  const usable = (r: Dnd5eReactionAttack) => weapons.value.filter((x) => x.ranged === !!r.ranged)
  const why = (r: Dnd5eReactionAttack) =>
    usable(r).length ? r.why : r.ranged ? 'No ranged weapon' : 'No melee weapon'

  /** One attack as a Reaction: Riposte adds its Superiority Die, the hero's auto riders ride along. */
  function reactionAttack(r: Dnd5eReactionAttack) {
    const list = usable(r)
    const m = list.find((x) => x.i === picked.value[r.key]) ?? list[0]
    const key = `rea:${r.key}`
    if (!canEdit.value || !m || why(r)) return
    const plan = weaponAttack(sheet.value, level.value, m.w, m.def, {
      key,
      target: target.value,
      columns: columns.value,
    })
    typed.run(key, r.name, () => {
      payCost(sheet.value, level.value, 'reaction')
      if (r.spend) spendUses(sheet.value, r.spend)
      const ctx = { columns: columns.value, mode: attackMode.value }
      const riders = riderPlan(
        sheet.value,
        level.value,
        plan,
        defaultRiders(attackRiders(sheet.value, level.value, plan, ctx)),
        ctx,
      )
      if (r.dice) riders.parts.push({ dice: r.dice, type: plan.type, label: r.name })
      const res = rollAttack5e(
        sheet.value,
        { ...plan, name: `${r.name} (${m.w.name})` },
        { mode: attackMode.value, target: target.value, riders },
      )
      claim(key, () => say(res.line))
      showOutcome({ label: r.name, total: res.damage, detail: res.line })
    })
    attackMode.value = 'normal'
  }

  const spells = computed(() =>
    casting.spells.value.filter((r) => !r.book && casting.defOf(r.slug)?.activation === 'reaction'),
  )
  const own = computed(() => entries.value.filter((e) => e.cost === 'reaction'))
  const shown = computed(() =>
    own.value.filter((e) => !GUARD_NAMES.has(e.name.split(': ').pop() ?? e.name)),
  )
  const meet = computed(() => acReactions(sheet.value, level.value))
  const meetResult = computed(() => meet.value.map((m) => resultFor(`rea:${m.key}`)).find(Boolean))

  function meetAttack(key: string) {
    if (canEdit.value) claim(`rea:${key}`, () => say(useAcReaction(sheet.value, level.value, key)))
  }

  return {
    draft,
    canEdit,
    say,
    claim,
    resultFor,
    unclaimed,
    data,
    columns,
    entries,
    target,
    attackMode,
    casting,
    typed,
    sheet,
    level,
    ready,
    weapons,
    attacks,
    picked,
    usable,
    why,
    reactionAttack,
    spells,
    own,
    shown,
    meet,
    meetResult,
    meetAttack,
  }
}
