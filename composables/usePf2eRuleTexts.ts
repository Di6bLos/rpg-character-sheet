import { loadPf2e } from '~/data/pf2e'
import { ruleKey, tipText } from '~/utils/ruleTips'

const traits = shallowRef(new Map<string, string>())
const runes = shallowRef(new Map<string, string>())
let loading: Promise<void> | null = null

/**
 * Rules text for PF2e hover tooltips: a trait's (agile, deadly d8 → Deadly) and a rune's
 * (flaming, striking), from `data/pf2e` traits and runes, loaded once for the whole app.
 */
export function usePf2eRuleTexts() {
  if (!loading)
    loading = Promise.all([loadPf2e('traits'), loadPf2e('runes')])
      .then(([t, r]) => {
        traits.value = new Map(t.map((x) => [x.name.toLowerCase(), tipText(x.text)]))
        runes.value = new Map(r.map((x) => [x.name.toLowerCase(), tipText(x.text)]))
      })
      .catch(() => {
        loading = null
      })
  const traitText = (label: string) => traits.value.get(ruleKey(label)) ?? ''
  /** A rune by its name as the sheet has it ("flaming", "Flaming (Greater)", "2 dice striking"). */
  const runeText = (label: string) => {
    const name = label.toLowerCase()
    if (runes.value.has(name)) return runes.value.get(name)!
    const striking = /striking/.test(name)
      ? 'striking'
      : /potency/.test(name)
        ? `weapon potency (+${/\+(\d)/.exec(name)?.[1] ?? 1})`
        : name.replace(/\s*\(.*\)$/, '')
    return runes.value.get(striking) ?? ''
  }
  return { traitText, runeText }
}
