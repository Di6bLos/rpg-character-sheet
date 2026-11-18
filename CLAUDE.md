# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- Before making any updates, cut a new branch from an up-to-date `stage` (`git checkout stage && git pull && git checkout -b <type>/<short-name>`). Never commit directly to `stage` or `main`; PRs target `stage`.

- when working on a 'feature' from the `_features.md` list, check off the tasks as you complete them.
- After adding or changing a feature, run a quick browser smoke test before calling it done: open it on the local stack (`npm run dev:local`, sign in with the matching test account), click through its buttons, menus, dialogs and forms, and read the browser console and failed network requests. Fix any warning or error the app causes; name any that come from outside the app (browser extensions, an expired session) instead of chasing them. Headless Playwright is fine when the MCP browsers are busy.
- Run the ui-ux-reviewer only after major UI changes (layout changes, new components or pages), not after every sprint of updates

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000) against .env.local (the hosted project)
npm run dev:local    # Local testing: starts the local Supabase stack, seeds test accounts, serves http://localhost:3100
npm run dev:seed     # Re-seed the local test accounts and "Test Table" (`-- --reset` rebuilds the hero's sheet)
npm run build        # Production build (nuxt build)
npm run generate     # Static site generation (nuxt generate)
npm run type-check   # TypeScript check (nuxt typecheck)
npm run lint         # Run oxlint then eslint sequentially, both with --fix
npm run format       # Prettier format all files
npm run test         # Vitest: utils, Nimble data integrity, golden level tables
npm run preview      # Preview production build locally
```

> Requires Node.js `^20.19.0 || >=22.12.0`. Use `nvm use 22.18.0` if needed.

## Stack

"Lantern": Vue 3 + Nuxt 3 (SPA mode, `ssr: false`) + TypeScript + Pinia + Supabase (auth, Postgres, storage, realtime). No UI library: custom components styled with SCSS and CSS variables. Hosted on Vercel.

## Design

`design/` is the reference (not wired into the app): `README.md` lists every screen, `screens/*.dc.html` hold exact markup and interaction logic, `tokens.json` the theme values. Match it when changing UI.

## Architecture

- `nuxt.config.ts` — Nuxt config; loads all theme fonts from Google Fonts
- `assets/styles/_themes.scss` — CSS variables per theme on `[data-theme]`; `main.scss` — base styles and shared classes (`.panel`, `.btn`, `.input`, `.chip`, `.badge`, `.tile`, `.table`…)
- `utils/themes.ts`, `composables/useTheme.ts` — theme + accent; accent variables are set on `<html>`. Inside `.panel` the text variables are remapped to the panel palette (matters for Cursed parchment)
- `layouts/` — `default` (top nav, all players), `admin` (side nav), `auth`
- `middleware/` — `auth`, `guest`, `staff`
- `plugins/auth.client.ts` — restores the session and applies the saved look before mount
- `stores/` — `auth` (session, profile, permissions, `can(flag)`), `character`, `campaign`, `library`, `admin`, `snackbar`
- `lib/supabase.ts` — lazy Supabase client; reads `runtimeConfig.public.supabaseUrl/supabaseAnonKey`, which `nuxt.config.ts` fills from `VITE_SUPABASE_*` locally or `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Vercel's Supabase integration)
- `types/index.ts` — database row types; `types/sheets.ts` — per-system sheet JSON
- `components/ui/` — `UiDialog` (native `<dialog>`), `UiSwitch`, `UiToast`, `UiHelp` (a "?" tooltip beside a section title; put section help text there, with `.title-help` wrapping the heading), `UiCheckMenu` (a select-style dropdown of checkboxes; items in the slot use `.check-menu__item`), `UiFold` (fold button for a `.panel`; an `open` prop lets the page open or fold it, otherwise it remembers the reader's choice: put it as the panel's first child, before the heading; a `:has()` rule in `main.scss` hides everything after the heading while folded, remembered per panel in localStorage)
- `components/sheet/` — `Shell` (action bar, editor, level-up), `Dnd5e{Classic,Gothic,Eldritch,Cursed}`, `Pf2eSheet`, `NimbleSheet`, `Editor`, `ListEditor`, `LevelUpDialog`, `Portrait`
- `composables/useSheetEditor.ts` — provides the working copy of a character with debounced autosave; sheets read it with `useSheet()`
- `utils/dice.ts`, `utils/levelUp.ts`, `utils/contrast.ts` — pure rules logic, covered by `tests/`
- `data/nimble/` — Nimble rules data transcribed from the Core Rules and Heroes PDFs (kept locally in gitignored `.local/`; see the `rpg-rules` skill): 11 classes with levels 1–20 (plus the Artificer from its standalone PDF, `.local/nimble/Artificer1.7.pdf`), subclasses (incl. 4 story subclasses), ability pools, spells, ancestries, backgrounds. Never use the books' art (license); class "portraits" are original SVGs in `components/nimble/Sigil.vue`
- `utils/nimbleBuild.ts` — builds a level 1 Nimble sheet, the per-level plan (abilities, choices, stat increases, subclass), applies level-ups and subclass changes; covered by `tests/nimbleBuild.test.ts`. Nimble sheets with a `classSlug` use the data-driven level-up; hand-made ones keep the free-text flow
- `components/nimble/` — `HeroCard`, `Sigil`, `ChoicePicker` (shared by creation, level-up, subclass change), `SubclassDialog`; the panels of the Nimble sheet: `SheetVitals`, `SheetResources` (mana, class resource, concentration), `SheetTurn` (action tracker with extra actions; its header says "Your turn", whose turn it is in the campaign's initiative (`components/nimble/TurnWho.vue`, `useInitiative`), "Waiting for your turn" or "Not in combat"; the "I roll my own dice" switch sits under the hero's name in `components/sheet/NimbleSheet.vue` and the board panel header; one step button at a time: New encounter → Start turn → End turn → New round → … → End encounter, tracked by `turnActive`, `inEncounter`, `turnDone`; actions come back on End turn, per-turn uses refill on Start and End turn, per-round uses on New round, per-encounter uses on New / End encounter; on the board the turn steps fire as initiative passes the hero and a new round refills per-round uses), `SheetAttacks` and `SheetReactions` (directly under `SheetTurn`; on your turn Attacks comes first and opens while Reactions folds, off your turn the reverse, via `UiFold`'s `open` prop; results show where they were made, tracked by `composables/useResultOwner.ts`), `SheetActions` (ability actions and limited uses; hidden when empty). Attacks: folding Weapons / Spells / Abilities groups with the resource each uses in the header: weapons and inventions; damage spells from `useNimbleSpells().spellAttacks`, folded by tier (`spellAttackTiers`, headers show the cost) with an upcast control (`components/nimble/Upcast.vue`, also in the board's Cast menu), cast and rolled via `utils/nimbleSpellDamage.ts` (a harmful spell is an attack, Core p. 13: it rolls with Rushed disadvantage and counts toward it; AoE keeps the lowest dice and never misses or crits); attacks are disabled off-turn ("Not your turn") unless already paid for: the Opportunity Attack reaction is a dropdown of your melee attacks (`opportunityOptions`): picking one pays the reaction and rolls it with +1 disadvantage (Opportunistic Frenzy waives it); summon attacks plus every attack-type ability, resource move or limited use from `useNimbleActions().attackAbilities`; then reactions incl. unlimited class reactions like Face Me! and free ones like "You can Interpose for free", ability actions (action-cost abilities with no limit, incl. attack ones like Whirlwind that prepay the next attack roll, and "Spend N mana" costs), the limited-use abilities with their counters). Ability text also drives: attack damage bonuses (`attackBonus`: Keen Eye, Unending Judgment, Kinetic Barrage), Zealot's mana stepper on melee cards, Shield Expert's second Defend, Interpose/Defend riders (Well Armored, Quickstrike), "Steal up to INT actions" (`stealActions`, repaid at End turn), Archmage's discount in `useNimbleSpells`, and permanent "Gain X armor" (`abilityArmor`, applied on level-up, subclass change and option swaps). Wounds run through `addWounds` (Unyielding Resolve ignores, then Kinetic Momentum, Veteran Stalker, Avenger, Exploding Soul react); `takeDamage(sheet, amount, level, crit)` handles Glorious Reprieve, Unstoppable Force and crits taken (MORE BLOOD!, Titan's Fury); `afterAttack` handles hit/miss/crit triggers (Blood Frenzy, Steal Tempo, Feinting Attack, quarry charges); Initiative recharges that say they expire are taken back by End encounter; New encounter lists "When you roll Initiative you may…" reminders. Spells offer alternate costs (`alts`: Force of Chaos, We'll ALL Burn!, Shadowfrost, Cryomancer's Reprisal, Master of Storm, Enveloped by the Master). `components/nimble/HpBar.vue` is the draggable HP bar (a drag of 4px+ or the arrow keys previews the change, temp HP included; release or Enter applies it; a tap does nothing; vertical swipes still scroll) with a Crit toggle beside it. `tests/rulesText.test.ts` checks that every rules regex in those files still matches some ability or spell text, so rewording data in `data/nimble/` fails loudly, `SheetAbilities` (every ability with its text), `SheetSpells` (each tier folds; `Spellshaper` lists the Mage's Spellshaper options with their mana, 1/turn), `SheetSummons` (one companion-style card per summon kind, each with its own action buttons: Command minions, the spirit's attack and heal, a custom summon's attack), `SheetConditions` (inside `SheetVitals`: core conditions plus spell statuses; `utils/nimbleConditions.ts` turns them into rules: Blinded, Prone and Poisoned add attack disadvantage and Invisible advantage (weapons and attack spells), Slowed halves and Grappled/Restrained zero the Speed tile, Incapacitated and the like block attacking and casting, Dazed takes an action at Start turn; every change names its condition. Each active condition can end at your next turn's start or end, the next round, or when combat ends (`sheet.conditionEnds`, defaults in `CONDITION_ENDS`), cleared by the turn steps), `SheetInventory`; `Modifiers` ("Upgraded by": `abilityModifiers()` in `utils/nimbleBuild.ts` finds other abilities' lines that name an ability, spell or weapon damage type, plus "Item: Upgrade" options; `summonModifiers()` adds the class options tied to a summon). `Trigger` puts a button on an upgrade or ability whose text grants something the app tracks (`abilityTrigger` in `utils/nimblePlay.ts`: temp HP like Master of Nightfrost's INT+LVL, actions, Fury Dice, Thrill of the Hunt charges, Bursts of Speed, shadow minions); a spell crit fires "whenever they would crit" triggers by itself (`critTriggers`). `components/sheet/CampaignLink.vue` links a seated hero's campaign name to its board
- `composables/useNimbleActions.ts`, `useNimbleSpells.ts` — attack rolls, reactions, ability counters and spell casting for the Nimble sheet in the current sheet editor; shared by the sheet panels and the board's quick-action panel (`onResult` gets each result message)
- `data/nimble/summons.ts`, `utils/nimbleSummons.ts`, `composables/useNimbleSummons.ts` — summoned minions, spirits, companions, friends and gadgets (`sheet.summons`) and the class options that change them; casting the spell or using the ability adds them, New encounter / Safe Rest end them; shown in `components/nimble/SheetSummons.vue` and the quick-action panel; the GM seats them in initiative with Sync summons (`combatants.summon_key`, kind `summon`); covered by `tests/nimbleSummons.test.ts`. When the GM drops a summon to 0 HP, the player's board marks it slain on their own sheet. Each summon kind can be renamed and given an image or, for companions and the Lifebinding Spirit, an animal (`sheet.summonLooks`, copied onto each member; `components/nimble/SummonLook.vue`; animal icons from game-icons.net (CC BY 3.0, credited in `assets/beasts/CREDITS.md` and the picker) drawn by `components/nimble/Beast.vue`, listed in `data/nimble/beasts.ts`). A Beastmaster can switch companion size once it is unlocked (`swapPoolOption`). The Summons panel's "Build a custom summon or companion" form makes `custom` summons (`addCustomSummon`: type, HP, Armor, speed, how many, an attack with dice, damage type, reach and action cost, selectable abilities from `CUSTOM_ABILITIES` (Pack Tactics, Grab, Resistant…; on-hit ones show on the attack), separate notes, and whether they last until slain, combat ends or a Safe Rest; `endCustomSummons` runs on End encounter and Safe Rest); their attacks join the Attacks panel. My Favored Pet is its own permanent summon (`minionOf: 'shadow-minion'`): it attacks with the minions, takes one of their places and follows their sacrifice rules
- `data/nimble/effects.ts`, `utils/nimbleEffects.ts` — statuses abilities and spells put on the hero (`sheet.effects`): conditions (Invisible, Prone…), Beastshift forms and Dragonform with their attacks and temp HP, and when each ends (attack, turn, spell, 0 HP, damage, concentration…); gadget rolls; Artificer inventions (`operateInvention` in `utils/nimblePlay.ts`). Transformations swap the portrait through `sheet.portraitOverride` (images per form in `sheet.formPortraits`, uploaded in `components/nimble/SheetForms.vue`; the roster reads it via `campaign_roster`); covered by `tests/nimbleEffects.test.ts`
- `components/board/ActionPanel*.vue` — the player's quick-action panel on the Party tab (Nimble only): docked in the page margin left of the content (≥1200px, collapsible; the shell shifts right to make room) or a drawer behind an edge tab; one `<dialog>` for both so its sheet editor stays mounted. Results post to party chat
- `components/board/LorePanel*.vue` — the Lore Master AI chat on the Party tab, for GMs (co-GM) and players (rules and their own hero), all systems; shown when `site_settings.ai_enabled` and the user has an AI key or the free agent is on (`site_settings.free_ai_enabled`: keyless users ask on the site's Gemini key, `FREE_AI_GEMINI_KEY`, up to `free_ai_daily_limit` questions a day). Docked in the right margin (≥1200px) or a drawer behind a "Lore" edge tab. `composables/useLoreMaster.ts` keeps the chat (sessionStorage) and calls the `lore-master` Edge Function; `utils/loreContext.ts` builds the public Nimble rules pack; `utils/loreText.ts` renders replies as escaped markdown
- `composables/useDockedPanel.ts` — the one-`<dialog>` dock/drawer logic both side panels share. Their edge tabs teleport into PartyView's `.edge-tabs` stack; the shell shift for both margins lives in `assets/styles/_board-dock.scss`
- `supabase/functions/` — Edge Functions on the user's own AI key (Supabase Vault): `generate-npc`, `lore-master` (falls back to the free agent's key when the user has none); shared HTTP, retry and provider-error helpers in `_shared/ai.ts`
- `utils/nimblePlay.ts` — table-side Nimble rules (damage and dying, rests, mana, turn tracker, inventory slots) and `abilityCounters()`, which reads use limits ("1/encounter", "WIL times/Safe Rest", pools), each option's name ("Keen Eyes: (1/encounter)") and what a use costs (`counterCost`: actions, a reaction like Defend, or an "Action: Attack" that pays for the next attack roll) from ability text; only abilities with a limit show in the Actions panel (`components/nimble/AbilityCounters.vue`), except those that mention the class resource (Thrill of the Hunt, Combat Dice…), which show as cards beside its moves in the resource panel; covered by `tests/nimblePlay.test.ts`. A class's resource panel comes from `ClassDef.resource` via `sheetResource()` in `utils/nimbleBuild.ts`; its moves are the `movesPool` picks (or the maneuvers named in the resource text, like Zephyr's Swiftstrike, 1/turn) plus abilities that "Spend 1 <resource> charge" (Final Takedown), and it shows "Upgraded by" for abilities naming the resource or its dice
- Components in subfolders are auto-registered with the folder as prefix (`components/ui/Dialog.vue` is `<UiDialog>`)
- All components use `<script setup lang="ts">`

## Agents & skills (`.claude/`)

Rules work goes through these so it stays consistent and cites its sources:

- `rpg-rules` skill — shared reference: source books and page offsets, licensing (what may be committed), Nimble math (hero curve, level cadence, spell damage, monster design) and how the repo encodes it; 5e/PF2e stubs
- `source-extract` skill — PDF (`.local/`, cached per page by `scripts/pdf-pages.sh`) or web page → typed data with page citations and license checks
- `rules-auditor` agent — checks one class level by level against the book; writes `.local/audits/<class>.md`. Once a class is clean and the user agrees, record its golden table: `NIMBLE_GOLDEN=<slug> npx vitest run tests/nimbleLevels.test.ts -u` (fixtures in `tests/fixtures/nimble/`, ignored by Prettier)
- `homebrew-designer` agent — original monsters, spells, items, NPCs balanced to the system's math → `homebrew/<system>/*.md`
- `system-converter` skill — convert content between Nimble, 5e and PF2e, listing the judgement calls
- `add-game-system` skill — checklist for making 5e or PF2e data-driven like Nimble

## Routes

| Path                                                                              | Screen                                                                 | Access                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `/`, `/signup`                                                                    | Sign in, sign up                                                       | guest                        |
| `/dashboard`                                                                      | Player dashboard                                                       | user                         |
| `/characters`                                                                     | Character slots                                                        | user                         |
| `/characters/new/nimble`                                                          | Nimble hero builder (class → ancestry → stats → background → review)   | user                         |
| `/character/:id`                                                                  | Sheet (by system and theme)                                            | owner; campaign GM read-only |
| `/campaigns`                                                                      | Campaign list, create, invites                                         | user                         |
| `/campaigns/:id/board`                                                            | Board + journal                                                        | campaign member              |
| `/campaigns/:id/gm`                                                               | GM console                                                             | campaign GM                  |
| `/join/:token`                                                                    | Join by invite link                                                    | user                         |
| `/library`                                                                        | Document library                                                       | user                         |
| `/settings`                                                                       | Theme, accent, notifications, AI keys, suggested NPCs                  | user                         |
| `/settings/npcs/new`                                                              | Suggest an NPC for the shared pool (`?edit=`, `?from=<campaignNpcId>`) | user                         |
| `/admin`, `/admin/reports`, `/admin/campaigns`, `/admin/documents`, `/admin/npcs` | Admin area (NPCs: shared pool list + generator, Official / Homebrew)   | admin, moderator             |
| `/admin/npcs/suggestions`                                                         | Review players' NPC suggestions (approve / edit & approve / send back) | admin, moderator             |

## Data model

Schema lives in `supabase/migrations/`; every table has RLS. Key points:

- `profiles` (public bits, role, theme) and `user_permissions` (flags, suspension, restriction reason) are separate so other players can't read someone's restrictions. Role and flags change only through `staff_*` / `admin_*` RPCs, which also write `moderation_history`.
- `characters.sheet` is JSON typed per system (`types/sheets.ts`); a trigger caps characters at 5 per user. Shared keys (`class`, `lineage`, `hp`, `hpMax`, `ac`, `initMod`, `passivePerception`) feed the `campaign_roster` RPC.
- A character joins a campaign through `campaign_members.character_id`.
- `messages.recipient_ids` null = whole party; otherwise a secret message to those users. `messages.kind` is `'chat'` (typed) or `'action'` (rolls and casts the quick-action panel posts; the chat shows them as a compact log row only when the viewer turns on "Battle log" (off by default, remembered per browser); they raise no notifications and the dashboard skips them).
- NPCs: `npcs` is the shared pool (official + approved homebrew); only staff write it. Players suggest entries through `npc_submissions` (pending → approved/rejected via the `staff_approve_npc_submission` / `staff_reject_npc_submission` RPCs). `campaign_npcs` are a campaign's own copies and never reach the pool on their own.
- Policy helpers live in the `private` schema (`is_staff`, `can`, `is_campaign_member`, `is_campaign_gm`).
- Lore Master context is chosen in the Edge Function from the caller's `campaign_members.role`: a GM gets the campaign (roster, sheets, NPCs, journal); a player gets only their own character, so campaign secrets never reach a player's prompt.
- Free Lore Master allowance: `ai_free_usage` (one row per user per UTC day, users read their own). Only the service role calls `use_free_ai` (atomic take, returns questions left or -1) and `refund_free_ai` (when the provider call fails); admins set the cap with `admin_set_free_ai_limit`.
- Storage buckets: `portraits` (public), `campaign-files` (`{campaign_id}/…`, members only), `library` (`{user_id}/…`, any signed-in user can read).

## Environment

Copy `.env.local` values from Supabase Dashboard → Project Settings → API:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Local testing: `npm run dev:local` is the one command. It starts the local stack (ports 5542x, see `supabase/config.toml`) if needed, runs `scripts/dev-seed.ts`, and serves on the fixed port 3100 with the local URL and anon key (process env beats `.env.local`). If 3100 is taken it names the process and stops instead of picking another port (`DEV_LOCAL_PORT` overrides). The seed is re-runnable and creates, in the local stack only, `admin@test.local` (site admin), `gm@test.local` and `player@test.local` (password in `utils/devAccounts.ts`) plus the Nimble campaign "Test Table" with the player's level 5 Mage "Iriel" seated. Against the local stack in dev, the sign-in page shows one-click Admin / GM / Player buttons. To try the free Lore Master locally, put `FREE_AI_GEMINI_KEY=…` in `supabase/functions/.env` (gitignored), restart the stack so the edge runtime picks it up, and turn on "Free Lore Master" in Admin → Site features.

## TypeScript

Single `tsconfig.json` — Nuxt manages project references internally via `nuxt typecheck`.

`noUncheckedIndexedAccess: true` is enabled — array/object index access returns `T | undefined`. Guard accordingly.

## Linting

Dual linter setup — both must pass:

1. **Oxlint** (Rust-based, fast) — runs first, covers correctness rules
2. **ESLint** (flat config in `eslint.config.ts`) — runs second with caching

Prettier is the source of truth for formatting (2 spaces, no semicolons, single quotes, width 100) and disables conflicting ESLint rules via `eslint-config-prettier`.
