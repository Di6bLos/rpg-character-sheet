// What a 1st-level subclass option grants that AoN's entry leaves out, hand-encoded from the
// book (ORC content). AoN's druidic order pages hold only the description; Player Core
// pp. 125–126 give each order a trained skill, an order feat and an order spell (a focus spell;
// the Druidic Order feature, p. 122, starts the focus pool at 1 Focus Point).
import type { Pf2eSource } from './types'

export interface Pf2eSubclassGrants {
  /** Skills the option trains. */
  skills: string[]
  /** Feats it grants, by name. */
  feats: string[]
  /** Focus spells it grants, by name. */
  focus: string[]
  source: Pf2eSource
}

/** By `${kind}:${name}` of the option. */
export const SUBCLASS_GRANTS: Record<string, Pf2eSubclassGrants> = {
  'Druidic Order:Animal': {
    skills: ['Athletics'],
    feats: ['Animal Companion'],
    focus: ['Heal Animal'],
    source: { book: 'Player Core', page: 125 },
  },
  'Druidic Order:Leaf': {
    skills: ['Diplomacy'],
    feats: ['Leshy Familiar'],
    focus: ['Cornucopia'],
    source: { book: 'Player Core', page: 125 },
  },
  'Druidic Order:Storm': {
    skills: ['Acrobatics'],
    feats: ['Storm Born'],
    focus: ['Tempest Surge'],
    source: { book: 'Player Core', page: 125 },
  },
  'Druidic Order:Untamed': {
    skills: ['Intimidation'],
    feats: ['Untamed Form'],
    focus: ['Untamed Shift'],
    source: { book: 'Player Core', page: 126 },
  },
}
