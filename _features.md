# Lantern overhaul — features & task list

Design reference: `design/README.md`. Check tasks off as they land.

## Phase 1 · Foundation

- [x] Remove Vuetify, Netlify config and the old pages/components
- [x] Theme system: Classic, Gothic, Eldritch, Cursed + accent colour (`assets/styles/_themes.scss`, `utils/themes.ts`)
- [x] Top-nav layout for players, side-nav layout for admin, auth layout
- [x] Login and signup (with unique username)
- [x] Settings: theme, accent presets, custom colour, notifications, live preview
- [x] Database schema with row-level security (`supabase/migrations/`)
- [x] Apply the migration to the hosted Supabase project and create the admin account
- [x] Vercel project, environment variables and first deploy

## Phase 2 · Characters

- [x] Five character slots, new character by system
- [x] D&D 5e sheet: Classic, Gothic, Eldritch and Cursed layouts
- [x] Pathfinder 2e sheet (ranks, shield, hero points, conditions, MAP strikes, focus, Bulk)
- [x] Nimble sheet (saves adv/dis, wounds, action tracker, class resource dice, heroic reactions)
- [x] Dice rollers per system, HP trackers, portrait upload, autosave
- [x] "Edit sheet" form for every stored value
- [x] Level-up dialog (system-aware; level and stats commit together)

## Phase 3 · Campaigns

- [x] Create a campaign (creator is GM), invite by email/username or link, accept/decline
- [x] Restricted state when campaign creation is turned off
- [x] Limit of 3 campaigns per creator (DB trigger + disabled form with notice)
- [x] Campaign board: pin maps/images, zoom, GM hide/reveal, player-view preview
- [x] Campaign journal: entries, attachments, party or private visibility, filters
- [x] GM console: initiative tracker, party and secret messages, roster, next session
- [x] Dashboard: messages, current campaign, library panel, invite banner
- [x] Live updates for messages, board and journal

## Phase 4 · Library & admin

- [x] Library: upload, system and category tags, filters, search, PDF viewer
- [x] Report a file (library, board, journal attachment)
- [x] Admin: users table, roles, permission switches, restriction reason, moderation history, suspend
- [x] Admin: reports queue (dismiss, remove, remove + restrict), campaigns and documents lists

## Follow-ups (after first deploy)

- [x] Move the Nimble Core Rules and Heroes PDFs into the new library; delete the old `documents` bucket
- [x] Delete campaign (GM console, typed-name confirmation; also removes uploaded files)
- [x] Settings only in the avatar menu, not the top nav
- [x] Copilot review fixes on PR #6 (reports derived server-side, autosave race, portraits, session reset, PDF dialog, crits, usernames)
- [x] Apply `20261109000200_harden_reports_and_handles.sql` to the hosted database

## Phase 5 · Wrap-up

- [x] UI/UX review pass on every screen (run `ui-ux-reviewer`) and fixes
- [ ] Responsive and accessibility pass at phone width
- [x] Supabase security advisors on the hosted project
- [x] Production deploy on Vercel

## Phase 6 · Nimble heroes

- [x] Source PDFs in `.local/` (gitignored); class portraits are original SVG sigils (license forbids book art)
- [x] Typed rules data in `data/nimble/` (classes + subclasses levels 1–20, ancestries, backgrounds)
- [x] Sheet model: class/subclass/ancestry/background slugs, recorded choices, ability level
- [x] `utils/nimbleBuild.ts` (level 1 build, level plan, apply level) with tests
- [x] Hero creation flow `/characters/new/nimble` (hero → ancestry → background → stats → name & review)
- [x] Data-driven Nimble level-up (new abilities, subclass and ability choices, stat increases)
- [x] Class sigil as portrait fallback; abilities grouped by level; Spells panel with mana; Change subclass (story subclasses)
- [x] UI/UX review of creation and level-up (fixed: choice layout collision, save of rebuilt arrays, off-screen validation, detail panel scroll, solid action bar, stepper, locked backgrounds)

### Phase 6.1 · Nimble feedback

- [x] Max HP gained on level-up is editable (for rolls made at the table)
- [x] KEY in rules text shows the hero's number (higher Key Stat), highlighted
- [x] Opening a spell closes the other open spell
- [x] Changing subclass removes everything the old one granted (abilities, picks, spells, schools, bonuses); the Reaver's Bonescythe is a spell
- [x] Level only goes up through Level up; lowering it warns, then undoes the higher levels (level history snapshots)

### Phase 6.2 · Nimble sheet redesign (`design/screens/NimbleSheet.dc.html`)

- [x] Sheet model: temp HP, dying, Hit Dice used, temp mana, concentration, conditions, reactions used, Rushed Attacks, use counters, coins (gp/sp, migrated from the gold text), languages, height & weight
- [x] `utils/nimblePlay.ts` with tests: damage and dying, healing, mana, Catch Breath / Make Camp, Safe Rest, new turn, inventory slots
- [x] Class resource panels from class data (Rage, Combat Dice, Judgment Dice, Bursts of Speed, Thrill of the Hunt, Sneak Attack, Pilfered Power), counted by hand
- [x] Vitals: temp HP, dying and dead alerts, Wounds, Hit Dice rests, Save DC, Safe Rest (confirmed)
- [x] Mana panel with pips and temporary mana; Concentration
- [x] Attacks with Rushed Attack disadvantage; action tracker (1 action while Dying); reactions once per round
- [x] Ability cards with use counters (refilled on a Safe Rest)
- [x] Spell cards: cast spends actions and mana (or Pilfered Power), upcast, starts Concentration
- [x] Conditions (Bloodied, Dying and Wounded are automatic)
- [x] Inventory slots (10 + STR), quantity steppers, add item, coins
- [x] KEY stats marked on the stat tiles; size, height & weight and languages in the identity block
- [x] Feedback: basic turn actions removed; Actions lists only abilities with an action or limited uses; spells and abilities are toggle cards (one open at a time); spells in two columns; All abilities shows full descriptions
- [x] Feedback: Actions lists only abilities with limited uses (per turn/round, encounter, day/Safe Rest, or a pool), counted from their rules text (`abilityCounters`); "Track uses" removed from All abilities; "New encounter" refills per-encounter uses; pools (Lay on Hands) spend an amount

### Phase 6.3 - Updates

- [x] Journal entries and messages send a notification the player sees on every screen (`stores/notifications.ts`, `UiNotifications`; follows the Notifications settings)
- [x] Messages and journal entries show the character name with the player's display name smaller below it (`utils/roster.ts`)
- [x] Background story section (`backstory` on every sheet; Nimble "Background" panel, story field in the editor for 5e and PF2e)
- [x] Game systems ordered Nimble, Pathfinder 2e, Dungeons & Dragons (Nimble is the default)
- [x] Board ↔ character navigation: "Open sheet" beside "Playing as"; the sheet links back to its campaign board

### Phase 6.4 - Updates

- [] All players want to be able to see everyones portraits. Make an initiative tracker that whole party can see. on t
- [] Update the pdf viewer with page selection, and zoom functions
- [] Add click and drag feature to the map board
- [] Monster creator, with a text area to describe the monster and ai generates it.

## Phase 7 · Campaign board revamp (`design/screens/BoardShell.dc.html`)

Plan: board and GM console become routed pages on one shell; shared NPC pool; AI keys.

### 7.1 Data

- [x] Migration `20261112073855_board_revamp.sql`: `site_settings`, `npcs` (pool), `campaign_npcs`, combatant NPC links + portraits, journal sections / fields, `user_ai_keys` in Vault, `npc-images` bucket
- [x] Players read the turn order through `campaign_initiative()` (enemy HP shown as a band) and get live updates from `encounters`
- [x] Journal NPC / bestiary entries: members edit their notes, only the GM reveals facts (trigger)
- [x] Types, `utils/initiative.ts` (group letters, copies, HP band) and `utils/npcJournal.ts` (journal stub, facts) with tests
- [x] Apply the migration to the hosted project and run the security advisors (plus FK indexes; `generate-npc` deployed)

### 7.2 Routed board

- [x] `BoardShell` layout with routed tabs: `/board/{party,journal,maps}`, `/gm/{party,journal,maps,npcs}`
- [x] Shared initiative strip with portraits for the whole party
- [x] `UiAvatar`: character portraits (Nimble sigil fallback) instead of initials everywhere
- [x] Journal sections: session log, characters, NPCs, bestiary (GM reveals facts)
- [x] Party chat with private threads between any members and unread badges; map zoom with drag-to-pan

### 7.3 NPCs

- [x] GM NPC index (Monsters / Humanoids, source filter, search) and stat block per system
- [x] Manual NPC builder; every saved NPC goes to the shared pool
- [x] Add to initiative ×N (Goblin A–E) and the automatic journal entry; "Add to party journal" for NPCs met but not fought
- [x] Library NPCs tab with Official / Homebrew filters and "Add to campaign"
- [x] Admin "Site features": NPC pool and AI generator switches
- [x] Pool switches split: GM console, Library, publishing (`site_settings.npc_pool_{campaign,library,publish}`)
- [x] Admin NPCs: pool list and generator (any system, Official / Homebrew); staff draft with AI without a campaign

### 7.4 AI

- [x] Settings "AI providers": Claude, Gemini, ChatGPT keys (encrypted), default provider, test
- [x] `generate-npc` Edge Function and the AI assistant in the generator
- [x] Level picker and GM's Guide targets (Monster Builder, Legendary Monster Builder, minion dice) sent to the AI; drafts checked against them
- [ ] 5e CR table and PF2e creature-building targets

### 7.5 Official content

- [ ] Official monsters transcribed (Nimble 3PCL, SRD 5.2, PF2e ORC) with citations, seed script, attributions page

## Party quick-action panel · UI/UX review (PR #27)

From the ui-ux-reviewer pass (code read) plus browser checks on 2026-11-17 (chrome-devtools, local stack; Playwright was locked).

### High

- [x] Folded tab clipped off-screen below ~1320px: the shell now keeps a 40px shift while folded (tab at x = 21 at 1200)
- [x] Unavailable rows stay focusable (`aria-disabled`), say why on the sub line ("Finish casting first", "Needs N mana", "None left") and aren't dimmed (parchment: name 8.5:1, tag 6.7:1)
- [x] Stop casting in the panel, with the "Casting X: N more actions next turn" line (New turn left to the GM)
- [x] Focus moves to the unfold tab on collapse and back to the collapse button on unfold
- [x] Descriptions reachable without hover: attack properties on the sub line; spell, reaction and ability text via `aria-describedby` (hover `title` kept for mouse users)
- [x] 44px targets under `any-pointer: coarse`; edge tab 44px wide; Wound button min 56px, 12px text
- [x] ~~Cursed tags invisible~~: false alarm, my test switched `data-theme` without recomputing `--accent-ink`; through Settings they measure 6.65:1

### Medium

- [x] ~~`UiHelp` toggles the dropdown~~: false alarm; a real click, Enter or Space on "?" doesn't toggle (the first test clicked the wrapper span)
- [x] Edge tab no longer covers content on narrow screens (shell `padding-left: 52px` while the tab shows)
- [x] Result line under the header; each result re-renders its node so repeats are announced
- [ ] Decide: keep one-open-at-a-time dropdowns or allow several open
- [x] ~~Header meta label~~: actions left and mana removed from the panel header; the roster card beside it shows both
- [x] Shell shift animates (0.2s), skipped under reduced motion
- [x] Unfold button named by its visible "Actions", with `aria-expanded` + `aria-controls`

### Accessibility

- [x] `:focus-visible` outline inset on rows, summaries and the Wound button (the 3px global offset was clipped by the scrolling panel)
- [x] Attack and spell rows have explicit names ("Ignite, 1 mana, 2 actions")
- [x] Reaction rows are named "Mark Defend used, 1 action" (`aria-pressed` = used)
- [x] Mana gauge: `aria-valuetext` ("12 of 14, plus 3 temporary"); meter max includes temp, matching the bar
- [x] Dropdown arrow rotation only with `prefers-reduced-motion: no-preference`

### Visual

- [x] 12px sub lines and Wound button; tier captions 11px uppercase (matches the roster's caps labels, also kept for the mana label)
- [x] Long names wrap to two lines
- [x] SVG icons for collapse and close
- [ ] Edge tab shadow and drawer backdrop still use rgb() values, as UiHelp and UiDialog do; no shadow token exists yet
- [x] Temp mana segment striped, not just lighter

### Browser check

- [x] 1920 / 1440 / 1200: docked beside the content, no overlap, no horizontal scroll; folded tab on screen
- [x] 1024 / 500 (Chrome's minimum width): drawer opens, focus lands inside, closes back to the edge tab; no horizontal scroll or overlap
- [x] Cursed theme via Settings: panel text ≥ 6.6:1
- [ ] 390px on a real phone or device emulation
- [ ] GM view hides the panel (code: `!isGm`; not rechecked in the browser)

### Chat: game lines vs party messages

- [x] `messages.kind` (`chat` / `action`, migration `20261117100000_message_kind.sql`); the panel posts `action`
- [x] Chat shows game lines as a compact full-width log row (dice icon, bold name, 13px, accent rule); typed messages keep the bubbles
- [x] Game lines raise no notifications and don't show on the dashboard
- [x] "Battle log" switch beside the Messages heading: off by default, remembered per user in the browser; hidden game lines don't count as unread
- [x] Apply `20261117100000_message_kind.sql` to the hosted project

## Lore Master (AI chat on the Party tab)

- [x] `lore-master` Edge Function on the user's own key (Claude Sonnet 5.5, Gemini, ChatGPT); shared helpers moved to `supabase/functions/_shared/ai.ts`
- [x] Role worked out on the server from `campaign_members`; non-members get 403
- [x] GM context: campaign, live roster, character sheets, campaign NPCs (with GM notes), recent journal (both visibilities)
- [x] Player context: rules and their own character only; the prompt refuses monsters, surroundings, plot and published-adventure content
- [x] Nimble rules pack from `data/nimble` (`utils/loreContext.ts`): core rules plus the hero's class, subclass, ancestry, background and spells; the GM also gets the monster budgets, bestiary index and every spell
- [x] Panel docked in the right margin from 1200px (folds to a tab); below that a "Lore" edge tab under "Actions" opens a drawer from the left
- [x] Only shown when AI is on site-wide and the user has saved a key; history kept per browser session
- [x] Shared `useDockedPanel` for both side panels; shell shift for both margins in `assets/styles/_board-dock.scss`
- [x] Tests: rules pack contents and size, sheet serialization, turn trimming, prompt limits, escaped markdown (`tests/loreMaster.test.ts`)
- [x] Browser check (headless, local stack): 1440 / 1200 docked both sides, 1100 / 390 stacked tabs and drawer, Escape closes, GM console shows Lore alone, no horizontal scroll
- [ ] Answers checked with a real provider key (player refusals, GM context use)
- [ ] Deploy `lore-master` and redeploy `generate-npc` to the hosted project
- [ ] ui-ux-reviewer pass

## Desktop battle board (Nimble, ≥1200px)

- [x] The battle board has its own Battle tab, which Nimble campaigns open on; `useBoardLayout` picks its frame by width (phone, tablet, desktop) and touch, and the old Party tab stays as "Party (classic)"
- [x] Frame and bar with shared tab state (`useBoardNav`); one-row initiative strip
- [x] Hero column (HP, conditions, rest, summons) and one shared sheet editor with the turn steps firing from initiative
- [x] Player turn bar and a "Ready now" action panel (tiles, details, pickers, filters) using the same availability rule as the sheet
- [x] Party cards, hero stats dialog (`campaign_hero_card`), Chat and Lore tabs
- [x] GM turn bar with New round, rename, add combatants; encounter grid and stat block with conditions and action pips
- [x] Monster conditions and actions (`combatants`); monsters' actions reset when their turn ends
- [x] GM hero HP changes reach the hero's sheet (`hero_hp_changes`)
- [x] Shared composables extracted from the sheet panels; `UiTooltip`
- [x] Tests: battle actions, turn steps, initiative helpers, HP change

### GM token menu (right-click an initiative token)

- [x] Right-click (or the context-menu key / Shift+F10) on a token opens a menu for the GM; players keep the browser's menu
- [x] Make active turn: jumps straight to that creature; the copy picked in the carousel sets the round (past the dashed line = next round); the ended turn refills actions like Next turn, skipped creatures don't
- [x] Undo in the toast puts the turn, round and refilled actions back
- [x] Change initiative from the menu
- [x] Remove from encounter, with a confirm step inside the menu
- [x] Tests: `turnTo` in `tests/initiative.test.ts`

### Initiative rules toggle (Nimble / Classic)

- [x] `encounters.initiative_mode` (`nimble` default, `classic`) and `combatants.initiative_rolled` (migration `20261120140000_initiative_mode.sql`); `campaign_initiative()` returns it, `set_my_initiative` marks the hero rolled
- [x] Nimble: heroes always act first (each group by its roll); the roll sets the hero's starting actions
- [x] Classic: the roll sets the turn order; heroes start with full actions (`sheet.classicInitiative`, copied live from the campaign by the sheet editor)
- [x] GM toggle under "Initiative rules" in the battle board's ⋯ menu; a select on the Party-tab tracker below 1200px
- [x] Add party seats heroes waiting ("–", top of the order) until the player rolls or the GM types their Initiative; no more placeholder d20
- [x] Tests: `sortOrder` by mode, Classic starting actions
- [ ] Apply `20261120140000_initiative_mode.sql` to the hosted project

### Players follow the GM's encounter

- [x] Seated by the GM (Add party, Add creatures' party), the hero's sheet joins on its own: New encounter runs and it asks for Initiative (`useCampaignEncounter` → `seatChange` in the sheet editor; sheet page, battle board and quick-action panel)
- [x] Taken off the tracker (removed, or End encounter) ends the hero's encounter
- [x] While seated the player's steps are only Roll Initiative (or the typed total), Start turn and End turn: no New encounter, New round or End encounter (`turnSteps` with `gmEncounter`)
- [x] Start turn waits (disabled) while someone else has the turn on the board
- [x] Tests: `seatChange` and the GM-encounter steps in `tests/turnSteps.test.ts`

### Skill checks follow-ups (future)

- [ ] Post skill check results to party chat
- [ ] A skill check roll on the battle board

### GM keyboard shortcuts (future)

- [ ] `→` / `Space`: Next turn
- [ ] `←`: Previous turn
- [ ] `Esc`: re-centre the carousel on the acting token
- [ ] Ignore the keys while typing in an input, textarea or the chat, and while a dialog is open
- [ ] List the shortcuts somewhere the GM can find them (tooltip on Next turn or a "?" help)

## Future updates

- conditions review https://nimble.nexus/rules/conditions
- GM only backstory section
- Fix the the delete campaign section text. its not wrapping, getting cut off my container an button

## Usage analytics (playtest: Battle vs Party vs Sheet)

- [x] `analytics_events` table, `track_events` RPC, staff report RPCs, 180-day prune
- [x] "Usage analytics" switch in Site features (`site_settings.analytics_enabled`)
- [x] Client: page views, active time, auto-captured clicks with `data-track` / `data-track-area`
- [x] `/admin/analytics`: per-page tiles, active time per day, who plays where, top buttons
- [x] Reset analytics (admin only, confirmed, logged)
- [x] Apply the migration to the hosted project
- [ ] ui-ux-reviewer pass on `/admin/analytics`
