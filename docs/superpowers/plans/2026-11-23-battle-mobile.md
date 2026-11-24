# Battle Board on Phones and Tablets: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nimble Battle tab work on phones, tablets in portrait and landscape, and touch screens, while keeping the desktop board as built.

**Architecture:**
- One battle board with a layout per size.
- `useBoardLayout()` replaces `useWideBoard()` and reports `layout` (phone / tablet / tablet-wide / desktop) plus `touch`.
- `components/battle/View.vue` picks a frame from the layout:
  - the existing `Board` for desktop and tablet-wide;
  - a new `Tablet` frame with a drawer;
  - a new `Phone` frame with a tab bar.
- All three frames reuse the existing panels (`Actions`, `Hero*`, `TurnBar`, `GmTurnBar`, `Encounter`, `StatBlock`, `PartyCards`, `Comms`, `Initiative`). Those panels learn a touch mode and a compact mode.
- Pure decisions go in `utils/boardLayout.ts` and `utils/battleActions.ts` so Vitest covers them: classifying the layout, detecting the keyboard, choosing tabs, labelling the Use button, and the long-press state.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Nuxt 3 SPA, Pinia, SCSS with theme variables, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-battle-mobile-design.md`. Read it before each task, together with the mockup `docs/superpowers/specs/2026-11-23-battle-mobile-mockup.html`.

## Global Constraints

- Work on branch `feat/battle-mobile`; PRs target `stage`. Commit only when a task says so.
- Prettier: 2 spaces, no semicolons, single quotes, width 100. Run `nvm use 22.18.0` before `npm run lint`.
- `noUncheckedIndexedAccess` is on: guard index access.
- No UI library. Use theme variables only (all four themes), and never rule-book art.
- Breakpoints (from `min-width` queries):
  - phone < 768px;
  - tablet 768–1023px;
  - tablet-wide 1024–1199px;
  - desktop ≥ 1200px.
- Touch: `(hover: none) and (pointer: coarse)`, independent of width.
- Touch targets ≥ 44×44px, with at least 8px between one-tap spend buttons on touch.
- Phone frame: `100dvh`, `env(safe-area-inset-*)`; the page never scrolls, only panels do.
- Long-press: 500ms, cancelled when the finger moves more than 8px.
- Keyboard open: `visualViewport.height` is more than 150px below `window.innerHeight`.
- The phone result bar fades after 6 seconds. With Manual dice (`sheet.ownDice`) it stays until dismissed or the turn changes.
- Fixed widths:
  - tablet portrait: left column 290px, drawer 360px;
  - tablet-wide: left 270px, right 290px.
- Phone tabs:
  - player: Actions, Hero, Party, Chat, plus Scribe when available;
  - GM: Encounter, Creature, Party, Chat (Scribe inside Chat);
  - watcher: Party, Chat, plus Scribe when available.
- Default phone tabs: Actions for a player, Encounter for the GM, Party for a watcher. Remember the tab per browser, inside try/catch.
- The desktop at ≥ 1200px with a mouse must look and behave exactly as before.
- Nimble actions rule: actions refill at the end of a creature's own turn, and New round refills no one. Nothing in this plan changes turn logic.

## Review Focus

Spec-implied cases that no task's main tests cover. Each line's test lives in the task named in brackets.

1. **Rotating a tablet mid-turn** (portrait ↔ landscape) swaps frames. The hero's sheet editor must not lose unsaved edits or fire turn steps twice. The fix is that `HeroScope` sits above the frame switch. [Task 5: smoke step]
2. **A tile that becomes unavailable while its details sheet is open** (initiative passed, mana spent elsewhere). The Use button must turn disabled with the reason, never fire. [Task 3: `tileButton` test with `unavailable` set]
3. **A watcher whose saved tab is Actions** (they unseated their hero) must fall back to Party, not a blank tab. [Task 4: `pickTab` test]
4. **Chat input focused on a short phone.** The turn bar hides and the input stays above the keyboard. [Task 2: `keyboardOpen` tests; Task 5: smoke step]
5. **A long-press that turns into a sideways scroll of the initiative strip** must not open the token menu. [Task 2: long-press `move` test]

---

### Task 1: `useBoardLayout` replaces `useWideBoard`; Battle lands at every size

**Files:**
- Create: `utils/boardLayout.ts`, `composables/useBoardLayout.ts`, `tests/boardLayout.test.ts`
- Modify: `components/battle/View.vue`, `components/board/Shell.vue`, `pages/campaigns/[id]/board/index.vue`, `pages/campaigns/[id]/gm/index.vue`
- Delete: `composables/useWideBoard.ts`

**Interfaces:**
- Produces, from `utils/boardLayout.ts`:
  - `export type BoardLayout = 'phone' | 'tablet' | 'tablet-wide' | 'desktop'`
  - `export function classifyLayout(width: number): BoardLayout`
- Produces, from `composables/useBoardLayout.ts`:
  - `export function useBoardLayout(): { layout: ComputedRef<BoardLayout>; touch: ComputedRef<boolean>; battle: ComputedRef<boolean> }`
  - `battle` is true for a Nimble campaign.
  - It keeps `useWideBoard`'s user counting: one listener per query shared by all callers, removed when the last scope is disposed. During SSR or without `matchMedia` it reports `desktop` and `touch = false`.

- [ ] **Step 1: Write the failing test** `tests/boardLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyLayout } from '~/utils/boardLayout'

describe('classifyLayout', () => {
  it.each([
    [360, 'phone'], [767, 'phone'], [768, 'tablet'], [1023, 'tablet'],
    [1024, 'tablet-wide'], [1199, 'tablet-wide'], [1200, 'desktop'], [1920, 'desktop'],
  ])('%i → %s', (w, expected) => expect(classifyLayout(w)).toBe(expected))
})
```

- [ ] **Step 2: Run it and check it fails.** `npx vitest run tests/boardLayout.test.ts` should fail because the module is not found.
- [ ] **Step 3: Implement `classifyLayout` and `useBoardLayout`.**
  - Use three `min-width` queries (768, 1024, 1200) plus the touch query.
  - Derive `layout` from which queries match. This matches `classifyLayout`; use `classifyLayout(window.innerWidth)` only for the first read.
- [ ] **Step 4: Move the callers over.**
  - `Shell.vue`: `battle = useBoardLayout().battle.value && isCurrent('battle')`.
  - Both index pages route to `battle` whenever `battle.value` is true, else to `party`.
  - `View.vue`:
    - drop the "needs a window at least 1200px wide" branch;
    - keep the non-Nimble note and its "Go to Party" link;
    - for now, render `BattleBoard` for every layout (Tasks 5–7 add the other frames).
  - Delete `useWideBoard.ts` and update the comments that name it.
- [ ] **Step 5: Run checks.** `npx vitest run tests/boardLayout.test.ts` passes; `npm run type-check` reports no errors.
- [ ] **Step 6: Commit.** `git commit -m "FEAT: useBoardLayout replaces useWideBoard; Battle lands at every size"`

### Task 2: Touch helpers (keyboard detection, long-press, tap tooltips, no splitters)

**Files:**
- Modify: `utils/boardLayout.ts`, `tests/boardLayout.test.ts`, `components/ui/Tooltip.vue`, `components/battle/Initiative.vue`, `components/battle/Board.vue`
- Create: `composables/useLongPress.ts`, `composables/useKeyboardOpen.ts`

**Interfaces:**
- Produces, from `utils/boardLayout.ts`:
  - `export function keyboardOpen(innerHeight: number, viewportHeight: number): boolean`. It is true when `innerHeight - viewportHeight > 150`.
  - `export type PressEvent = { type: 'down'; x: number; y: number; t: number } | { type: 'move'; x: number; y: number; t: number } | { type: 'up' | 'cancel'; t: number }`
  - `export function longPress(events: PressEvent[]): boolean`. It is true when a `down` was held 500ms or more without moving more than 8px (Euclidean) before `up`. A `cancel`, or `up` before 500ms, gives false.
- Produces, from `composables/useLongPress.ts`:
  - `useLongPress(onPress: (el: HTMLElement) => void): { onPointerdown, onPointermove, onPointerup, onPointercancel }`
  - It is a timer-driven wrapper over the same rule. It calls `preventDefault` on the following `contextmenu`, and suppresses the click that follows a long-press.
- Produces, from `composables/useKeyboardOpen.ts`:
  - `useKeyboardOpen(): Ref<boolean>`. It listens to `visualViewport` `resize`.

- [ ] **Step 1: Write the failing tests** (append to `tests/boardLayout.test.ts`):

```ts
describe('keyboardOpen', () => {
  it('150px is not open', () => expect(keyboardOpen(800, 650)).toBe(false))
  it('151px is open', () => expect(keyboardOpen(800, 649)).toBe(true))
})
describe('longPress', () => {
  const down = { type: 'down', x: 10, y: 10, t: 0 } as const
  it('held 500ms fires', () => expect(longPress([down, { type: 'up', t: 500 }])).toBe(true))
  it('released at 499ms does not', () => expect(longPress([down, { type: 'up', t: 499 }])).toBe(false))
  it('moving 8px still fires', () =>
    expect(longPress([down, { type: 'move', x: 18, y: 10, t: 100 }, { type: 'up', t: 600 }])).toBe(true))
  it('a sideways scroll (9px) cancels', () =>
    expect(longPress([down, { type: 'move', x: 19, y: 10, t: 100 }, { type: 'up', t: 600 }])).toBe(false))
  it('cancel cancels', () => expect(longPress([down, { type: 'cancel', t: 600 }])).toBe(false))
})
```

- [ ] **Step 2: Run them and check they fail.** `npx vitest run tests/boardLayout.test.ts` should report `keyboardOpen` / `longPress` as not exported.
- [ ] **Step 3: Implement `keyboardOpen`, `longPress`, `useLongPress` and `useKeyboardOpen`.**
- [ ] **Step 4: Wire the helpers in.**
  - `Initiative.vue`: on touch (`useBoardLayout().touch`), tokens bind `useLongPress`. The press calls the same path as `onContextMenu(slot, e)`, which still returns early for players.
  - `UiTooltip`: on touch, a tap on the trigger toggles the tooltip and a `pointerdown` outside closes it. Hover stays for mouse.
  - `Board.vue`: when `touch`, render no `BattleSplitter` and no `RightRail`. Both columns stay open at their saved widths.
- [ ] **Step 5: Run checks.** `npx vitest run tests/boardLayout.test.ts` passes.
- [ ] **Step 6: Commit.** `git commit -m "FEAT: touch helpers: long-press token menu, tap tooltips, no splitters on touch"`

### Task 3: Details first: the action details sheet or popover with a Use button

**Files:**
- Modify: `utils/battleActions.ts`, `tests/battleActions.test.ts`, `components/battle/ActionTile.vue`
- Create: `components/battle/ActionDetails.vue`

**Interfaces:**
- Consumes `BattleTile` (`composables/useBattleActions.ts`): `name`, `kind`, `tier`, `school`, `detail`, `dice`, `actions`, `mana`, `desc`, `unavailable`, `choices`, `upcast`, and `guarded(tile)`.
- Produces, from `utils/battleActions.ts`:
  - `export function tileButton(tile: BattleTile): { label: string; disabled: boolean; reason: string }`
  - The label's verb depends on the kind: spell → `Cast`, weapon → `Attack with`, reaction → `React:`, summon → `Command`, ability → `Use`.
  - The dice are appended as ` · <dice>` when present.
  - `disabled = tile.unavailable !== ''`, and `reason = tile.unavailable`.
- Produces `components/battle/ActionDetails.vue`:
  - props `{ action: BattleTile; anchor: HTMLElement | null; mode: 'sheet' | 'popover'; readonly?: boolean }`, with `v-model` for open.
  - `sheet` uses `UiDialog` with `sheet` (it already slides up on phones and handles Escape, focus and the backdrop) plus swipe-down to close. `popover` uses `BattleActionPop`.

- [ ] **Step 1: Write the failing tests** in `tests/battleActions.test.ts` (build tiles with the file's existing tile helper, or a minimal `BattleTile` literal):

```ts
describe('tileButton', () => {
  it('names a spell cast with its dice', () =>
    expect(tileButton(tile({ kind: 'spell', name: 'Arc Lightning', dice: '3d8' })).label)
      .toBe('Cast Arc Lightning · 3d8'))
  it('weapon', () => expect(tileButton(tile({ kind: 'weapon', name: 'Staff', dice: '1d6' })).label)
    .toBe('Attack with Staff · 1d6'))
  it('no dice, no dot', () => expect(tileButton(tile({ kind: 'ability', name: 'Dash', dice: '' })).label)
    .toBe('Use Dash'))
  it('unavailable disables with the reason', () =>
    expect(tileButton(tile({ kind: 'spell', name: 'Fire', unavailable: 'Not your turn' })))
      .toMatchObject({ disabled: true, reason: 'Not your turn' }))
})
```

- [ ] **Step 2: Run them and check they fail.** `npx vitest run tests/battleActions.test.ts`
- [ ] **Step 3: Implement `tileButton`.**
- [ ] **Step 4: Build `ActionDetails.vue`.** It shows, in order:
  1. the name;
  2. the `sub` line (kind or tier · school · detail), as built in `ActionTile`;
  3. a cost row (dice, actions, mana);
  4. `desc`;
  5. the reason, when unavailable;
  6. the choices list when `choices` is set (same items and `use` calls as `BattleActionPicker`), otherwise `NimbleUpcast` when `upcast` is set;
  7. the Use button (from `tileButton`, disabled when `readonly`), which calls `guarded(action)` and closes;
  8. under it, the odds line from the tile's existing data and "Posts to party chat".

  It reads the tile reactively, so a tile that becomes unavailable while open disables the button.
- [ ] **Step 5: Change `ActionTile.vue`.**
  - When `useBoardLayout().touch` is true, the tile's click opens `ActionDetails`: `mode = 'sheet'` on phone, `'popover'` otherwise. It never calls `guarded` or opens the picker directly. On touch, the tooltip, the `T{n}` upcast button and the picker are not rendered (the details hold them).
  - Mouse behaviour is unchanged.
  - Tooltip keys read "Tap for details" on touch.
- [ ] **Step 6: Run checks.** `npx vitest run tests/battleActions.test.ts` passes; `npm run type-check` reports no errors.
- [ ] **Step 7: Commit.** `git commit -m "FEAT: details-first action tiles on touch (sheet on phones, popover elsewhere)"`

### Task 4: Phone tab model

**Files:**
- Modify: `utils/boardLayout.ts`, `tests/boardLayout.test.ts`
- Create: `composables/usePhoneTab.ts`

**Interfaces:**
- Produces, from `utils/boardLayout.ts`:
  - `export type PhoneRole = 'player' | 'gm' | 'watcher'`
  - `export type PhoneTab = 'actions' | 'hero' | 'party' | 'chat' | 'scribe' | 'encounter' | 'creature'`
  - `export function phoneRole(o: { gmControls: boolean; hero: boolean }): PhoneRole`. `gmControls` gives `gm`; otherwise `hero` gives `player`; otherwise `watcher`.
  - `export function phoneTabs(role: PhoneRole, scribe: boolean): PhoneTab[]`
  - `export function pickTab(role: PhoneRole, scribe: boolean, saved: string | null): PhoneTab`. It returns `saved` if that tab is in `phoneTabs(role, scribe)`; otherwise the role's default (actions / encounter / party).
- Produces, from `composables/usePhoneTab.ts`:
  - `usePhoneTab(role: Ref<PhoneRole>, scribe: Ref<boolean>): Ref<PhoneTab>`. It is stored per browser under `lantern-battle-phone-tab`, inside try/catch.

- [ ] **Step 1: Write the failing tests:**

```ts
describe('phone tabs', () => {
  it('player with Scribe', () => expect(phoneTabs('player', true)).toEqual(['actions', 'hero', 'party', 'chat', 'scribe']))
  it('player without Scribe', () => expect(phoneTabs('player', false)).toEqual(['actions', 'hero', 'party', 'chat']))
  it('gm never gets a Scribe tab', () => expect(phoneTabs('gm', true)).toEqual(['encounter', 'creature', 'party', 'chat']))
  it('watcher', () => expect(phoneTabs('watcher', true)).toEqual(['party', 'chat', 'scribe']))
  it('watcher with a stale Actions tab falls back to Party', () => expect(pickTab('watcher', true, 'actions')).toBe('party'))
  it('keeps a valid saved tab', () => expect(pickTab('player', true, 'chat')).toBe('chat'))
  it('scribe saved but unavailable → default', () => expect(pickTab('player', false, 'scribe')).toBe('actions'))
  it('role', () => expect(phoneRole({ gmControls: false, hero: false })).toBe('watcher'))
})
```

- [ ] **Step 2: Run them and check they fail.** `npx vitest run tests/boardLayout.test.ts`
- [ ] **Step 3: Implement the functions and `usePhoneTab`.**
- [ ] **Step 4: Run checks.** The tests pass.
- [ ] **Step 5: Commit.** `git commit -m "FEAT: phone tab model for player, GM and watcher"`

### Task 5: Phone frame (player and watcher)

**Files:**
- Create: `components/battle/Phone.vue`, `components/battle/PhoneBar.vue`, `components/battle/PhoneTabs.vue`, `components/battle/HeroStrip.vue`, `components/battle/ResultBar.vue`
- Modify:
  - `components/battle/View.vue`;
  - `layouts/default.vue`;
  - compact variants: `components/battle/Initiative.vue`, `TurnBar.vue`, `Actions.vue`, `PartyCards.vue`, `HeroCardDialog.vue`, `Comms.vue`;
  - `components/battle/Hero.vue`, `HeroSummons.vue`.

**Interfaces:**
- Consumes `usePhoneTab`, `phoneRole`, `useKeyboardOpen`, `useBoardLayout`, `useLoreAvailable`, `BattleHeroScope`, and `useBattleActions().lastResult / lastDetail`.
- Produces `Phone.vue`:
  - the same props as `Board.vue` (`init`, `turnCharacterId`, `round`, `downSummons`);
  - slots `strip`, `tab` (`{ tab: PhoneTab; hero: boolean }`), `turn` (`{ hero: boolean }`) and `dialogs` (`{ hero: boolean }`);
  - everything is wrapped in `BattleHeroScope`, so the hero's sheet editor wraps every tab.
- Shared components gain `compact?: boolean`, passed by the phone and tablet frames. This is the single rule for how shared components learn their layout: **a `compact` prop**, never reading `useBoardLayout()` themselves. The one exception is touch, which components read from `useBoardLayout().touch`.

- [ ] **Step 1: Build `Phone.vue`.** Its rows, top to bottom:
  1. `PhoneBar`, 52px;
  2. the strip slot;
  3. `HeroStrip` (player, on every tab except Hero);
  4. the scrolling content (`tab` slot);
  5. `ResultBar`;
  6. the `turn` slot, hidden when `useKeyboardOpen()` is true or the tab is chat or scribe;
  7. `PhoneTabs`, 62px plus `env(safe-area-inset-bottom)`.

  It is `height: 100dvh; overflow: hidden`.
- [ ] **Step 2: Build `PhoneBar`.**
  - The campaign ▾ menu holds:
    - Battle, Party (classic), Journal, Maps (from `useBoardNav().tabs`);
    - the campaign switcher and Playing as (move them out of `Bar.vue` into a shared `components/battle/CampaignMenu.vue` and use it in both);
    - Dashboard and Characters;
    - Settings, Manual dice and Sign out (move the `toggleOwnDice` / `signOut` logic from `layouts/default.vue` into `composables/useAccountMenu.ts` and use it in both);
    - "Open GM console" for a GM on `/board`.
  - Then the round chip.
  - Then, for players, the sheet icon link (`/character/:id?campaign=:id`).
- [ ] **Step 3: Build `PhoneTabs`.** It renders `phoneTabs(role, scribe)` with icons and labels at 44px or more. Chat shows the unread badge from the same count `Comms` uses: expose it from `useCommsTab` or `useChat` instead of computing it twice.
- [ ] **Step 4: Build `HeroStrip`.** It shows the portrait (or the dead portrait), the name, an HP bar with temp HP, the first two conditions as chips, and Armor and mana (or the class resource) tiles. It reads from `useNimbleVitals` and `useNimbleConditions`. A tap emits `go-hero`.
- [ ] **Step 5: Build `ResultBar`.**
  - It shows `lastResult`, plus `lastDetail` in its title. It is pinned above the turn bar.
  - It hides 6 seconds after a new result, or on tap.
  - When the sheet's `ownDice` is set, it stays until tapped or until `init.turnId` changes.
  - In compact mode, `Actions.vue` keeps its inline result as well.
  - The board has no "It crit" control at any size today. Do not add one here: the bar carries what `Actions` shows.
- [ ] **Step 6: Compact variants.**
  - `Initiative`: 38px tokens, acting 48px.
  - `TurnBar`: one row.
  - `Actions`: two tiles per row, filter chips that scroll sideways.
  - `PartyCards`: full-width cards; a tap opens `HeroCardDialog` with `sheet`.
  - `Comms`: full height, input above the tab bar.
  - `Hero`, `HeroSummons`: on touch, targets ≥ 44px with an 8px gap.
- [ ] **Step 7: Wire up `View.vue`.**
  - When `layout === 'phone'`, render `BattlePhone`:
    - actions → `BattleActions compact`;
    - hero → the hero column's components;
    - party → `BattlePartyCards compact` plus an Enemies list from `init.order` (players see name, conditions, Down / Slain; HP only when `gmControls`);
    - chat / scribe → `BattleComms` fixed to that tab.
  - Watchers get no hero strip and no turn bar.
  - `HeroCardDialog` goes in `dialogs`.
- [ ] **Step 8: App nav.** `layouts/default.vue` does not render `.topbar` when `useBoardLayout().layout.value === 'phone'` and the route ends in `/battle`. Add a skip-link target inside `Phone`.
- [ ] **Step 9: Smoke test.**
  - Run `npm run dev:local` and sign in as Player (Iriel). Emulate 375×812 and 360×640 with touch.
  - Check the default tab is Actions, and that a tap opens the sheet and Use posts to chat.
  - Check every tab, and that the turn bar hides while typing in Chat.
  - Check the result bar fades, and that with Manual dice on it stays.
  - Check the page never scrolls.
  - Sign in as `bram@test.local` with the hero unseated, and check the watcher tabs.
  - Read the console and failed requests, and fix anything the app causes.
- [ ] **Step 10: Run checks.** `npm run test`, `npm run type-check` and `npm run lint` all pass.
- [ ] **Step 11: Commit.** `git commit -m "FEAT: phone battle board for players and watchers"`

### Task 6: Phone frame (GM)

**Files:**
- Modify: `components/battle/View.vue`, `components/battle/GmTurnBar.vue`, `components/battle/Encounter.vue`, `components/battle/EncounterCard.vue`, `components/battle/PhoneBar.vue`

**Interfaces:**
- Consumes `Phone.vue` slots, `usePhoneTab` with role `gm`, View's `gmShow` / `gmSelected` / `gmHeroId`, and `useSnackbarStore().show(message, { action })` (already used by the token menu's Undo).

- [ ] **Step 1: Encounter tab.**
  - Show `BattleEncounter compact`: one column of cards, each with −5 / −1 / amount / +1 / +5. Add the ±5 buttons if the card lacks them, using the existing HP setter. Keep rename, pips and conditions on each card.
  - Add an "Allies & summons" chip and "+ Add" (`components/board/AddCombatants.vue`).
- [ ] **Step 2: Chat tab and Creature tab.** The GM's Chat tab shows `BattleComms` with its own Chat / Scribe tabs (Scribe when available). Creature tab: Show `BattleGmHero` when `gmHeroId` is set, otherwise `BattleStatBlock` for `gmSelected`.
- [ ] **Step 3: Selection.**
  - On the GM's phone, `gmShow(id)` does not open a left column (there is none).
  - When the tab isn't `creature`, it shows a snackbar "Selected: <name>" whose action switches to Creature.
  - Token taps call `onToken`, as on desktop.
- [ ] **Step 4: Bars.**
  - `GmTurnBar compact`: the acting creature, Up next, New round and Next ▶ in one row.
  - `PhoneBar` for the GM: the ▾ menu adds Table, and a ⋯ menu holds End encounter (with its existing confirm) and the initiative-mode toggle, both moved from `Bar.vue` into reusable pieces.
- [ ] **Step 5: Smoke test.** Sign in as GM at 390×844 with touch. Change HP by ±5, rename, set pips, long-press a token for its menu, Next and New round. Check New round refills no one. Check the Selected toast. Check the console.
- [ ] **Step 6: Run checks.** `npm run test`, `npm run type-check` and `npm run lint` all pass.
- [ ] **Step 7: Commit.** `git commit -m "FEAT: phone battle board for the GM"`

### Task 7: Tablet portrait frame with drawer

**Files:**
- Create: `components/battle/Tablet.vue`, `components/battle/Drawer.vue`
- Modify: `components/battle/View.vue`, `components/battle/Bar.vue`, `composables/useBattleRight.ts`, `components/battle/HeroCardDialog.vue`

**Interfaces:**
- Produces, from `useBattleRight`: `drawer: Ref<null | 'party' | 'chat' | 'scribe'>` and `openDrawer(tab)`. `showChat()` opens the drawer on `chat` when the layout is tablet, so Whisper keeps working.
- Produces `Tablet.vue`: the same props as `Board.vue`, with slots `strip`, `left`, `centre` and `drawer` (`{ tab }`), the first two receiving `{ hero }`. The left column is 290px and the centre flexible.
- Produces `Drawer.vue`: 360px from the right, built on `<dialog>` (modal: Escape, backdrop tap, ✕ and focus return), respecting `prefers-reduced-motion`.

- [ ] **Step 1: Build `Tablet.vue` and `Drawer.vue`.**
- [ ] **Step 2: Add the `Bar.vue` tablet variant** (prop `variant: 'desktop' | 'tablet'`).
  - Tabs: Battle, Journal and Maps. Party (classic) moves into the campaign menu.
  - Then the round chip, and icon buttons for Party, Chat (with unread badge) and Scribe (when available), which call `openDrawer`.
  - Sheet ↗ for players.
- [ ] **Step 3: Wire up `View.vue`.** When `layout === 'tablet'`:
  - left: `BattleHero` for players, or the GM's stat block / `GmHero`;
  - centre: the turn bar and `Actions compact` (two per row), or the GM turn bar and encounter grid;
  - drawer: `PartyCards` / `Comms`.
- [ ] **Step 4: Smoke test.** Check 768×1024 with touch, as Player and GM. Check tapping a tile opens the popover with Use. Check the drawer opens and closes all three ways. Check Whisper from the stats dialog opens the drawer on Chat. Rotate to 1024×768 and back mid-turn: edits stay, and the turn steps don't run twice.
- [ ] **Step 5: Run checks.** `npm run test`, `npm run type-check` and `npm run lint` all pass.
- [ ] **Step 6: Commit.** `git commit -m "FEAT: tablet portrait battle board with party and chat drawer"`

### Task 8: Tablet landscape (tablet-wide)

**Files:**
- Modify: `components/battle/Board.vue`, `components/battle/Actions.vue`, `composables/useBattleLeft.ts`, `composables/useBattleRight.ts`

**Interfaces:**
- Consumes `useBoardLayout().layout` and `touch`.

- [ ] **Step 1: Widths.**
  - When `layout === 'tablet-wide'`, `Board` uses left 270px and right 290px as its defaults.
  - With a mouse, the drag minimums drop so the centre keeps at least 400px (instead of `CENTRE_MIN = 460`). Keep `CENTRE_MIN` for desktop.
  - With touch, Task 2 has already removed the splitters, and the fixed widths apply.
- [ ] **Step 2: Tiles.** `Actions` shows three tiles per row at tablet-wide (`grid-template-columns: repeat(3, minmax(0, 1fr))`).
- [ ] **Step 3: Smoke test.**
  - Check 1024×768 and 1180×820, with mouse and with touch.
  - Check 1440×860 with a mouse is pixel-for-pixel as before: compare against a screenshot taken on `stage` before this branch.
- [ ] **Step 4: Run checks.** `npm run test`, `npm run type-check` and `npm run lint` all pass.
- [ ] **Step 5: Commit.** `git commit -m "FEAT: tablet landscape layout of the battle board"`

### Task 9: "Party (classic)", docs and the full sweep

**Files:**
- Modify: `composables/useBoardNav.ts`, `CLAUDE.md`, `_features.md` (if it lists this work)

**Interfaces:**
- Consumes `BoardTab` in `useBoardNav.ts`.

- [ ] **Step 1: Label.** When the campaign has a Battle tab (Nimble), the `party` tab's label is `Party (classic)`. Non-Nimble campaigns keep `Party`.
- [ ] **Step 2: CLAUDE.md.**
  - Replace `useWideBoard` with `useBoardLayout`.
  - Describe the Phone and Tablet frames, `ActionDetails`, `useLongPress`, `useKeyboardOpen`, the phone roles and tabs, the `compact` prop rule, and the hidden app nav on phone Battle.
  - Remove "narrower windows get a note pointing to Party".
- [ ] **Step 3: Full sweep.**
  - Sizes: 375×812, 390×844, 768×1024, 1024×768, 1180×820 and 1440×860.
  - Accounts: Player and GM. Themes: all four.
  - Use touch emulation for the touch cases.
  - Read the console and failed requests, and fix what the app causes.
- [ ] **Step 4: Run checks.** `npm run test`, `npm run type-check` and `npm run lint` all pass.
- [ ] **Step 5: Commit.** `git commit -m "DOC: battle board on phones and tablets; Party (classic) label"`
