# Desktop battle board: design

Date: 2026-11-19 · Branch: `feat/desktop-battle-board` · Mockup: [`2026-11-19-desktop-battle-board-mockup.html`](2026-11-19-desktop-battle-board-mockup.html) (open it in a browser; the switch at the top flips Player / GM / Player waiting)

## Intent

Lantern's Party tab was built mobile first: one tall column (initiative, roster, chat, table admin) with the quick-action panel and the Lore Master squeezed into the page margins. Most players run the app on laptops (1200px and wider, mostly 1440px and wider), where that layout wastes width, needs scrolling, and the quick-action panel is cluttered and hard to manage. Players still leave for the full sheet to find spells and abilities.

The goal is a **battle screen**: one desktop view, laid out wide rather than tall, where players and the GM can run a whole fight without leaving the page or scrolling it. The full sheet stays available for browsing and building, but a player should never need it mid-fight.

## Goals

- At 1440×860 (and down to 1200px wide), the Party tab shows everything for a fight with no page scroll: initiative order, your hero with all its controls, every action you can take, party cards, chat, and the Lore Master.
- New players see at a glance what they can do right now (the "Ready now" filter), without reading every rule.
- Real estate goes to names and numbers; rules text lives in hover tooltips.
- The GM screen mirrors the player's: turn and round controls, a quick stat block, fast HP edits, renaming, and New round.
- Anyone can click a party card (or a hero's initiative token) to see that hero's stats in a modal.

## Non-goals

- Phones and tablets. Below 1200px the current Party tab, quick-action panel and Lore drawer stay exactly as they are.
- D&D 5e and Pathfinder 2e. Only Nimble campaigns get the battle board; other systems keep the current Party tab at every width.
- Changing rules logic. Rolls, costs, triggers and turn steps stay in the existing composables and utils.
- Replacing the full sheet, the Journal or Maps tabs.

## Anti-goals (a failure even if it technically works)

- A desktop view that still needs vertical scrolling to reach the turn button, your HP, or the action list.
- "Ready now" disagreeing with the sheet: an action shown as ready that the sheet would block, or hidden when the sheet allows it.
- Recreating the quick-action panel's clutter in a new place.
- Breaking the mobile Party tab while building the desktop one.

## Constraints

- Vue 3 + Nuxt 3 SPA, `<script setup lang="ts">`, SCSS with the theme CSS variables in `assets/styles/_themes.scss` and shared classes in `main.scss`. No UI library. Prettier: 2 spaces, no semicolons, single quotes, width 100.
- All four themes (Classic, Gothic, Eldritch, Cursed) must work, including the panel palette remap (Cursed parchment).
- `noUncheckedIndexedAccess` is on.
- Every table has RLS; players must never see enemy HP numbers (today `campaign_initiative()` gives them a band) or another player's private data beyond what the roster already shares.
- Never use art from the rule books.
- Smoke-test on `npm run dev:local` (seeded GM and Player accounts, "Test Table").

## Approaches considered

1. **New desktop battle layout from 1200px, current Party tab kept below (chosen).** New components for the hero column, action panel with Ready now, party cards, stats modal, and the GM's encounter grid and stat block, all built on the composables the sheet and quick-action panel already use. Clean break from the cluttered panel; mobile untouched. Cost: two layouts to maintain for a while.
2. Rework the current Party tab in place as a three-column grid at wide widths, moving the quick-action panel into the middle. Cheapest, one layout, but it inherits the cluttered ~1,800-line `ActionPanelMenus.vue` and every desktop change risks the phone layout.
3. One new responsive layout for every size, replacing the Party tab and quick-action panel everywhere. Cleanest end state, biggest job, and phones would need their own redesign first, which wasn't asked for.

The user picked approach 1.

## Design

### Where it lives

- `components/board/PartyView.vue` chooses the layout: when the campaign is Nimble and the viewport is at least 1200px wide (a `matchMedia` composable, so it reacts to resizes), it renders the new battle board; otherwise it renders today's layout unchanged.
- New components go in `components/battle/` (auto-registered as `<Battle…>`).
- On the battle board the existing docked side panels (`BoardActionPanel`, `BoardLorePanel`) are not rendered, so the `_board-dock.scss` shell shift doesn't apply. The board uses the full page width (it is not capped by the 1280px shell); the campaign header shrinks to one bar.

### Page frame (both roles)

From top to bottom, fitting the viewport height (`100dvh` minus the app nav), with scrolling only inside panels:

1. **Board bar** (one line, ~48px): campaign name, the Party / Journal / Maps (and NPCs for the GM) tabs, the round chip, and on the right: for players "Open full sheet", for the GM the turn controls (Prev, Next turn, New round, End encounter). This replaces the tall `Shell` header only on the battle board; the campaign switcher and "Playing as" move into a small menu on the campaign name.
2. **Initiative strip** (one row, full width): a token per combatant in turn order showing initiative, portrait or initials, name, HP (number for heroes; for enemies a band such as Unhurt / Hurt / Bloodied for players and the number for the GM), action pips, and an Acting / Next badge. Your own token is outlined. Hero tokens open the stats modal. Overflow scrolls horizontally. Summons stay under their summoner as today.
3. **Three columns**: left 320px, centre flexible, right 340px, 14px gaps, 20px page gutter.

### Player view

**Left: your hero** (all controls, scrolls inside if it ever overflows):
- Portrait, name, ancestry, class, subclass, level.
- HP bar with temp HP, the existing drag behaviour (`components/nimble/HpBar.vue`), plus an amount field with − and + and the Crit toggle; Wounds.
- Tiles: Armor, Speed, Initiative, Hit dice.
- Mana gauge (or the class resource, from `sheetResource()`).
- Conditions with their end timing (`SheetConditions` behaviour) and an Add button.
- Summons as compact rows (name, HP, slain toggle), when the hero has any.
- Stats with save advantage / disadvantage marks.
- Field rest and Safe rest.

**Centre: turn and actions.**
- **Turn bar**: "Your turn" or "Marx is acting · you are next", action pips (click to spend or refund), reaction status, Rushed note, and the one step button the sheet already uses (New encounter → Start turn → End turn → New round → … → End encounter, driven by `turnActive`, `inEncounter`, `turnDone`). The board's existing automatic turn steps (today in `ActionPanelBody.vue`: start, end and new round as initiative moves) move with it.
- **Action panel** with filter chips: **Ready now** (default, with a count), All, Attacks, Spells, Reactions, Abilities, and a search box.
  - Each action is a small tile: element dot, name, action cost as pips, mana cost, dice, one short detail (range, condition, limit). The full rules text, costs and what clicking does are in a hover (and keyboard focus) tooltip. Clicking performs the action exactly as the sheet does (rolls, spends, posts to party chat).
  - **Ready now** shows only what can be used this moment, grouped: **Attack** (weapons, damage spells, summon commands, attack abilities, the same set the sheet's Attacks panel builds), **Boost & support** (or **Off-turn** when it isn't your turn), and **Reactions**. A note says why the list is short: "1 action left · 13 mana · hiding 4 you can't use now", or "Not your turn · only reactions and off-turn options".
  - **All** shows everything grouped Weapons, Class abilities, Reactions, Cantrips, Tier 1, Tier 2…; unavailable actions are dimmed and show their reason ("Needs 2 actions", "Not your turn", "Needs Charged").
  - **Source of truth for availability**: the composables decide availability today, but through several fields: `why` on most items, plus `blocked` (weapons, reactions), `short` / `busy` / `noActions` (spell cards), `short` (ability actions), `left === 0` / `short` (ability counters), and `attackAbilities` replaces every reason with "Not your turn" off-turn. The build adds one normalised `unavailable: string | ''` (the reason, or empty) to each item the composables return, computed from those same fields, so the sheet panels and the battle board read one value. This is presentation, not rules: no cost, roll or trigger changes. A small pure helper (in `utils/`, unit tested) flattens the lists into tiles with category, cost and that reason, so Ready now, All and the tabs can never disagree with each other or the sheet. Ready now means "`unavailable` is empty".
  - The **Off-turn** group shows only what the composables allow off-turn besides reactions (for example Heart's Fire's paid off-turn cast, free reactions like Interpose for free). It is often empty; an empty group is hidden.
  - Upcasting, Spellshaper options and similar choices open from the tile (a small popover reusing `components/nimble/Upcast.vue`), not inline.
  - Under the list: the last result ("Zap on Goblin A: 11") with a note that it went to party chat.

**Right: party and chat.**
- **Party cards**: one compact card per other hero: portrait, name, Acting tag, class and level, one status line (summons, Wounds, a key condition), HP bar and numbers, Armor. Click opens the stats modal.
- **Chat / Lore Master**: one panel with two tabs. Chat keeps today's behaviour (party and secret threads, Battle log toggle, unread badges). The Lore Master tab hosts the existing chat (`LorePanelChat` / `useLoreMaster`) with its suggested questions; it shows only when the Lore Master is available to this user, as today.

### GM view

Same frame. The board bar carries Prev / Next turn / New round / End encounter.

**Left: stat block of the selected creature** (defaults to whoever is acting, else the first enemy; click any creature card or token to switch):
- Name editable in place (renames this combatant only; the journal entry and NPC keep theirs).
- Size, type, level, source page.
- HP bar with amount field, −, +, and Set.
- Tiles: Armor, Speed, Initiative, Actions (used / max).
- Conditions with Add.
- Traits, actions (each with a Roll button for its dice), bloodied and last stand entries, and GM notes, from the linked `campaign_npcs.stat_block`. Custom combatants without a stat block show only the numbers and notes.

**Centre: turn bar and encounter.**
- Turn bar: who is acting and who is next, "+ Add creatures" (today's add dialog), Next turn.
- **Encounter grid**: a card per enemy (filter chip for allies and summons): initials or portrait, name with a rename pencil on hover, initiative, HP bar with numbers, quick buttons −5, −1, an amount field, +1, +5, Armor, conditions, and action pips. Slain creatures stay greyed with Remove and Revive. Hovering a card shows a short stat tooltip; clicking selects it into the left column.

**Table admin** (invites, session, players; today `BoardTableAdmin` under the Party tab) opens from a "Table" button in the GM's board bar as a dialog, so it stays one click away without taking a column.

**Right: party and chat.** Party cards as for players, plus each hero's action pips and mana. Chat with the Lore Master tab (the GM's Lore Master gets campaign context, as today).

**Actions follow Nimble's turn rule, not the round.** A creature's actions refill at the end of its own turn; actions spent off-turn (reactions such as Defend or Interpose) come out of what it has on its next turn. So:
- **Heroes**: unchanged from today. `endTurn()` refills `actionsSpent` when the hero's turn ends, on the player's own board.
- **Monsters**: `actions_used` resets to 0 when the GM's Next turn moves past that creature (its turn ends). The GM can spend a pip off-turn for a monster's reaction; it stays spent into its next turn.
- **New round** jumps to the top of the next round (skipping anyone who hasn't acted) and runs the existing per-round refills on the players' boards (`newRound()`: per-round uses). It does **not** refill anyone's actions. Prev turn doesn't undo refills.

### Stats modal (players and GM)

A `UiDialog` opened from any party card or hero initiative token:
- Left side: portrait, name, ancestry / class / subclass / level, HP bar with temp HP, Wounds, Armor, Speed, Initiative, conditions.
- Right side: stats with save advantage / disadvantage, top skills, resources (mana, class resource), summons, key abilities with one-line text.
- Footer: Whisper (opens a secret chat thread to that player), and Open full sheet for the GM (read-only) and for your own hero.
- HP controls appear for the GM and for your own hero; other players see it read-only.

### Data changes

- `combatants` gains `conditions text[] not null default '{}'`, `actions_max smallint not null default 1`, `actions_used smallint not null default 0`. Players see enemy conditions through `campaign_initiative()` (which is dropped and recreated with the new column, plus client types); monster action counts stay GM-only, so on the player's initiative strip only hero tokens show pips. Ending a monster's turn (Next turn moving past it) sets its `actions_used = 0`. A migration and the matching types in `types/index.ts`.
- Renaming writes `combatants.name` (GM policy already allows it).
- The stats modal needs more of a hero than `campaign_roster()` returns (stats, save marks, skills, resource summary, ability names and text). A new member-only RPC `campaign_hero_card(p_campaign, p_character)` returns that public subset for a hero seated in the campaign; it never returns notes, coins, inventory or backstory beyond what the roster already shares.

### Behaviour kept from today

Everything the quick-action panel and sheet do keeps working on the battle board: results post to party chat as `kind: 'action'`; a summon the GM drops to 0 HP is marked slain on the player's sheet; the roster refreshes with the turn and every 30 seconds; Opportunity Attack, Rushed, conditions, upcasts, alternate costs and triggers behave as on the sheet.

## Decided with the user

- Desktop-first battle board for 1200px+ (mostly 1440px+), horizontal three-column layout, no page scroll.
- The full sheet stays for browsing and managing spells and abilities; the battle board is for playing.
- The action panel keeps the sheet's "all attacks together" idea; **Ready now** is a separate default filter, and **All** stays for browsing with reasons on unavailable actions.
- Clicking any party card opens a stats modal, for players and the GM.
- Lore Master doesn't need to be always visible (now a tab beside Chat).
- GM: turn and round controls, quick stat blocks, easy HP edits, renaming.
- Actions refill at the end of each creature's own turn (Nimble); off-turn spends carry into the next turn. New round does not refill actions.
- Approach 1.

## Calls made by the designer (open to correction)

- Lore Master as a tab beside Chat rather than a floating button (a button covered the chat input in the mockup).
- Summons live in the hero column; their commands appear in Ready now's Attack group.
- The GM's left column is a pinned stat block of the selected creature.
- Table admin moves to a "Table" dialog in the GM's board bar.
- Players don't see monster action pips.
- A normalised `unavailable` reason is added to the composables' items (presentation only) so Ready now matches the sheet exactly.
- Monster action pips need the new `combatants` columns; `actions_max` defaults to 1 and the GM can change it on the stat block. Monsters refill at the end of their turn, like heroes.
- Below 1200px and for non-Nimble campaigns nothing changes.
- The campaign switcher and "Playing as" move into a menu on the campaign name on the battle board.

## Left to the builder

- Component boundaries inside `components/battle/` and how much of `ActionPanelMenus.vue` can be reused as is versus re-skinned (logic should come from the composables, not be copied).
- The exact tooltip component (one shared, accessible: shows on hover and focus, dismisses on Escape).
- Responsive behaviour between 1200 and 1440px (column widths may shrink; tiles reflow).
- Keyboard shortcuts, if any.
- Test plan: unit tests for the availability helper; browser smoke test on `npm run dev:local` as Player and GM in all four themes at 1440×860 and 1200×800.
