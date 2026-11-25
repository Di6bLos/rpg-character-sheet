# What to check in a Lantern PR

Problems this repo's PRs tend to have. Check each one that applies to the diff, against the code itself.

## Rules and state

- **State that's set but never cleared.** For new shared state (`useState`, `useAttackTarget`, `useAttackSituation`, sheet fields), find every place it is reset: Start turn, End turn, New encounter, End encounter, Safe Rest. If it's never reset, it leaks into the next turn, creature or fight.
- **Rules text.** New regexes over ability or spell text belong in a file listed in `tests/rulesText.test.ts` `SOURCES`. Check them against the actual text in `data/nimble/`, including the upcast and "High Levels" parts.
- **Crit, miss and armor.** A new kind of crit should behave like the existing ones: exploding dice, ignoring armor, `critTriggers`, and the dice tray saying CRIT. Otherwise the result line and the tray disagree.
- **Own dice.** Each automatic effect needs an own-dice path (`sheet.ownDice`): a reminder, or the "It crit" button. A reminder that says something happened must match the state, or tell the player to change it by hand.
- **Condition descriptions.** When a change alters how a condition is used (Helped spent by checks, for example), update its `desc` in `utils/nimbleConditions.ts` / `data/nimble/core.ts`.
- **Dead and Incapacitated.** New actions should be blocked for `INCAPACITATED` conditions and for a dead hero (`isDead`).

## Same rule in more than one place

- **The board and the sheet must agree.** Spell and action blocked reasons live in several chains: `SpellCard`, `castReason` (`utils/battleActions.ts`), the reaction lists in `useNimbleSpells`, and the support-spell chain in `useBattleActions`. A new reason has to be in all of them.
- **Sheet panels and the battle board** share composables (`useNimbleActions`, `useNimbleSpells`, `useTurnSteps`…). A change in one view should still work in the other.

## UI and conventions

- Components use `<script setup lang="ts">`; Prettier (2 spaces, no semicolons, single quotes); `noUncheckedIndexedAccess` guards.
- ARIA roles match the keyboard behaviour (a `radiogroup` needs arrow keys and one tab stop; otherwise use `aria-pressed` chips, like the rest of the app).
- Heavy composables shouldn't be set up just to read one value.
- `CLAUDE.md`'s Architecture section should be updated for new files and behaviour.
- Help text for a section goes in `UiHelp`; panels with headings use `UiFold` where nearby panels do.

## Tests

- New pure logic in `utils/` gets tests. Each option or branch (a flag like `frightened`) gets at least one case.
- Golden level tables (`tests/fixtures/nimble/`) change only on purpose.
