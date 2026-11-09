import type { Dnd5eAbility, Dnd5eSheet } from '~/types/sheets'
import { abilityMod, parseDice, rollAttack, rollDice, sign } from '~/utils/dice'
import type { ThemeId } from '~/utils/themes'

const ABILITIES: [Dnd5eAbility, string][] = [
  ['STR', 'Strength'],
  ['DEX', 'Dexterity'],
  ['CON', 'Constitution'],
  ['INT', 'Intelligence'],
  ['WIS', 'Wisdom'],
  ['CHA', 'Charisma'],
]

/** Roll result phrased in each theme's voice (see design/screens/*Sheet.dc.html). */
function describeRoll(
  theme: ThemeId,
  name: string,
  toHit: number,
  natural: 20 | 1 | null,
  damage: number | null,
  type: string,
): string {
  const dmg = damage === null ? '' : `${damage} ${type.toLowerCase()}`.trim()
  const crit = natural === 20
  switch (theme) {
    case 'gothic':
      return `${name} strikes for ${toHit} to hit${crit ? ' — a critical blow' : ''}${dmg ? `, dealing ${dmg}` : ''}.`
    case 'cursed':
      return `The ${name.toLowerCase()} finds ${toHit} to hit${dmg ? `, and deals ${dmg}` : ''}.${crit ? ' Fortune favours you.' : ''}`
    case 'eldritch':
      return `${name}: ${toHit} to hit${dmg ? ` · ${dmg}` : ''}${crit ? ' · critical' : ''}`
    default:
      return `${name}: ${toHit} to hit${dmg ? ` · ${dmg}` : ''}${crit ? ' · natural 20!' : natural === 1 ? ' · natural 1' : ''}`
  }
}

export function useDnd5e(theme: Ref<ThemeId>) {
  const editor = useSheet<Dnd5eSheet>()
  const sheet = computed(() => editor.draft.value.sheet)

  const stats = computed(() =>
    ABILITIES.map(([k, name]) => {
      const score = sheet.value.abilities[k]
      return {
        k,
        name,
        score,
        mod: sign(abilityMod(score)),
        prof: sheet.value.saveProfs.includes(k),
      }
    }),
  )

  const weapons = computed(() =>
    sheet.value.weapons.map((w) => ({
      ...w,
      atkLabel: sign(w.atk),
      roll: () => {
        const attack = rollAttack(w.atk)
        const expr = parseDice(w.dmg)
        const damage = expr ? rollDice(expr).total : null
        editor.say(
          describeRoll(
            theme.value,
            w.name || 'Attack',
            attack.total,
            attack.natural,
            damage,
            w.type,
          ),
        )
      },
    })),
  )

  function deathPips(kind: 'successes' | 'failures', label: string) {
    return [1, 2, 3].map((i) => ({
      label: `${label} ${i}`,
      pressed: sheet.value.deathSaves[kind] >= i,
      set: () => {
        if (!editor.canEdit.value) return
        const saves = sheet.value.deathSaves
        saves[kind] = saves[kind] === i ? i - 1 : i
      },
    }))
  }

  const successes = computed(() => deathPips('successes', 'Success'))
  const failures = computed(() => deathPips('failures', 'Failure'))

  /** "Half-Elf Ranger · Outlander · Chaotic Good" */
  const byline = computed(() =>
    [
      [sheet.value.lineage, sheet.value.class].filter(Boolean).join(' '),
      sheet.value.background,
      sheet.value.alignment,
    ]
      .filter(Boolean)
      .join(' · '),
  )

  return { ...editor, sheet, stats, weapons, successes, failures, byline, sign }
}
