import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import { rollAttack5e, weaponAttack, weaponDef } from '~/utils/dnd5eAttacks'
import { costWhy, payCost } from '~/utils/dnd5ePlay'

/**
 * The 5e Reactions for the hero in the current sheet editor (SRD 5.2.1 pp. 13, 15): the
 * Opportunity Attack with the melee weapons it can use, reaction spells and reaction features.
 * Shared by the sheet's Reactions panel and the battle board's action tiles.
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

  const melee = computed(() =>
    sheet.value.weapons
      .map((w, i) => ({ w, i, def: weaponDef(w, data.value?.weapons ?? []) }))
      .filter((x) => (x.def ? x.def.type === 'Melee' : !/\d+\s*\/\s*\d+/.test(x.w.range))),
  )
  const picked = ref(0)
  const oaWhy = computed(() =>
    melee.value.length ? costWhy(sheet.value, 'reaction') : 'No melee weapon',
  )

  function opportunity() {
    const m = melee.value[picked.value] ?? melee.value[0]
    if (!canEdit.value || !m || oaWhy.value) return
    const plan = weaponAttack(sheet.value, level.value, m.w, m.def, {
      key: 'rea:oa',
      target: target.value,
      columns: columns.value,
    })
    typed.run('rea:oa', 'Opportunity Attack', () => {
      payCost(sheet.value, level.value, 'reaction')
      const r = rollAttack5e(
        sheet.value,
        { ...plan, name: `Opportunity Attack (${m.w.name})` },
        {
          mode: attackMode.value,
          target: target.value,
        },
      )
      claim('rea:oa', () => say(r.line))
      showOutcome({ label: 'Opportunity Attack', total: r.damage, detail: r.line })
    })
    attackMode.value = 'normal'
  }

  const spells = computed(() =>
    casting.spells.value.filter((r) => !r.book && casting.defOf(r.slug)?.activation === 'reaction'),
  )
  const own = computed(() => entries.value.filter((e) => e.cost === 'reaction'))

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
    melee,
    picked,
    oaWhy,
    opportunity,
    spells,
    own,
  }
}
