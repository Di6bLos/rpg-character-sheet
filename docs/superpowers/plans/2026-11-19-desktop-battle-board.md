# Desktop Battle Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A no-scroll, three-column battle screen on the Party tab for Nimble campaigns at 1200px and wider, for players and the GM, built on the existing rules composables.

**Architecture:** `PartyView.vue` switches to a new `components/battle/` layout when the campaign is Nimble and the viewport is ≥1200px; below that the current layout is untouched. Availability ("Ready now") comes from one pure helper in `utils/battleActions.ts` fed by `useNimbleActions` / `useNimbleSpells`; turn order changes go through pure helpers in `utils/initiative.ts`. One migration adds monster conditions and action counts plus a members-only hero card RPC.

**Tech Stack:** Vue 3 + Nuxt 3 (SPA), TypeScript, Pinia, SCSS with theme CSS variables, Supabase (Postgres + RLS + realtime), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-desktop-battle-board-design.md` (mockup beside it; its New round pip refill is outdated, the spec wins).

## Global Constraints

- Breakpoint: battle board from `min-width: 1200px`, Nimble campaigns only; below that and for other systems the current Party tab renders unchanged.
- No page scroll at 1440×860 or 1200×800: the board fills `100dvh` minus the app nav; only panels scroll inside.
- Columns: left 320px, centre `minmax(0, 1fr)`, right 340px; 14px gaps; 20px page gutter (GM left column 340px).
- `<script setup lang="ts">`, SCSS with theme variables only (no hard-coded colours), no UI library; Prettier 2 spaces, no semicolons, single quotes, width 100.
- All four themes (Classic, Gothic, Eldritch, Cursed) incl. the `.panel` palette remap.
- `noUncheckedIndexedAccess`: guard every index access.
- Players never get enemy HP numbers or monster action counts; enemy HP shows as a band.
- Actions refill at the end of each creature's own turn; New round does **not** refill actions.
- Renaming a combatant changes `combatants.name` only.
- Never use rule-book art. Run `nvm use 22.18.0` before lint.
- Done means: `npm run test`, `npm run type-check`, `npm run lint` pass and a browser smoke test on `npm run dev:local` (Player and GM accounts, "Test Table").

## Review Focus

1. **Short or narrow laptops (1200×800, 1280×720):** nothing overflows the page; panels scroll inside, the turn button and HP stay visible. Pinned by the Task 13 smoke checklist.
2. **An action that stops being usable while the pointer is on it** (the GM ends your turn, mana drops): the tile updates and a click does nothing. Pinned by `useBattleActions`' guard test in Task 5.
3. **Bad rename input** (empty, whitespace, 200 characters): empty is rejected, the rest is trimmed and capped at 80. Pinned by `renamedCombatant` tests in Task 2.
4. **Custom combatants without a stat block, and minions with no HP:** the stat block shows numbers only and HP edits clamp to 0..max without errors. Pinned by `clampHp` tests in Task 2 and the stat block fallback in Task 11.
5. **A crowded initiative (12+ combatants, long names):** the strip stays one row, scrolls sideways, and keeps the acting token in view. Pinned by the Task 7 step that scrolls the active token into view, plus the smoke checklist.

---

### Task 1: Database: monster conditions and actions, hero card RPC

**Files:**
- Create: `supabase/migrations/20261119120000_battle_board.sql`
- Modify: `types/index.ts` (`Combatant`, `InitiativeRow`, new `HeroCard`)
- Modify: `stores/campaign.ts` (add `heroCard`)

**Interfaces:**
- Produces: `Combatant.conditions: string[]`, `Combatant.actions_max: number`, `Combatant.actions_used: number`; `InitiativeRow.conditions: string[]`, `InitiativeRow.actions_max: number | null`, `InitiativeRow.actions_used: number | null`.
- Produces: `interface HeroCard { name: string; level: number; portrait_path: string | null; class: string; subclass: string; lineage: string; hp: number; hpMax: number; tempHp: number; wounds: number; woundsMax: number; ac: number; speed: string; initMod: number; stats: Record<'STR' | 'DEX' | 'INT' | 'WIL', number>; saveAdv: string; saveDis: string; skills: { name: string; stat: string; points: number }[]; mana: { current: number; max: number } | null; resource: { name: string; count: number; dice: number; die: number } | null; conditions: string[]; summons: { name: string; hp: number; hpMax: number }[]; abilities: { name: string; desc: string; src: string }[] }`.
- Produces: `useCampaignStore().heroCard(campaignId: string, characterId: string): Promise<HeroCard>`.

- [ ] **Step 1: Write the migration.**
  - `alter table public.combatants add column conditions text[] not null default '{}', add column actions_max smallint not null default 1 check (actions_max between 0 and 9), add column actions_used smallint not null default 0 check (actions_used >= 0);`
  - Drop and recreate `public.campaign_initiative(uuid)` with the same body as `20261117200000_summons_initiative.sql`, plus three columns: `conditions text[]` for everyone, and `actions_max smallint` / `actions_used smallint` returned only when `gm`, else null. Re-grant it as before.
  - Create `public.campaign_hero_card(p_campaign uuid, p_character uuid) returns jsonb`: `security definer`, `search_path = ''`. Raise unless `private.is_campaign_member(p_campaign)` and the character is seated in that campaign (`campaign_members.character_id`). Return `jsonb_build_object` of exactly the `HeroCard` keys, read from `characters.sheet` (`effects[].condition` and `conditions` merged into `conditions`; abilities mapped to `name`, `desc` and `src`). Never return notes, coins, inventory or backstory. Revoke from `public, anon`; grant to `authenticated`.
- [ ] **Step 2: Apply locally and check.**
  - Run: `npx supabase db reset` (or `supabase migration up`).
  - Then run `docker exec supabase_db_rpg-character-sheet psql -U postgres -c "select column_name from information_schema.columns where table_name='combatants' and column_name in ('conditions','actions_max','actions_used')"`.
  - Expected: 3 rows.
- [ ] **Step 3: Update the types.** Update the types in `types/index.ts`, map the new fields in `fromCombatant` (`composables/useInitiative.ts`), and add `heroCard` (`supabase.rpc('campaign_hero_card', …)`) to `stores/campaign.ts`.
- [ ] **Step 4: Type-check.**
  - Run: `npm run type-check`.
  - Expected: no errors.
- [ ] **Step 5: Commit.**
  - Run: `git add supabase/migrations/20261119120000_battle_board.sql types/index.ts stores/campaign.ts composables/useInitiative.ts`
  - Then: `git commit -m "feat(board): monster conditions and actions, hero card RPC"`

### Task 2: Turn order and combatant helpers (pure)

**Files:**
- Modify: `utils/initiative.ts`
- Test: `tests/initiative.test.ts`

**Interfaces:**
- Produces:
  - `turnAfter(order: { id: string }[], activeId: string | null, round: number): { active: string; round: number; ended: string | null } | null` returns null when the order is empty. `ended` is the id whose turn just ended.
  - `newRoundStart(order: { id: string }[], round: number): { active: string; round: number } | null`.
  - `clampHp(hp: number | null, delta: number, max: number | null): number`.
  - `renamedCombatant(raw: string): string | null` trims, caps at `COMBATANT_NAME_MAX` and returns null when empty.

- [ ] **Step 1: Write failing tests** in `tests/initiative.test.ts`:

```ts
describe('turnAfter', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('starts at the top', () => expect(turnAfter(order, null, 1)).toEqual({ active: 'a', round: 1, ended: null }))
  it('moves on and reports who ended', () => expect(turnAfter(order, 'a', 2)).toEqual({ active: 'b', round: 2, ended: 'a' }))
  it('wraps into the next round', () => expect(turnAfter(order, 'c', 2)).toEqual({ active: 'a', round: 3, ended: 'c' }))
  it('is null for an empty order', () => expect(turnAfter([], null, 1)).toBeNull())
})
describe('newRoundStart', () => {
  it('jumps to the top of the next round, skipping the rest', () =>
    expect(newRoundStart([{ id: 'a' }, { id: 'b' }], 3)).toEqual({ active: 'a', round: 4 }))
})
describe('clampHp', () => {
  it('clamps to 0..max', () => {
    expect(clampHp(4, -10, 15)).toBe(0)
    expect(clampHp(14, 5, 15)).toBe(15)
    expect(clampHp(null, 3, null)).toBe(0)
  })
})
describe('renamedCombatant', () => {
  it('rejects blank', () => expect(renamedCombatant('   ')).toBeNull())
  it('trims and caps at 80', () => expect(renamedCombatant(`  ${'x'.repeat(200)} `)).toBe('x'.repeat(80)))
  it('keeps a normal name', () => expect(renamedCombatant('Snaggletooth')).toBe('Snaggletooth'))
})
```

- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `npx vitest run tests/initiative.test.ts`.
  - Expected: FAIL with "turnAfter is not a function" (or similar).
- [ ] **Step 3: Implement the four functions** in `utils/initiative.ts`.
- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run: `npx vitest run tests/initiative.test.ts`.
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - Run: `git add utils/initiative.ts tests/initiative.test.ts`
  - Then: `git commit -m "feat(board): pure turn, round, HP and rename helpers"`

### Task 3: Initiative composable: refill on turn end, New round, rename, conditions, action pips

**Files:**
- Modify: `composables/useInitiative.ts`

**Interfaces:**
- Consumes: Task 1 columns and Task 2 helpers.
- Produces: these additions to the return value of `useInitiative(...)`:
  - `newRound(): void`
  - `rename(c: TurnRow, raw: string): Promise<boolean>`
  - `setConditions(c: TurnRow, conditions: string[]): Promise<void>`
  - `setActions(c: TurnRow, patch: { actions_used?: number; actions_max?: number }): Promise<void>`
- Produces: `TurnRow` now carries `conditions`, `actions_max` and `actions_used` (null for players).

- [ ] **Step 1: Make `nextTurn` use `turnAfter`.** After saving, when `ended` is a non-PC combatant (kind `monster` | `npc` | `summon`) with `actions_used > 0`, update its `actions_used` to 0. Heroes are untouched; they refill through `endTurn()` on their own board. `prevTurn` changes nothing about actions.
- [ ] **Step 2: Add the four functions.**
  - `newRound()` uses `newRoundStart` and writes no actions.
  - `rename` uses `renamedCombatant`, returns false without writing when it is null, and updates `name` optimistically.
  - `setConditions` and `setActions` update their columns optimistically, with `snackbar.error` on failure, as `adjustHp` does.
  - Make `adjustHp` use `clampHp`.
- [ ] **Step 3: Type-check and test.**
  - Run: `npm run type-check && npx vitest run tests/initiative.test.ts`.
  - Expected: both pass.
- [ ] **Step 4: Commit.**
  - Run: `git add composables/useInitiative.ts`
  - Then: `git commit -m "feat(board): GM turn controls refill monster actions at turn end, add New round and rename"`

### Task 4: Availability and action sections (pure)

**Files:**
- Create: `utils/battleActions.ts`
- Modify: `composables/useNimbleSpells.ts` (`spellAttacks` uses `castReason`)
- Test: `tests/battleActions.test.ts`

**Interfaces:**
- Produces:

```ts
export type ActionGroup = 'attack' | 'support' | 'react'
export type ActionKind = 'weapon' | 'spell' | 'ability' | 'reaction' | 'summon'
export type ActionFilter = 'ready' | 'all' | 'attack' | 'spell' | 'react' | 'ability'
export interface BattleAction {
  key: string; name: string; kind: ActionKind; group: ActionGroup
  tier: number | null; actions: number; mana: number; dice: string
  detail: string; desc: string; school: string | null
  /** Usable while it isn't your turn (reactions, paid off-turn casts). */
  offTurn: boolean
  /** Why it can't be used right now; '' when it can. */
  unavailable: string
}
export interface ActionSection { id: string; title: string; actions: BattleAction[] }
export function castReason(
  s: { used?: boolean; busy?: boolean; noActions?: boolean; short?: boolean; usesMinions?: boolean; cost?: string },
  ctx: { turnActive: boolean; incapacitated: string },
): string
export function weaponReason(w: { why: string; blocked: boolean }): string
export function reactionReason(r: { used: boolean; blocked: boolean }): string
export function sectionsFor(list: BattleAction[], filter: ActionFilter, query: string, onTurn: boolean): ActionSection[]
export function readyNote(list: BattleAction[], ctx: { onTurn: boolean; actionsLeft: number; mana: number | null }): string
```

- [ ] **Step 1: Write failing tests** in `tests/battleActions.test.ts`. Use a factory `act(patch)` for `BattleAction`.
  - `castReason` returns these, in priority order: incapacitated text; `'Not your turn'`; `'Used this turn'`; `'Finish casting first'`; `'No actions left'`; then for `short`, `` `Needs ${cost}` `` when `usesMinions`, else `'Not enough mana'`; `''` otherwise. Assert each case.
  - `weaponReason({ why: '', blocked: true })` is `'Unavailable'`. `weaponReason({ why: 'Not your turn', blocked: true })` is `'Not your turn'`.
  - `reactionReason`: `{ used: true }` gives `'Used this round'`. `{ blocked: true }` gives `'No actions left'`.
  - `sectionsFor(list, 'ready', '', true)`:
    - returns only actions with `unavailable === ''`;
    - section titles are in this order, and empty sections are omitted: `'Attack'`, `'Boost & support'`, `'Reactions'`.
  - `sectionsFor(list, 'ready', '', false)`: the support section is titled `'Off-turn'` and holds only `offTurn` actions.
  - `sectionsFor(list, 'all', '', true)`:
    - keeps unavailable actions;
    - titles are `'Weapons'`, `'Class abilities'`, `'Reactions'`, `'Cantrips'`, `'Tier 1'`, `'Tier 2'` (tier sections only for tiers present).
  - A query of `'zap'` matches name or desc, case-insensitively.
  - `readyNote`:
    - on turn: `'1 action left · 13 mana · hiding 4 you can't use now'` for 1 action, 13 mana and 4 unavailable;
    - with `mana: null`, the mana part is left out;
    - off turn: `'Not your turn · only reactions and off-turn options'`.
- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `npx vitest run tests/battleActions.test.ts`.
  - Expected: FAIL (module not found).
- [ ] **Step 3: Implement `utils/battleActions.ts`.** Then replace the inline reason chain in `spellAttacks` (`composables/useNimbleSpells.ts`, the `const why = …` block) with `castReason(s, { turnActive: sheet.value.turnActive, incapacitated: cond.incapacitated ?? '' })`, so the sheet and the board share one rule.
- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run: `npx vitest run tests/battleActions.test.ts tests/rulesText.test.ts && npm run type-check`.
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - Run: `git add utils/battleActions.ts tests/battleActions.test.ts composables/useNimbleSpells.ts`
  - Then: `git commit -m "feat(board): one availability rule for Ready now and the sheet"`

### Task 5: `useBattleActions` composable

**Files:**
- Create: `composables/useBattleActions.ts`
- Test: `tests/battleActions.test.ts` (guard test)

**Interfaces:**
- Consumes: `useNimbleActions()`, which provides `attacks`, `reactions`, `toggleReaction`, `attackAbilities` and `left` (plus the ability-action and counter lists the Actions panel renders). Also `useNimbleSpells()`, which provides `spellAttacks`, `tiers`, `reactionSpells`, `cast` and `setUpcast`, plus Task 4.
- Produces: `useBattleActions(): { actions: ComputedRef<(BattleAction & { use: () => void })[]>; onTurn: ComputedRef<boolean>; actionsLeft: ComputedRef<number>; mana: ComputedRef<number | null>; lastResult: Ref<string> }`. It must run inside a sheet editor (`useSheet()`).
- Produces: `guarded(a: BattleAction & { use: () => void }): void`, exported from `utils/battleActions.ts`. It calls `use` only when `unavailable === ''`.

- [ ] **Step 1: Write a failing test.** `guarded` must not call `use` when `unavailable` is `'Not your turn'`, and must call it once when `''`.
- [ ] **Step 2: Run it and confirm it fails.**
  - Run: `npx vitest run tests/battleActions.test.ts`.
  - Expected: FAIL.
- [ ] **Step 3: Implement.** Map each source into `BattleAction`:
  - **Weapons:** from `attacks` (`kind: 'weapon'`, `group: 'attack'`, `weaponReason`).
  - **Damage spells:** from `spellAttacks` (`kind: 'spell'`, `group: 'attack'`, reason `why`).
  - **Other castable spells:** from `tiers`, excluding damage and reaction spells (`group: 'support'`, `castReason`). `offTurn` is true when the spell text allows an off-turn cast, e.g. Heart's Fire.
  - **Reactions:** from `reactions` and `reactionSpells` (`group: 'react'`, `offTurn: true`, `reactionReason` / `castReason` with `turnActive: true`).
  - **Attack abilities and summon commands:** from `attackAbilities` (`group: 'attack'`). Use `kind: 'summon'` when the key comes from a summon.
  - **Ability actions and limited uses:** use the reasons those panels already compute (`why`, `short`, `left === 0`) for `group: 'support'` and `kind: 'ability'`.
  - **Clicks:** `use` performs exactly what the sheet button does and sets `lastResult` from the result message (via the composables' `onResult`).
- [ ] **Step 4: Run the tests and type-check.**
  - Run: `npx vitest run tests/battleActions.test.ts && npm run type-check`.
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - Run: `git add composables/useBattleActions.ts utils/battleActions.ts tests/battleActions.test.ts`
  - Then: `git commit -m "feat(board): useBattleActions feeds the battle action panel"`

### Task 6: Layout switch and battle frame

**Files:**
- Create: `composables/useWideBoard.ts`, `components/battle/Board.vue`, `components/battle/Bar.vue`
- Modify: `components/board/PartyView.vue`, `components/board/Shell.vue` (hide its header and tabs on the battle board), `assets/styles/_board-dock.scss` (no shift when `.battle` is present)

**Interfaces:**
- Produces: `useWideBoard(): ComputedRef<boolean>`. It is true when `matchMedia('(min-width: 1200px)')` matches and `campaign.system === 'nimble'`, and it updates on change.
- Produces: `<BattleBoard :init="init" />` with slots `left`, `centre` and `right`, laid out to the Global Constraints grid.
- Produces: `<BattleBar :init="init" />`. It shows:
  - the campaign name, with a menu holding the campaign switcher and "Playing as";
  - the tabs, plus NPCs for the GM;
  - the round chip;
  - for players: "Open full sheet";
  - for the GM: Prev, Next turn, New round, End encounter, and Table (opens `BoardTableAdmin` in a `UiDialog`).

- [ ] **Step 1: Implement `useWideBoard`.** Then, in `PartyView.vue`, render `<BattleBoard>` when it is true and today's template otherwise. `BoardActionPanel` and `BoardLorePanel` don't mount on the battle board.
- [ ] **Step 2: Implement `Board.vue` and `Bar.vue`.**
  - The board is a grid filling `calc(100dvh - <app nav height>)` with `overflow: hidden`, and the page shell becomes full width while it is present.
  - Move the turn-control wiring from `components/board/Initiative.vue` (Next, Prev, End encounter, Add) into `Bar.vue`, calling Task 3's functions.
- [ ] **Step 3: Smoke test.** Run `npm run dev:local`. As the GM at 1440×860:
  - the bar shows on one line and the page doesn't scroll;
  - Next turn, New round and End encounter work;
  - Table opens the admin dialog.

  At 1100px wide, the old Party tab renders.
- [ ] **Step 4: Commit.**
  - Run: `git add composables/useWideBoard.ts components/battle components/board/PartyView.vue components/board/Shell.vue assets/styles/_board-dock.scss`
  - Then: `git commit -m "feat(board): desktop battle frame and bar"`

### Task 7: Initiative strip

**Files:**
- Create: `components/battle/Initiative.vue`

**Interfaces:**
- Consumes: `init.order`, `init.activeId`, `init.summonsOf` and `roster`.
- Produces: `<BattleInitiative :init :roster :gm @hero="(characterId: string) => void" @select="(combatantId: string) => void" />`. `hero` fires for hero tokens; `select` fires for any token (the GM's stat block uses it).

- [ ] **Step 1: Implement the strip.** It is one row of tokens. Each token shows:
  - initiative, portrait or initials, and name;
  - HP: numbers for heroes and for the GM, `hp_band` text for players;
  - the minibar and action pips: hero pips come from roster `actionsSpent`, monster pips only when `actions_max !== null`;
  - condition chips: `conditions` for monsters, roster conditions for heroes; players see them too;
  - an "Acting" badge, and "Next" for the viewer's hero when it's up after the active one.

  The viewer's own token is outlined, and summons sit under their summoner as in `components/board/Initiative.vue`. The strip has `overflow-x: auto` and calls `scrollIntoView({ inline: 'center', block: 'nearest' })` on the active token when `activeId` changes.
- [ ] **Step 2: Smoke test.** With 12 combatants and one 60-character name added from the GM's add dialog, the strip stays one row and scrolls, and the active token is in view after Next turn.
- [ ] **Step 3: Commit.**
  - Run: `git add components/battle/Initiative.vue`
  - Then: `git commit -m "feat(board): one-row initiative strip"`

### Task 8: Player hero column and turn steps

**Files:**
- Create: `components/battle/Hero.vue`, `composables/useBoardTurnSteps.ts`
- Modify: `components/board/ActionPanelBody.vue` (use `useBoardTurnSteps`)

**Interfaces:**
- Produces: `useBoardTurnSteps(editor: SheetEditor, props: { characterId: string; turnCharacterId: Ref<string | null>; round: Ref<number | null>; downSummons: Ref<string[]> }): void`. It holds the two watchers moved verbatim from `ActionPanelBody.vue`: turn start, end and new round, and slaying downed summons with the chat post.
- Produces: `<BattleHero />`. It renders inside a `provideSheetEditor` scope created by `Board.vue` for the player's seated character, loaded the way `ActionPanel.vue` loads it.

- [ ] **Step 1: Extract the turn steps.** Move `ActionPanelBody.vue`'s watchers into `useBoardTurnSteps`, call it from `ActionPanelBody.vue`, and check that the mobile quick-action panel behaves as before (`npm run dev:local` at 1000px: End turn refills actions).
- [ ] **Step 2: Implement `Hero.vue`.** Top to bottom:
  - portrait, name and class line;
  - `NimbleHpBar` with an amount field, −, + and Crit; Wounds;
  - tiles for Armor, Speed, Init and Hit dice;
  - mana or the class resource (`sheetResource()`);
  - conditions (reuse the `SheetConditions` behaviour via `useSheet()`);
  - summons as compact rows with HP and a slain toggle (from `useNimbleSummons`);
  - stats with save ▲/▼;
  - Field rest and Safe rest.

  It is read-only when `!editor.canEdit`. `Board.vue` calls `useBoardTurnSteps` once.
- [ ] **Step 3: Smoke test.** As the Player at 1440×860:
  - dragging HP and typing an amount apply;
  - an added condition shows;
  - when the GM passes the turn to Iriel, her turn starts automatically, and ending it refills actions.
- [ ] **Step 4: Commit.**
  - Run: `git add components/battle/Hero.vue composables/useBoardTurnSteps.ts components/board/ActionPanelBody.vue`
  - Then: `git commit -m "feat(board): hero column with shared turn steps"`

### Task 9: Turn bar, action panel and tooltip

**Files:**
- Create: `components/battle/TurnBar.vue`, `components/battle/Actions.vue`, `components/battle/ActionTile.vue`, `components/ui/Tooltip.vue`

**Interfaces:**
- Consumes: Task 5 `useBattleActions()` and Task 4 `sectionsFor` / `readyNote`.
- Produces:
  - `<UiTooltip :text :title :sub :keys>` wraps a default-slot trigger. It shows on hover and focus, hides on Escape and blur, flips above when there is no room below, and is wired with `aria-describedby`.
  - `<BattleActionTile :action="BattleAction & { use }" />`.

- [ ] **Step 1: Implement `TurnBar.vue`.** It shows "Your turn" or "<name> is acting · you are next", action pips (click to spend or refund through the sheet's existing spend/refund), reaction status, the Rushed note, and the sheet's one step button (`components/nimble/SheetTurn.vue` logic: New encounter → Start turn → End turn → New round → End encounter).
- [ ] **Step 2: Implement `Actions.vue`.**
  - Filter chips: Ready now (with a count), All, Attacks, Spells, Reactions, Abilities. The default is `'ready'`, remembered per browser in `localStorage` (wrapped in try/catch).
  - A search box.
  - `sectionsFor(...)` drives the sections, with the `readyNote` line above Ready now.
  - Under the list, the last result and "posted to party chat".
- [ ] **Step 3: Implement `ActionTile.vue`.**
  - The tile shows an element dot, name, cost pips, mana, dice and detail; in non-ready filters it also shows `unavailable`.
  - A disabled tile has `aria-disabled`; a click goes through `guarded`.
  - Upcastable spells get a small popover with `NimbleUpcast`.
  - The tooltip carries `desc`, cost and the reason.
- [ ] **Step 4: Smoke test.** As Iriel:
  - with 1 action left, Arc Lightning, Ignite and Shatter leave Ready now and show "Needs 2 actions" (or the composable's equivalent) under All;
  - off-turn, only reactions and off-turn options remain;
  - casting Zap posts to party chat and updates the last result;
  - tooltips open on keyboard focus.
- [ ] **Step 5: Commit.**
  - Run: `git add components/battle/TurnBar.vue components/battle/Actions.vue components/battle/ActionTile.vue components/ui/Tooltip.vue`
  - Then: `git commit -m "feat(board): turn bar and Ready now action panel"`

### Task 10: Party cards, stats modal, and Chat / Lore tabs

**Files:**
- Create: `components/battle/PartyCards.vue`, `components/battle/HeroCardDialog.vue`, `components/battle/Comms.vue`

**Interfaces:**
- Consumes: `roster`, Task 1 `heroCard()`, `BoardChat` (`roster` prop) and `BoardLorePanelChat` (`drawer` prop: pass `false`).
- Produces:
  - `<BattlePartyCards :roster :gm @open="(characterId: string) => void" />`;
  - `<BattleHeroCardDialog v-model:character-id="string | null" />`;
  - `<BattleComms :roster />`.

- [ ] **Step 1: Implement `PartyCards.vue`.**
  - On the player board, cards list the other heroes; on the GM board, all of them.
  - Each card shows portrait or initials, name, an Acting tag, class and level, one status line (summons, Wounds or the first condition), the HP bar with numbers, and Armor.
  - The GM's cards add action pips and mana.
  - Cards are buttons with Enter and Space support.
- [ ] **Step 2: Implement `HeroCardDialog.vue`.**
  - It is a `UiDialog` that loads `heroCard`, with a loading state and an error message.
  - Its layout follows the spec: a side column, plus a main area with stats, skills, resources, summons and abilities.
  - HP controls appear for the GM and for the viewer's own hero; the GM's go through `init.adjustHp` on the hero's combatant.
  - Whisper opens a secret chat thread to that player.
  - Open full sheet shows for the GM and for the viewer's own hero.
  - Initiative hero tokens open it too.
- [ ] **Step 3: Implement `Comms.vue`.** It has two tabs, Chat and Lore Master. The Lore tab shows only when the Lore Master is available, using the same check `LorePanel.vue` uses.
- [ ] **Step 4: Smoke test.**
  - As the Player, clicking Marx's card shows a read-only modal, and Whisper opens a secret thread.
  - As the GM, the modal shows HP controls that change the roster.
  - Lore Master answers from the tab.
- [ ] **Step 5: Commit.**
  - Run: `git add components/battle/PartyCards.vue components/battle/HeroCardDialog.vue components/battle/Comms.vue`
  - Then: `git commit -m "feat(board): party cards, hero stats modal, chat and Lore tabs"`

### Task 11: GM encounter grid and stat block

**Files:**
- Create: `components/battle/Encounter.vue`, `components/battle/StatBlock.vue`, `components/battle/GmTurnBar.vue`

**Interfaces:**
- Consumes:
  - from Task 3: `adjustHp`, `rename`, `setConditions`, `setActions` and `nextTurn`;
  - `campaign_npcs.stat_block` (`traits`, `actions`, `bloodied`, `lastStand`, `{ n, t }` entries) for linked combatants;
  - `utils/dice.ts` to find the first dice expression in an action's text for its Roll button.
- Produces: `<BattleEncounter :init v-model:selected="string | null" />`, `<BattleStatBlock :init :combatant-id />` and `<BattleGmTurnBar :init />`.

- [ ] **Step 1: Implement `Encounter.vue`.**
  - Cards for enemies (`monster` | `npc`), with a chip to switch to allies and summons.
  - Each card has initials or portrait, name, a pencil that shows on hover and swaps in an input (Enter saves through `rename`, Escape cancels), initiative, the HP bar and numbers, −5 / −1 / amount / +1 / +5, Armor, conditions and action pips (a click spends or refunds through `setActions`).
  - Slain cards are greyed, with Remove and Revive (revive sets HP to 1).
  - Clicking a card selects it.
- [ ] **Step 2: Implement `StatBlock.vue`.**
  - The default selection is the acting creature, else the first enemy.
  - It shows the name editable in place, the HP bar with amount, −, + and Set, tiles for Armor, Speed, Init and Actions (`actions_max` editable), conditions with Add (the `CONDITION_ENDS` list names), then traits, actions with Roll buttons (rolls post to chat as `kind: 'action'`), bloodied and last stand entries, and GM notes.
  - With no linked stat block, it shows the numbers and notes only.
- [ ] **Step 3: Implement `GmTurnBar.vue`.** It shows "<name> is acting · Up next: …", "+ Add creatures" (today's add dialog from `PartyView.vue`, moved into its own component) and Next turn.
- [ ] **Step 4: Smoke test.** As the GM:
  - renaming "Goblin B" to "Snaggletooth" shows the new name on the player's strip;
  - −5 on a goblin changes the player's band;
  - spending a goblin pip then Next turn past it refills it;
  - New round refills no one;
  - a custom combatant with no stat block shows numbers only.
- [ ] **Step 5: Commit.**
  - Run: `git add components/battle/Encounter.vue components/battle/StatBlock.vue components/battle/GmTurnBar.vue components/board/PartyView.vue`
  - Then: `git commit -m "feat(board): GM encounter grid and stat block"`

### Task 12: Docs

**Files:**
- Modify: `CLAUDE.md` (Architecture: `components/battle/`, `useBattleActions`, `utils/battleActions.ts`, `useBoardTurnSteps`, `useWideBoard`, the new columns and RPC), `_features.md` (add and check off a "Desktop battle board" section)

- [ ] **Step 1: Write the entries.** Write the CLAUDE.md and `_features.md` entries, matching the existing style. `_features.md` has an unrelated uncommitted change; stage only the new section's hunk (`git add -p _features.md`).
- [ ] **Step 2: Commit.**
  - Run: `git add CLAUDE.md`, then `git add -p _features.md`
  - Then: `git commit -m "docs: desktop battle board"`

### Task 13: Verification

- [ ] **Step 1: Run the checks.**
  - Run: `nvm use 22.18.0 && npm run test && npm run type-check && npm run lint`.
  - Expected: all pass.
- [ ] **Step 2: Smoke test.** Run `npm run dev:local`, signed in as Player and as GM (two browsers), in each theme (Classic, Gothic, Eldritch, Cursed), at 1440×860, 1280×720 and 1200×800.
  - There is no page scroll, and panels scroll inside.
  - The turn button and HP are always visible.
  - Ready now changes as actions and mana are spent.
  - Tooltips open on hover and focus.
  - The hero modal opens from cards and tokens.
  - Chat and Lore tabs work.
  - GM rename, HP, conditions, pips, Next turn, New round and End encounter work.
  - At 1100px wide, the old Party tab and quick-action panel work.
  - The console has no errors and there are no failed requests.
- [ ] **Step 3: Run the `ui-ux-reviewer` agent** on both views; this is a major UI change. Fix what it finds that the spec supports.
