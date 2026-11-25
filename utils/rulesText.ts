// Library → Rules: turns a topic file from data/rules into the markdown the page renders.
// A file can hold placeholder lines that pull tables straight from the game data, so the
// conditions and actions read exactly as the app's rules data has them:
//   {{pf2e-conditions}}            every PF2e condition (data/pf2e/generated/conditions.json)
//   {{pf2e-actions: Aid, Strike}}  those Player Core actions (actions.json), in that order
//   {{nimble-conditions}}, {{nimble-reactions}}, {{nimble-armor}}, {{nimble-weapons}}
//                                  the tables in data/nimble/core.ts
import { ARMOR, CONDITIONS, REACTIONS, WEAPONS } from '~/data/nimble/core'
import type { Pf2eActionCost, Pf2eActionDef, Pf2eConditionDef } from '~/data/pf2e/types'

/** The PF2e data sets a topic's placeholders need, fetched by the caller. */
export interface RulesData {
  pf2eActions?: Pf2eActionDef[]
  pf2eConditions?: Pf2eConditionDef[]
}

const PLACEHOLDER = /^\{\{([\w-]+)(?::\s*(.*?))?\}\}$/gm

/** Which PF2e data sets a topic file asks for. */
export function rulesNeeds(markdown: string): (keyof RulesData)[] {
  const needs = new Set<keyof RulesData>()
  for (const [, name] of markdown.matchAll(PLACEHOLDER)) {
    if (name === 'pf2e-actions') needs.add('pf2eActions')
    if (name === 'pf2e-conditions') needs.add('pf2eConditions')
  }
  return [...needs]
}

/** A table cell: one line, pipes escaped for `loreHtml`'s table parser. */
function cell(text: string): string {
  return text
    .replace(/\n\s*[-*]\s+/g, ' • ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

function table(head: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n')
}

/** Condition text, cut before its own sub-headings (Persistent Damage's extra rules). */
function conditionCell(c: Pf2eConditionDef): string {
  const [main = '', ...rest] = c.text.split(/\n#{1,6}\s/)
  const more = rest.length ? ` More rules in ${c.source.book} p. ${c.source.page}.` : ''
  return cell(main) + more
}

function pf2eConditions(list: Pf2eConditionDef[]): string {
  const rows = [...list]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => [
      c.valued ? `${c.name} _N_` : c.name,
      `${conditionCell(c)} _(p. ${c.source.page})_`,
    ])
  return table(['Condition', 'Effect'], rows)
}

const COST: Record<string, string> = {
  '1': '1 action',
  '2': '2 actions',
  '3': '3 actions',
  reaction: 'reaction',
  free: 'free action',
}

function actionCost(cost: Pf2eActionCost | undefined): string {
  return cost === undefined ? '' : (COST[String(cost)] ?? String(cost))
}

/** One action: a heading with its cost, its stat lines, then its text. */
function pf2eAction(a: Pf2eActionDef): string {
  const cost = actionCost(a.actions)
  const stats = [
    a.traits.length ? `**Traits** ${a.traits.join(', ')}` : '',
    a.frequency ? `**Frequency** ${a.frequency}` : '',
    a.trigger ? `**Trigger** ${a.trigger}` : '',
    a.requirements ? `**Requirements** ${a.requirements}` : '',
  ].filter(Boolean)
  // Its own headings would outrank the action's; they become bold lines instead.
  const text = a.text.replace(/^#{1,6}\s+(.*)$/gm, '**$1**')
  return [
    `### ${a.name}${cost ? ` · ${cost}` : ''}`,
    ...stats,
    '',
    text,
    '',
    `_${a.source.book} p. ${a.source.page}_`,
  ].join('\n')
}

function pf2eActions(list: Pf2eActionDef[], names: string[]): string {
  const byName = new Map(
    list.filter((a) => a.source.book === 'Player Core').map((a) => [a.name.toLowerCase(), a]),
  )
  return names
    .map((n) => byName.get(n.toLowerCase()))
    .filter((a): a is Pf2eActionDef => !!a)
    .map(pf2eAction)
    .join('\n\n')
}

const nimbleList = (list: { name: string; desc: string }[], head: string) =>
  table(
    [head, 'Effect'],
    list.map((c) => [c.name, cell(c.desc)]),
  )

const nimbleArmor = () =>
  table(
    ['Armor', 'Type', 'Armor value', 'Req. STR', 'Cost'],
    ARMOR.map((a) => [a.name, a.kind, a.armor, a.str ? String(a.str) : '–', a.cost ?? '–']),
  )

const nimbleWeapons = () =>
  table(
    ['Weapon', 'Damage', 'Properties', 'Cost'],
    WEAPONS.map((w) => [
      w.name,
      `${w.dice}+${w.stat} ${w.type.toLowerCase()}`,
      cell(w.props) || '–',
      w.cost ?? '–',
    ]),
  )

/**
 * The topic's markdown with every placeholder filled in. A PF2e placeholder whose data
 * wasn't passed throws, so a missing fetch fails loudly instead of rendering a gap.
 */
export function expandRules(markdown: string, data: RulesData = {}): string {
  return markdown.replace(PLACEHOLDER, (whole, name: string, args?: string) => {
    switch (name) {
      case 'pf2e-conditions':
        if (!data.pf2eConditions) throw new Error('Rules: PF2e conditions not loaded')
        return pf2eConditions(data.pf2eConditions)
      case 'pf2e-actions':
        if (!data.pf2eActions) throw new Error('Rules: PF2e actions not loaded')
        return pf2eActions(
          data.pf2eActions,
          (args ?? '').split(',').map((s) => s.trim()),
        )
      case 'nimble-conditions':
        return nimbleList(CONDITIONS, 'Condition')
      case 'nimble-reactions':
        return nimbleList(REACTIONS, 'Reaction')
      case 'nimble-armor':
        return nimbleArmor()
      case 'nimble-weapons':
        return nimbleWeapons()
      default:
        throw new Error(`Rules: unknown placeholder ${whole}`)
    }
  })
}

export interface RulesSection {
  /** The `##` heading; empty for the text before the first one. */
  title: string
  /** The section's markdown, heading included. */
  markdown: string
}

/** A topic split at its `##` headings, the intro first. */
export function rulesSections(markdown: string): RulesSection[] {
  return markdown
    .split(/^(?=## )/m)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      title: part.startsWith('## ') ? (part.split('\n')[0] ?? '').slice(3).trim() : '',
      markdown: part,
    }))
}

/** Plain words of some markdown, for searching. */
export function rulesPlain(markdown: string): string {
  return markdown
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, ' ')
    .replace(/[|*_`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every word of the query appears in the text (case-insensitive). */
export function rulesMatch(text: string, query: string): boolean {
  const hay = text.toLowerCase()
  return rulesTerms(query).every((t) => hay.includes(t))
}

export function rulesTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** A cite line: "_Player Core pp. 400–401._", "_Core p. 8; GM's Guide p. 24._". */
export const RULES_CITE = /\bpp?\.\s*\d+/
