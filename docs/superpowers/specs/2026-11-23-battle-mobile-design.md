# Battle board on phones and tablets: design

Date: 2026-11-23 · Branch: `feat/battle-mobile` · Mockup: [`2026-11-23-battle-mobile-mockup.html`](2026-11-23-battle-mobile-mockup.html) (open it in a browser and use the switch at the top) · Builds on: [`2026-11-19-desktop-battle-board-design.md`](2026-11-19-desktop-battle-board-design.md)

## Intent

The Battle tab is the desktop battle board for Nimble campaigns at 1200px and wider. Narrower windows get only a note pointing them to the Party tab, which is the old stacked layout. The owner plans to redo or scrap the Party tab later and use the Battle board for actual play. So the Battle board needs to work on phones and tablets.

It keeps the desktop's priority: **actions and spells first** ("Ready now"). The owner's group plays in person, with phones and tablets at the table. Remote play must also be possible, so chat, the party and the Scribe must be fully usable on small screens. GMs will rarely use a phone or tablet, but they must be able to run a fight on one.

## Goals

- A Nimble campaign's Battle tab works on phones (from 360px wide), tablets in portrait and landscape, and desktop. The desktop layout itself stays as built.
- On a phone, the default screen is Ready now. Initiative, your vitals and the turn bar stay visible without scrolling. Panels scroll inside; the page does not.
- Everything the desktop board lets a player do is possible on a phone: actions, the hero's controls, party stats, chat, the Scribe and the stats modal. The same goes for the GM: turn controls, encounter HP, rename, pips, conditions, stat blocks and adding creatures.
- Touch screens never depend on hover, right-click or drag handles, whatever their width.

## Non-goals

- Redesigning or removing the Party tab. That comes later, and the Party tab stays reachable.
- Changing rules, turn steps or what Ready now contains.
- D&D 5e and Pathfinder 2e campaigns.
- Native apps or offline play.

## Anti-goals (a failure even if it technically works)

- A stray tap that casts a spell or spends a resource. On touch, a tile opens its details first.
- Phone and desktop disagreeing about what an action does or whether it's ready, which happens if the logic gets duplicated.
- The page itself scrolling on a phone, so the turn bar or tab bar slides out of reach.
- The on-screen keyboard covering the chat input or leaving the turn bar floating mid-screen.
- Any change to the desktop experience at 1200px and wider on a mouse.

## Constraints

- Same stack and rules as the desktop spec: Vue 3 + Nuxt 3 SPA, `<script setup lang="ts">`, SCSS with theme variables, no UI library, all four themes, `noUncheckedIndexedAccess`, Prettier, never rule-book art.
- Reuse the existing pieces in `components/battle/` and their composables:
  - `useBattleActions`, `useBoardTurnSteps`, `useTurnSteps` and `useBoardSheetEditor`;
  - `HeroScope` / `HeroEditor`;
  - `useInitiative`, `useHeroCard`, `useCommsTab` and `useLoreAvailable`.
- Touch targets are at least 44×44px. Respect `env(safe-area-inset-*)` on notched phones. Use `100dvh` so mobile browser bars don't cause scrolling.
- Smoke-test on `npm run dev:local` with the seeded accounts, using the browser's phone and tablet emulation as well as desktop.

## Approaches considered

1. **One battle board with a layout per size (chosen).** `useBoardLayout()` replaces `useWideBoard` and reports the size class plus whether the screen is touch. Phones get a new mobile frame (tab bar, bottom sheet, hero strip) and tablets a drawer. Both reuse the existing components, which learn to switch from hover to tap where touch needs it. Phone and desktop can't drift apart. The cost is layout-aware props on some shared components, and checking more than one size per change.
2. **A separate mobile component tree** (`components/battle-mobile/`) sharing only the composables. It gives full freedom, but about thirty components get duplicated as templates, every new feature gets built twice, and the two drift apart.
3. **Reflow the desktop board with CSS only.** It's cheapest, but it can't give phones a tab bar, bottom sheets or a turn bar that hides while typing. Hover, right-click and drag handles would stay broken on touch.

The owner picked approach 1.

## Design

### Layout classes and touch

`composables/useBoardLayout.ts` replaces `useWideBoard`. Every caller moves to it: `components/battle/View.vue`, `components/board/Shell.vue`, and `pages/campaigns/[id]/board/index.vue` and `gm/index.vue`. It returns:

- `layout: ComputedRef<'phone' | 'tablet' | 'tablet-wide' | 'desktop'>`, from `min-width` media queries:
  - phone below 768px;
  - tablet 768–1023px;
  - tablet-wide 1024–1199px;
  - desktop 1200px and up.
- `touch: ComputedRef<boolean>`, from `(hover: none) and (pointer: coarse)`. It is independent of width.
- `battle: ComputedRef<boolean>`: true for any Nimble campaign (the Battle tab now exists at every size).

It keeps `useWideBoard`'s single shared listener and adds one listener per query.

The **Battle tab is the landing tab for Nimble campaigns at every size.** The "needs a window at least 1200px wide" note is removed. Party, Journal and Maps stay reachable. On phones they are in the top bar's ▾ menu. On tablet portrait, Journal and Maps are tabs and Party is in the ▾ menu. On tablet landscape and desktop, all three are tabs. Non-Nimble campaigns are unchanged.

To avoid two things called "Party", the old board section is labelled **"Party (classic)"** wherever it appears beside the battle board's party cards. The phone Party tab and the tablet Party drawer both mean the battle board's party cards.

### Touch behaviour (any width, when `touch` is true)

- **Action tiles:**
  - A tap opens the tile's details; the action is never used straight away.
  - On a phone the details are a bottom sheet; on tablets and touch desktops, a popover anchored to the tile.
  - The details show the name, school, tier and range line, plus damage, action and mana costs. Below that come the full rules text and the reason the action is unavailable, if any.
  - Tiles with choices (Opportunity Attack, Help, Spellshaper) show their picker inside the details.
  - Upcasting shows a stepper.
  - One large button uses the action, labelled with what it does, e.g. "Cast Arc Lightning · 3d8". It is disabled with the reason when the action is unavailable.
  - Under the button: odds such as "+1 disadvantage (Rushed)" and "posts to party chat".
  - The sheet closes on swipe down, a tap outside, or Escape, and after a successful use.
  - On mouse desktops, tiles keep today's behaviour: click to use, tooltip on hover.
  - **Scope:** details first applies to the Ready now tiles only. Other controls that spend something stay one tap, as on desktop:
    - Hero tab: summon command and attack buttons, Trigger buttons, counters;
    - the GM's stat-block Roll buttons.

    On touch, these get 44px targets with at least 8px between them. Rests already ask for confirmation.
- **Results on phones:**
  - After a use, the result shows as a bar pinned just above the turn bar, so it isn't lost below the scroll.
  - A normal roll's bar fades after 6 seconds and can be tapped to dismiss.
  - With Manual dice, the bar stays until it's dismissed or the turn changes. It carries the roll prompt and the "It crit" button (`useCritReady`).
  - The result list under Ready now stays as well.
- **Tooltips** (initiative tokens, party cards, odds): a tap toggles them, and they close on an outside tap.
- **GM token menu:** a long-press (500ms, cancelled if the finger moves more than 8px) opens `TokenMenu`, as right-click does on desktop.
- **Splitters:** these are the drag handles that resize the side columns. Touch layouts don't show them. Side columns use fixed widths, or become drawers on tablet.
- **HP bars:** `NimbleHpBar` already supports drag. It also keeps the amount field with − and +.

### Phone (below 768px)

**The app's own nav is hidden on the phone battle board.** Below 720px it wraps to about 100px, which would leave a 360×640 phone about 200px for Ready now. The board takes the full `100dvh`. Its campaign ▾ menu gets Dashboard, Characters and the account menu items (Settings, Manual dice, Sign out), so nothing is lost. `layouts/default.vue` skips its nav when the route is the Battle tab and the layout is phone.

**Who sees which layout.** Phones have three variants:

- **Player:** a seated hero. The tabs are as described below.
- **GM:** the GM console view (`gmControls`). Its tabs are described below.
- **Watcher:** a member with no seated hero, or a GM on `/board`. The tabs are Party, Chat and Scribe. There is no hero strip and no turn bar, and the content opens on Party. For a GM, the ▾ menu also has "Open GM console".

The frame then holds these rows:

1. **Top bar (52px):**
   - The campaign name with a ▾ menu. The menu holds Battle / Party / Journal / Maps, the campaign switcher and "Playing as", plus Table for the GM.
   - The round chip.
   - For players, an icon button to open the full sheet. For the GM, a ⋯ menu holding End encounter and the initiative-mode toggle.
2. **Initiative strip:** the existing rounds strip (`Initiative`) in a compact variant: 38px tokens with the acting token 48px, and a round cap. It scrolls sideways and centres the acting token. A token tap opens the hero stats sheet for heroes; for the GM it selects the creature (Creature tab). Long-press opens the GM token menu.
3. **Hero strip (players only, on every tab except Hero):**
   - The portrait and name;
   - an HP bar with temp HP;
   - the first two conditions as chips;
   - Armor and mana (or the class resource) tiles.

   A tap goes to the Hero tab.
4. **Content (scrolls inside):** the active tab.
5. **Turn bar:** the existing `TurnBar` (players) or `GmTurnBar` (GM), in a one-row variant:
   - Players: title ("Your turn", or "Bram is acting · you're next"), a subtitle, action pips, and the one step button.
   - GM: the acting creature, Up next, New round, and Next ▶.

   It hides while the on-screen keyboard is open (`visualViewport` height shrinks by more than 150px) and on the Chat and Scribe tabs.
6. **Tab bar (62px plus the bottom safe area):**
   - Players: Actions, Hero, Party, Chat (with an unread badge), Scribe. Scribe shows only when it's available; otherwise there are four tabs.
   - GM: Encounter, Creature, Party, Chat. Scribe is a segment inside Chat for the GM, since space is short.

   The current tab is remembered per browser (try/catch around localStorage). The default is Actions for players and Encounter for the GM.

**Tabs:**
- **Actions:**
  - `Actions` with two tiles per row;
  - filter chips that scroll sideways;
  - the `readyNote` line;
  - sections as on desktop (Attack, Boost & support or Off-turn, Reactions);
  - the last result under the list.
- **Hero:** the hero column's content (`Hero`, `HeroHp`, `HeroConditions`, `HeroSummons`, `HeroRest`, stats) as one scrolling column with larger touch targets.
- **Party:**
  - `PartyCards` as full-width cards; a tap opens the stats as a bottom sheet (`HeroCardDialog` in sheet mode).
  - Below the heroes, an Enemies list with what players may see (name, conditions, Down / Slain) and the GM's full numbers.
- **Chat / Scribe:** `Comms` full height, with the input above the tab bar.
- **GM Encounter:** `Encounter` cards in one column, with −5 / −1 / ± / +1 / +5, rename, pips and conditions, plus a chip for allies & summons and "+ Add". A card tap selects it.
- **GM Creature:** the selected creature's `StatBlock`, or `GmHero` for a selected hero. Selecting a card or token while on another tab doesn't switch tabs; it shows a "Selected: Goblin D" toast linking to the Creature tab.

### Tablet portrait (768–1023px)

- **Top bar:** campaign menu, the Battle / Journal / Maps tabs, the round chip, and icon buttons for Party, Chat (with badge) and Scribe. Players also get Sheet ↗.
- **Initiative strip:** full size.
- **Two columns:**
  - left: the hero column for players, or the stat block for the GM (290px, fixed);
  - right: the turn bar above actions, two tiles per row, or the encounter grid for the GM.
- **Party / Chat / Scribe** open as a drawer from the right (360px) over the actions, with a dimmed backdrop. It closes on backdrop tap, the ✕, or Escape. Whisper opens the drawer on Chat.

### Tablet landscape (1024–1199px)

The desktop board, tighter:
- three columns: left 270px, centre flexible, right 290px;
- three tiles per row;
- the right column shows Party above Chat and Scribe, as on desktop.

It uses the desktop bar and initiative strip. With `touch`, the splitters are hidden and the touch behaviours apply. With a mouse, splitters work as on desktop, with the lower width minimums the narrower window needs.

### Desktop (1200px and up)

Unchanged, except that a touch desktop or large tablet (e.g. an iPad Pro in landscape) gets the touch behaviours above.

## Decided with the owner

- Ignore the Party tab for now; design mobile and tablet from the Battle board, mostly from scratch.
- Actions and spells come first, as on desktop.
- In-person play is the main case; remote play must be possible.
- GMs rarely use phones or tablets, but it must work.
- On touch, tapping a tile opens its details first; a button in the details uses it.
- Approach 1: one battle board with a layout per size.

## Calls made by the designer (open to correction)

- Touch behaviours depend on the touch media query, not width.
- Breakpoints: 768, 1024 and 1200.
- Players' phone tabs: Actions, Hero, Party, Chat, Scribe. The GM's: Encounter, Creature, Party, Chat (Scribe inside Chat).
- The hero strip shows on every player tab except Hero.
- The turn bar hides while typing and on the Chat and Scribe tabs.
- Battle is the landing tab for Nimble campaigns at every size, and the 1200px note goes away.
- On tablet portrait, Party, Chat and Scribe live in a right-hand drawer.
- The GM token menu opens on long-press.
- Selecting a creature on the GM's phone shows a toast instead of switching tabs.
- The app nav is hidden on the phone battle board; its links move into the campaign ▾ menu.
- On phones, members with no seated hero and GMs on `/board` get a watcher layout: Party, Chat and Scribe.
- Details first covers Ready now tiles only. Other spend buttons stay one tap, with bigger targets.
- On phones the result is pinned above the turn bar. With Manual dice it stays until dismissed and carries "It crit".
- The old Party section is renamed "Party (classic)" next to the battle board.

## Left to the builder

- How shared components take their layout: a prop, or reading `useBoardLayout()` themselves. Pick one and use it consistently.
- The bottom sheet component (one shared `UiSheet`, built on `<dialog>`, accessible: focus trap, Escape, return focus).
- The exact compact sizes of tokens and tiles within the 44px minimum.
- Animations (sheet slide, drawer), respecting `prefers-reduced-motion`.
- Test plan:
  - unit tests for `useBoardLayout`'s classification and for the keyboard-open detection helper;
  - a browser smoke test at 375×812, 390×844, 768×1024, 1024×768, 1180×820 and 1440×860, as Player and GM, in all four themes, using touch emulation for the touch cases.
