---
name: add-game-system
description: Checklist for making a game system data-driven in Lantern the way Nimble is (typed rules data, a build/level-up util, golden tests, a hero builder page, sheet integration). Use when starting data-driven D&D 5e or Pathfinder 2e characters, or adding any new system.
---

# Add a data-driven game system

Nimble is the reference implementation. Copy its structure, keep the names parallel, and don't generalise Nimble code early. Extract shared pieces only once a second system really needs them.

Load `rpg-rules` first, and fill in `references/<system>.md` from the stub as the first deliverable. It will be the yardstick for every later step.

## Checklist

Track progress in `_features.md` (project rule: check tasks off as they land).

1. **Sources and license**
   - Put the books in `.local/<system>/` and add them to `rpg-rules/references/books.md` (layout, page offset, open vs own-book).
   - Decide what ships: open content (SRD 5.2 / ORC) only in committed data; own-book content stays local (`licensing.md`).
   - Add the attribution notice the license requires.
2. **Types**: `data/<system>/types.ts`, modelled on `data/nimble/types.ts` (`ClassDef`, `LevelDef`, `ChoiceDef`/`ChoiceSource`, `SubclassDef`, spells, ancestry/heritage, background). Encode every mechanic the level-up needs as fields, not prose.
3. **Data**: `data/<system>/classes/<slug>.ts` plus shared helpers, spells, ancestries, backgrounds and core (weapons, armor). Each file starts with a citation comment. Use the `source-extract` skill.
4. **Build util**: `utils/<system>Build.ts`, parallel to `utils/nimbleBuild.ts`: `build<System>Sheet`, `<system>LevelPlan`, `apply<System>Level`, `creationChoices`, `resolveChoice`/`validatePicks`, and a subclass change if the system allows one. Record level history so levels can be undone (`utils/levelHistory.ts`).
5. **Sheet type**: extend the system's sheet in `types/sheets.ts` with `classSlug` (empty means a hand-made sheet that keeps the old free-text flow) and recorded `choices`. Keep the shared keys (`class`, `lineage`, `hp`, `hpMax`, `ac`, `initMod`, `passivePerception`) filled, because the `campaign_roster` RPC reads them.
6. **Tests**
   - `tests/<system>Build.test.ts`: data integrity (every reference resolves, every class + subclass builds 1→20), modelled on the `nimble data` and `levelling` blocks in `tests/nimbleBuild.test.ts`. Put shared helpers in `tests/helpers/<system>.ts`.
   - `tests/<system>Levels.test.ts`: golden level tables, like `tests/nimbleLevels.test.ts`. Write fixtures only after a `rules-auditor` pass.
7. **Audit**: generalise the `rules-auditor` agent's "What the build actually produces" step to the new system, then audit each class (one agent per class, in parallel).
8. **Builder page**: `pages/characters/new/<system>.vue`, following `/characters/new/nimble` (class → ancestry → stats → background → review). Reuse `components/nimble/ChoicePicker.vue`'s pattern. Match `design/` for UI.
9. **Sheet integration**: data-driven level-up in `components/sheet/LevelUpDialog.vue` when `classSlug` is set, using `useSheetEditor` / `useSheet()` for the working copy and autosave.
10. **Docs**: update CLAUDE.md (Architecture, Routes) and `_features.md`. Run the `ui-ux-reviewer` agent after the builder page lands (project rule: only after major UI changes).

## Done when

`npm run test`, `npm run type-check` and `npm run lint` are clean (Node 22.18: `nvm use 22.18.0`); each class has an audited golden fixture; a hero can be created and levelled 1→20 in the UI.
