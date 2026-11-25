# Battle all systems — follow-up: Battle badge, full GM hero view for every system

> Follow-up to `2026-11-24-battle-all-systems.md` (all 5 tasks done on `feat/battle-all-systems`). Steps use `- [ ]`.

**Goal:** (1) The Battle tab carries the unread badge the retired Party tab had. (2) The GM sees and can change everything about a 5e / PF2e hero that they can for a Nimble hero: the full stats dialog, HP changes and condition changes from the board, applied by the hero's sheet with that system's rules.

**Decisions (user, 2026-11-24):** GM view for 5e/PF2e = "see and change", parity with Nimble. Badge re-added on Battle.

## Global Constraints

- Work on `feat/battle-all-systems`; commit per task; no push or PR.
- Prettier: 2 spaces, no semicolons, single quotes, width 100. `nvm use 22.18.0` before npm.
- Nimble campaigns look and behave exactly as before at every size.
- Battle components learn the system's features only from `useBattleFeatures()` (reactive reads).
- Condition names only (no values) for 5e and PF2e.
- New SQL goes in a new file in `supabase/migrations/`, applied to the **local** stack only with `npx supabase migration up` (never `db reset`, which wipes the seeded data); never touch the hosted project.
- Each task updates the CLAUDE.md lines it makes stale, in place.
- Smoke on `npm run dev:local` (3100; one-click GM / Player on `/`; Test Table, Test Table 5e (Corin), Test Table PF2e (Mira)); read the console and failed requests; leave local data as found.

---

### Task 1: Unread badge on the Battle tab

**Files:** `components/board/Shell.vue`, `composables/useBoardNav.ts` (`BoardTab`), `components/battle/Bar.vue`, the board/gm pages that passed `unread` before; `git show a6a4ca9` shows exactly what was removed.

- [x] **Step 1:** Read what the Party tab's badge counted before `a6a4ca9` (`git show a6a4ca9 -- components/board/Shell.vue composables/useBoardNav.ts components/battle/Bar.vue pages/`) and put the same count on the Battle tab, everywhere the tab row shows (desktop Bar, tablet Bar, phone campaign menu if tabs are listed there). Same styling as before.
- [x] **Step 2:** Smoke: as Player in Test Table, another account (e.g. bram@test.local) posts a party message while the player is on Journal; Battle shows the badge; opening Battle clears it as before. No console errors.
- [x] **Step 3:** CLAUDE.md; **Commit** — `FEAT: unread badge on the Battle tab`

### Task 2: The GM's stats dialog for 5e and PF2e heroes

**Files:** new migration (replace `campaign_hero_card`), `composables/useHeroCard.ts` and its types, `components/battle/HeroCardStats.vue` (or per-system siblings), `HeroCardDialog.vue`, `HeroVitals.vue`, `PartyCards.vue`, `utils/battleFeatures.ts`, tests.

- `campaign_hero_card` also returns, by `characters.system`: 5e — `abilities` (six scores), `saveProfs`, `profBonus`, `speed`, `passivePerception`, `deathSaves`, `hitDie`; PF2e — `attrs` (six modifiers), `saves` (Fortitude/Reflex/Will/Perception/Class DC with rank and value), `skills` (name, attr, rank, value), `heroPoints`, `focus` (current/max), `dying`, `wounded`, `shield`. Keep every existing key (Nimble unchanged). Members-only as today.
- `HeroCardStats` shows the hero's system: 5e ability scores with modifiers, saving throws (prof marked), passive, speed, death saves; PF2e attribute modifiers, saves with rank, skills with rank, hero points, focus points, shield. Same layout language as the Nimble stats.
- `heroStats` becomes true for every system (or the flag goes if nothing else reads it). The dialog is full width again for 5e/PF2e. Resources the GM sees on Nimble (mana) map to: PF2e focus points and hero points on the GM's party card and vitals; 5e none.
- [x] Tests for any pure mapping (e.g. 5e modifier, PF2e rank labels). Smoke 5e/PF2e GM 1440 + 390 touch: open Corin / Mira from a token and a party card; values match their sheets. Nimble dialog unchanged.
- [x] CLAUDE.md; **Commit** — `FEAT: GM stats dialog for D&D 5e and Pathfinder 2e heroes`

### Task 3: The GM changes a 5e / PF2e hero's HP and conditions from the board

**Files:** `types/sheets.ts` (5e: `tempHp: number`, `conditions: string[]`), `utils/sheetDefaults.ts`, the 5e sheet(s) (`components/sheet/Dnd5e*.vue`: show temp HP and a conditions editor from `DND5E_CONDITIONS`, matching how Pf2eSheet does chips), `utils/heroHpChange.ts` + `utils/heroConditionChange.ts` (per-system apply), `composables/useHeroHpChanges.ts`, `useHeroConditionChanges.ts` (drop the `system !== 'nimble'` guard; apply per system), the 5e/PF2e sheets and the non-Nimble player's battle board (so a change lands while the player is on Battle, as Nimble's `HeroLive` does), `utils/battleFeatures.ts` (`gmHeroControls` true for all), `HeroVitals.vue`, `EncounterCard.vue` (HP buttons back for heroes), tests.

- HP rules (pure, unit-tested): **5e** — damage takes temp HP first, then HP, floor 0; healing caps at hpMax; healing from 0 resets `deathSaves` to 0/0; a crit flag doesn't change damage. **PF2e** — damage takes temp HP first, then HP, floor 0; dropping to 0 sets `dying` to 1 + `wounded` (2 + `wounded` on a crit); healing from 0 sets `dying` 0 and raises `wounded` by 1; healing caps at hpMax. Return a short message for `say()` like Nimble's.
- Conditions: `gm_set_hero_condition` already writes `sheet.conditions` for any system; for non-Nimble pass `p_end` null. Apply live with a plain add/remove on `sheet.conditions` (no Nimble `conditionEnds`).
- The 5e/PF2e player's board: a seated non-Nimble player has no sheet editor today (`HeroScope enabled=false`). Mount just enough for the pickups to apply and autosave (preferred: reuse `provideSheetEditor`/`useBoardSheetEditor` for any system, without Nimble's turn steps or `HeroLive`'s Nimble parts); HeroBasic then reads the live values.
- The roster/party cards/HeroBasic show 5e temp HP and conditions (roster summary already passes `tempHp` and `conditions` from the sheet).
- [x] Unit tests for the HP and condition rules first (RED → GREEN).
- [x] Smoke 5e and PF2e: as GM, damage Corin (temp first), drop him to 0 (Down, death saves), heal (saves reset); add/remove Prone; player's board and open sheet show it live; reload — it held. PF2e Mira: 0 HP → Dying 1, heal → Wounded 1. Restore both sheets as seeded. Nimble GM HP/conditions unchanged.
- [x] CLAUDE.md (Data model `hero_hp_changes` / `hero_condition_changes` now every system); **Commit** — `FEAT: GM changes 5e and PF2e heroes' HP and conditions from the board`
