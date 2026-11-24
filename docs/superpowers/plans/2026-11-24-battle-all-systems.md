# Battle board for every system, Party (classic) retired — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** D&D 5e and Pathfinder 2e campaigns play on the Battle tab at every size, then the Party (classic) page and everything only it uses is deleted.

**Architecture:** One pure helper (`battleFeatures(system)`) says which Nimble-only parts of the board a campaign gets; shared battle components read it through `useBattleFeatures()` and hide what doesn't apply. Non-Nimble players get two small new components (a read-only hero card and a basic turn bar) in the slots where Nimble players get the sheet-editor parts. Party goes last, once nothing needs it.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Nuxt 3 SPA, Pinia, Supabase, SCSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-battle-all-systems-design.md`

## Global Constraints

- Branch from an up-to-date `stage` (`git checkout stage && git pull && git checkout -b feat/battle-all-systems`); PRs target `stage`; no push or PR until the user asks.
- Prettier style: 2 spaces, no semicolons, single quotes, width 100. `nvm use 22.18.0` before `npm run lint`.
- Nimble campaigns look and behave exactly as before at every size (phone, tablet 768–1279, desktop ≥1280).
- No turn-logic changes: actions refill at the end of a creature's own turn; New round refills no one.
- Shared components learn layout from props (`compact`, `sheet`, Comms' `only` / `bare`); the system's features come only from `useBattleFeatures()`.
- Non-Nimble initiative is always `classic` (already decided by `useInitiative`); never show the mode switch for it.
- Condition names only (no values) for 5e and PF2e.
- Each task updates the lines of `CLAUDE.md` it makes stale, in place.
- Smoke-test on `npm run dev:local` (one-click GM / Player on `/`; to switch accounts in Playwright clear `localStorage` keys starting with `sb-`), read the console and failed requests, and fix what the app causes.

## Review Focus

1. **Old links** (`/campaigns/:id/board/party`, `/gm/party`, a chat notification, a dashboard card) must land on Battle with the query kept — Task 5, Steps 2 and 6.
2. **A saved phone tab the campaign doesn't have** (`actions` saved from a Nimble campaign, then a 5e one opens) falls back to Hero — Task 2, Step 1.
3. **A 5e hero at 0 HP** shows as Down (not Dead or Slain) on the strip and party card; death saves show in the roster — Task 4, Step 6.
4. **Nimble regression:** desktop 1440×860 GM and Player screenshots match the ones taken before Task 3 — Task 3, Step 1 and Task 5, Step 7.
5. **A non-Nimble player whose row is already rolled** sees no Roll initiative button; one not on the tracker gets the RPC's "not on the tracker yet" note — Task 3, Step 6.

---

### Task 1: 5e and PF2e test campaigns in the local seed

**Files:**

- Modify: `scripts/dev-seed.ts`, `utils/devAccounts.ts` (only if the hero names live there), `CLAUDE.md` (Environment paragraph)

**Interfaces:**

- Produces: two campaigns in the local stack, run by `gm@test.local`, each with `player@test.local`'s hero seated: **"Test Table 5e"** (`system: 'dnd5e'`, level 3 Fighter "Corin", `defaultSheet('dnd5e')` with `class: 'Fighter'`, `hp: 28`, `hpMax: 28`, `ac: 16`, `initMod: 2`) and **"Test Table PF2e"** (`system: 'pf2e'`, level 3 Rogue "Mira", `defaultSheet('pf2e')` with `class: 'Rogue'`, `hp: 38`, `hpMax: 38`, `ac: 19`, `initMod: 3`). Each has one campaign NPC (Goblin, `stat_block: { hp: 7, ac: 15, initMod: 2 }`) so the GM can add it from the add dialog. Use the system ids exactly as `GameSystem` spells them.

- [ ] **Step 1:** Add both campaigns to `seedLocal`, re-runnable like "Test Table" (look the campaign up by name and system before inserting; `--reset` rebuilds the two sheets).
- [ ] **Step 2:** Run `npm run dev:seed` twice. Expected: no error, no duplicate campaigns (check `select name, system from campaigns` on the local DB).
- [ ] **Step 3:** Print the two campaign URLs in `dev-local.ts`'s banner beside the Nimble one; update CLAUDE.md's Environment paragraph.
- [ ] **Step 4: Commit** — `CHORE: 5e and PF2e test campaigns in the local seed`

### Task 2: Battle features per system, condition lists, phone tabs

**Files:**

- Create: `utils/battleFeatures.ts`, `composables/useBattleFeatures.ts`, `tests/battleFeatures.test.ts`
- Modify: `utils/boardLayout.ts`, `composables/usePhoneTab.ts`, `components/battle/Phone.vue`, `utils/sheetDefaults.ts` (`PF2E_CONDITIONS`), `tests/boardLayout.test.ts`, `tests/usePhoneTab.test.ts`

**Interfaces:**

- Produces:
  - `interface BattleFeatures { nimbleHero: boolean; pips: boolean; summons: boolean; initiativeModes: boolean; gmHeroControls: boolean; heroStats: boolean }` — `nimbleHero`: the sheet-editor hero column, action tiles and turn steps (HeroScope); `pips`: action pips on cards; `summons`: Sync summons and summon tokens; `initiativeModes`: the GM's Nimble/classic switch; `gmHeroControls`: the GM's HP and condition controls on a hero; `heroStats`: the stats dialog's stats, saves and skills (`HeroCardStats`).
  - `battleFeatures(system: GameSystem): BattleFeatures` — all `true` for `'nimble'`, all `false` otherwise.
  - `conditionNames(system: GameSystem): string[]` — Nimble: the names `ConditionPicker` lists today (`CONDITIONS` + `SPELL_STATUSES` minus `AUTO_CONDITIONS` and `Helped`); 5e: `DND5E_CONDITIONS`; PF2e: `PF2E_CONDITIONS`.
  - `DND5E_CONDITIONS` (in `utils/sheetDefaults.ts`): Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious.
  - `PF2E_CONDITIONS` extended (keep the current six, order alphabetical): Blinded, Clumsy, Concealed, Confused, Controlled, Dazzled, Deafened, Doomed, Drained, Dying, Enfeebled, Fascinated, Fatigued, Fleeing, Frightened, Grabbed, Hidden, Immobilized, Invisible, Off-guard, Paralyzed, Persistent Damage, Petrified, Prone, Quickened, Restrained, Sickened, Slowed, Stunned, Stupefied, Unconscious, Undetected, Wounded. (The PF2e sheet's condition chips read this list; check it still lays out.)
  - `useBattleFeatures(): ComputedRef<BattleFeatures>` — from `useCampaignBoard().campaign.value?.system`, Nimble while the campaign loads.
  - `phoneTabs(role: PhoneRole, scribe: boolean, actions: boolean): PhoneTab[]` — a player without actions has no `'actions'` tab; `pickTab(role, scribe, actions, saved)` likewise, and a player's default is `'actions'` with actions, `'hero'` without. `usePhoneTab(role, scribe, actions: Ref<boolean>)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/battleFeatures.test.ts
it('gives Nimble everything and other systems none of it', () => {
  expect(Object.values(battleFeatures('nimble')).every(Boolean)).toBe(true)
  expect(Object.values(battleFeatures('dnd5e')).some(Boolean)).toBe(false)
  expect(Object.values(battleFeatures('pf2e')).some(Boolean)).toBe(false)
})
it('lists each system its own conditions', () => {
  expect(conditionNames('dnd5e')).toHaveLength(15)
  expect(conditionNames('dnd5e')).toContain('Exhaustion')
  expect(conditionNames('pf2e')).toContain('Off-guard')
  expect(conditionNames('nimble')).not.toContain('Helped')
  expect(conditionNames('nimble')).not.toContain('Bloodied')
})
// tests/boardLayout.test.ts
it('a player without actions gets Hero first and no Actions tab', () => {
  expect(phoneTabs('player', true, false)).toEqual(['hero', 'party', 'chat', 'scribe'])
  expect(pickTab('player', false, false, 'actions')).toBe('hero')
  expect(pickTab('player', false, true, null)).toBe('actions')
})
```

- [ ] **Step 2:** Run `npx vitest run tests/battleFeatures.test.ts tests/boardLayout.test.ts`. Expected: FAIL (module not found / wrong arity).
- [ ] **Step 3:** Implement the interfaces above; update the existing `phoneTabs` / `pickTab` / `usePhoneTab` tests to pass `actions: true` (Nimble behaviour unchanged); Phone.vue passes `actions = useBattleFeatures().value.nimbleHero`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass. `npm run type-check`, `npm run lint` clean.
- [ ] **Step 5: Commit** — `FEAT: battle features and condition lists per game system`

### Task 3: Battle opens for 5e and PF2e — frames, player hero card and turn bar

**Files:**

- Create: `components/battle/HeroBasic.vue`, `components/battle/TurnBasic.vue`
- Modify: `components/battle/View.vue`, `components/battle/HeroScope.vue`, `components/battle/Phone.vue`, `composables/useSendInitiative.ts`, `CLAUDE.md`

**Interfaces:**

- Consumes: `useBattleFeatures()`, `phoneTabs(…, actions)` (Task 2).
- Produces:
  - `HeroScope` prop `enabled: boolean` — false renders only the slot with `hero: false` (no `HeroEditor`, no `HeroLive`, no `provideBoardHero`). View passes `features.nimbleHero`.
  - `<BattleHeroBasic :entry="RosterEntry" :compact?="boolean" />` — read-only: portrait (`UiAvatar`, `portraitOverride` first), name, class and level, HP bar with temp HP (`hp`, `hpMax`, `tempHp`), "Down" at 0 HP, AC, conditions as chips, link "Open full sheet ↗" to `/character/:id?campaign=:campaignId`. Touch-sized when `compact`.
  - `<BattleTurnBasic :init="ReturnType<typeof useInitiative>" :character-id="string" />` — one line: "Your turn" / "_name_ is acting" / "Not in combat", and "Round N" in an encounter; a **Roll initiative** button while the viewer's row exists with `initiative_rolled === false`: rolls `rollDie(20)` + `summary.initMod`, sends it with `sendInitiative`, shows "Initiative N" plus the RPC's note.
  - `sendInitiative(campaignId: string, characterId: string, total: number): Promise<{ note: string; failed: boolean }>` exported from `composables/useSendInitiative.ts`; `useSendInitiative()` becomes a thin wrapper over it (same notes as today).
  - View for a non-Nimble seated player (`!gmControls && !features.nimbleHero && campaign.myCharacterId`): left `HeroBasic`; centre `TurnBasic` above `BoardRoster`; phone Hero tab `HeroBasic compact`, no `HeroStrip`, no `ResultBar`. GM and watcher slots unchanged. The "battle board is for Nimble campaigns" note and its CSS go.

- [ ] **Step 1:** Before any change, on `npm run dev:local` take 1440×860 mouse screenshots of Test Table's Battle as GM and as Player into the SDD workspace (baseline for the Nimble regression check).
- [ ] **Step 2:** Implement `sendInitiative` and refit `useSendInitiative` on it; `npx vitest run` and `npm run type-check` pass.
- [ ] **Step 3:** Add `enabled` to HeroScope; View drops the `v-if="campaign?.system === 'nimble'"` gate and passes `:enabled="features.nimbleHero"`.
- [ ] **Step 4:** Build `HeroBasic` and `TurnBasic` and place them per the Interfaces block in the desktop, tablet and phone templates of View.
- [ ] **Step 5:** Smoke, Test Table 5e as Player at 1440×860, 1024×768 and 390×844 (touch): hero card values match Corin's sheet; Hero is the phone's first tab; no console errors.
- [ ] **Step 6:** Smoke the Roll initiative cases: as GM click Add party (Corin unrolled, "–"); as Player the button shows, a click puts a number on the strip and the button goes; reload — no button. Remove Corin from the tracker as GM; the button is gone (no row).
- [ ] **Step 7:** Nimble check: Test Table at 1440×860 as GM and Player matches the Step 1 screenshots.
- [ ] **Step 8:** Update CLAUDE.md's `components/battle/` bullet (every system; HeroBasic, TurnBasic, `enabled`). **Commit** — `FEAT: battle board for D&D 5e and Pathfinder 2e players`

### Task 4: Hide the Nimble-only parts for other systems (GM side and shared cards)

**Files:**

- Modify: `components/battle/EncounterCard.vue`, `PartyCards.vue`, `Initiative.vue`, `GmTurnBar.vue`, `GmPhoneMenu.vue`, `ConditionPicker.vue`, `HeroVitals.vue`, `HeroCardDialog.vue`, `GmHero.vue`, `CLAUDE.md`

**Interfaces:**

- Consumes: `useBattleFeatures()`, `conditionNames(system)` (Task 2).
- Produces: per flag —
  - `pips` false: no action pips on `EncounterCard` and `PartyCards` (and none in their aria-labels).
  - `summons` false: no Sync summons in GmTurnBar's menu or GmPhoneMenu; `Initiative` skips summon tokens and the summons dropdown.
  - `initiativeModes` false: no `GmModes` in either menu.
  - `gmHeroControls` false: `HeroVitals` hides the GM's HP controls and condition picker (values shown read-only).
  - `heroStats` false: `HeroCardDialog` shows only `HeroVitals` (no `HeroCardStats`), at the side panel's width.
  - `ConditionPicker` lists `conditionNames(system)`; descriptions only where Nimble has them.

- [ ] **Step 1:** Gate `EncounterCard` and `PartyCards` pips; Nimble cards unchanged.
- [ ] **Step 2:** Gate Sync summons, GmModes and summon tokens.
- [ ] **Step 3:** Gate the GM hero controls and the stats dialog's stats.
- [ ] **Step 4:** Feed `ConditionPicker` from `conditionNames`.
- [ ] **Step 5:** Smoke Test Table 5e and PF2e as GM at 1440×860, 768×1024 (touch) and 390×844 (touch): add the Goblin and the party, Next turn round to round 2 (the Goblin's HP and conditions work; 5e picker shows Exhaustion, PF2e shows Off-guard), open Corin from a token and a party card (vitals read-only, no stats grid), no pips, no Sync summons, no initiative switch, no console errors.
- [ ] **Step 6:** Down at 0 HP: set Corin's HP to 0 on his sheet; the strip token and party card show Down (not Slain/Dead) and the roster shows his death saves.
- [ ] **Step 7:** Nimble check against Task 3's baselines (GM and Player, 1440×860), plus the GM ⋯ menu still has Sync summons and the initiative switch.
- [ ] **Step 8:** Update CLAUDE.md. **Commit** — `FEAT: battle board hides Nimble-only tools for other systems`

### Task 5: Retire the Party (classic) page

**Files:**

- Delete: `components/board/PartyView.vue`, `components/board/Initiative.vue`, `components/board/ActionPanel.vue`, `components/board/ActionPanelBody.vue`, `components/board/ActionPanelMenus.vue`, `components/board/LorePanel.vue`, `composables/useDockedPanel.ts`, `assets/styles/_board-dock.scss`
- Modify: `pages/campaigns/[id]/board/party.vue`, `pages/campaigns/[id]/gm/party.vue` (become redirects), `pages/campaigns/[id]/board/index.vue`, `pages/campaigns/[id]/gm/index.vue`, `assets/styles/main.scss`, `composables/useBoardNav.ts`, `composables/useBoardLayout.ts`, `components/battle/Bar.vue`, `pages/dashboard.vue`, `stores/notifications.ts`, comments in `composables/useBoardTurnSteps.ts`, `useBoardSheetEditor.ts`, `useAnnounce.ts`, `useCampaignChat.ts`, `components/battle/HeroScope.vue`, `utils/analytics.ts` (comment only), `CLAUDE.md`, `design/README.md` (mark Party retired), `_features.md` (only the lines that name Party (classic))

**Interfaces:**

- Consumes: Tasks 3–4 (Battle serves every system).
- Produces:
  - `useBoardLayout()` returns `{ layout, touch }` (the `battle` field goes; nothing else reads it after this task).
  - `useBoardNav().tabs`: Battle, Journal, Maps & images (+ NPCs in the console); `switchTo` falls back to `'battle'` (players switching from the console's NPCs land on Battle).
  - `/campaigns/:id/{board,gm}` and `/campaigns/:id/{board,gm}/party` → `/campaigns/:id/{board,gm}/battle`, `replace: true`, query and hash kept.
  - Analytics keeps `'party'` in `Surface` and `PLAY_SURFACES` (old events); no new path maps to it.

- [ ] **Step 1:** Before deleting, `grep -rn "BoardPartyView\|BoardInitiative\|BoardActionPanel\|BoardLorePanel\b\|useDockedPanel\|edge-tabs\|board-dock\|DOCK_QUERY" components composables pages layouts assets stores plugins utils` — expected hits only in the files listed above; any other hit is a user this plan missed: stop and add it to this task.
- [ ] **Step 2:** Turn both `party.vue` pages into the same redirect `index.vue` uses (to `battle`); point both `index.vue` pages at `battle` unconditionally.
- [ ] **Step 3:** Delete the listed files and the `@use 'board-dock'` line; remove the Party tab from `useBoardNav`, the Party (classic) link from Bar's campaign menu (desktop and tablet) and the drawer code that only it used; drop `battle` from `useBoardLayout`.
- [ ] **Step 4:** Dashboard and notification links to `/board/battle` (`/gm/battle` for the GM's own campaigns); the notification's "already here" check compares against the battle paths.
- [ ] **Step 5:** `npm run test`, `npm run type-check`, `npm run lint` all pass.
- [ ] **Step 6:** Smoke the old links: visit `/campaigns/<test-table-id>/board/party?x=1` and `/gm/party` — both land on Battle with `?x=1`; a party chat message from another account raises a notification that opens Battle; the dashboard card opens Battle.
- [ ] **Step 7:** Sweep every campaign (Test Table, 5e, PF2e) as GM and Player at 390×844 (touch), 768×1024 (touch), 1100×800 and 1440×860: bar tabs show no Party, the GM's campaign name opens Table, chat and Scribe work, no console errors. Nimble 1440×860 matches Task 3's baselines.
- [ ] **Step 8:** Update CLAUDE.md (drop the ActionPanel*, LorePanel*, `useDockedPanel` bullets and every "Party tab" mention; message kinds now say the battle board posts `'action'` rows), `design/README.md`, `_features.md`. **Commit** — `REFACTOR: retire the Party (classic) page`
