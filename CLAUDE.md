# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- when working on a 'feature' from the `_features.md` list, check off the tasks as you complete them.
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
- `components/ui/` — `UiDialog` (native `<dialog>`), `UiSwitch`, `UiToast`, `UiHelp` (a "?" tooltip beside a section title; put section help text there, with `.title-help` wrapping the heading)
- `components/sheet/` — `Shell` (action bar, editor, level-up), `Dnd5e{Classic,Gothic,Eldritch,Cursed}`, `Pf2eSheet`, `NimbleSheet`, `Editor`, `ListEditor`, `LevelUpDialog`, `Portrait`
- `composables/useSheetEditor.ts` — provides the working copy of a character with debounced autosave; sheets read it with `useSheet()`
- `utils/dice.ts`, `utils/levelUp.ts`, `utils/contrast.ts` — pure rules logic, covered by `tests/`
- `data/nimble/` — Nimble rules data transcribed from the Core Rules and Heroes PDFs (kept locally in gitignored `.local/`; see the `rpg-rules` skill): 11 classes with levels 1–20 (plus the Artificer from its standalone PDF, `.local/nimble/Artificer1.7.pdf`), subclasses (incl. 4 story subclasses), ability pools, spells, ancestries, backgrounds. Never use the books' art (license); class "portraits" are original SVGs in `components/nimble/Sigil.vue`
- `utils/nimbleBuild.ts` — builds a level 1 Nimble sheet, the per-level plan (abilities, choices, stat increases, subclass), applies level-ups and subclass changes; covered by `tests/nimbleBuild.test.ts`. Nimble sheets with a `classSlug` use the data-driven level-up; hand-made ones keep the free-text flow
- `components/nimble/` — `HeroCard`, `Sigil`, `ChoicePicker` (shared by creation, level-up, subclass change), `SubclassDialog`; the panels of the Nimble sheet: `SheetVitals`, `SheetResources` (mana, class resource, concentration), `SheetTurn` (action tracker, New turn / New encounter), `SheetActions` (attacks, reactions, the limited-use abilities with their counters), `SheetAbilities` (every ability with its text), `SheetSpells`, `SheetConditions`, `SheetInventory`
- `composables/useNimbleActions.ts`, `useNimbleSpells.ts` — attack rolls, reactions, ability counters and spell casting for the Nimble sheet in the current sheet editor; shared by the sheet panels and the board's quick-action panel (`onResult` gets each result message)
- `components/board/ActionPanel*.vue` — the player's quick-action panel on the Party tab (Nimble only): docked in the page margin left of the content (≥1200px, collapsible; the shell shifts right to make room) or a drawer behind an edge tab; one `<dialog>` for both so its sheet editor stays mounted. Results post to party chat
- `utils/nimblePlay.ts` — table-side Nimble rules (damage and dying, rests, mana, turn tracker, inventory slots) and `abilityCounters()`, which reads use limits ("1/encounter", "WIL times/Safe Rest", pools) from ability text; only abilities with a limit show in the Actions panel; covered by `tests/nimblePlay.test.ts`. A class's resource panel comes from `ClassDef.resource` via `sheetResource()` in `utils/nimbleBuild.ts`
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

| Path | Screen | Access |
|------|--------|--------|
| `/`, `/signup` | Sign in, sign up | guest |
| `/dashboard` | Player dashboard | user |
| `/characters` | Character slots | user |
| `/characters/new/nimble` | Nimble hero builder (class → ancestry → stats → background → review) | user |
| `/character/:id` | Sheet (by system and theme) | owner; campaign GM read-only |
| `/campaigns` | Campaign list, create, invites | user |
| `/campaigns/:id/board` | Board + journal | campaign member |
| `/campaigns/:id/gm` | GM console | campaign GM |
| `/join/:token` | Join by invite link | user |
| `/library` | Document library | user |
| `/settings` | Theme, accent, notifications, AI keys, suggested NPCs | user |
| `/settings/npcs/new` | Suggest an NPC for the shared pool (`?edit=`, `?from=<campaignNpcId>`) | user |
| `/admin`, `/admin/reports`, `/admin/campaigns`, `/admin/documents`, `/admin/npcs` | Admin area (NPCs: shared pool list + generator, Official / Homebrew) | admin, moderator |
| `/admin/npcs/suggestions` | Review players' NPC suggestions (approve / edit & approve / send back) | admin, moderator |

## Data model

Schema lives in `supabase/migrations/`; every table has RLS. Key points:

- `profiles` (public bits, role, theme) and `user_permissions` (flags, suspension, restriction reason) are separate so other players can't read someone's restrictions. Role and flags change only through `staff_*` / `admin_*` RPCs, which also write `moderation_history`.
- `characters.sheet` is JSON typed per system (`types/sheets.ts`); a trigger caps characters at 5 per user. Shared keys (`class`, `lineage`, `hp`, `hpMax`, `ac`, `initMod`, `passivePerception`) feed the `campaign_roster` RPC.
- A character joins a campaign through `campaign_members.character_id`.
- `messages.recipient_ids` null = whole party; otherwise a secret message to those users. `messages.kind` is `'chat'` (typed) or `'action'` (rolls and casts the quick-action panel posts; the chat shows them as a compact log row only when the viewer turns on "Battle log" (off by default, remembered per browser); they raise no notifications and the dashboard skips them).
- NPCs: `npcs` is the shared pool (official + approved homebrew); only staff write it. Players suggest entries through `npc_submissions` (pending → approved/rejected via the `staff_approve_npc_submission` / `staff_reject_npc_submission` RPCs). `campaign_npcs` are a campaign's own copies and never reach the pool on their own.
- Policy helpers live in the `private` schema (`is_staff`, `can`, `is_campaign_member`, `is_campaign_gm`).
- Storage buckets: `portraits` (public), `campaign-files` (`{campaign_id}/…`, members only), `library` (`{user_id}/…`, any signed-in user can read).

## Environment

Copy `.env.local` values from Supabase Dashboard → Project Settings → API:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Local testing: `npm run dev:local` is the one command. It starts the local stack (ports 5542x, see `supabase/config.toml`) if needed, runs `scripts/dev-seed.ts`, and serves on the fixed port 3100 with the local URL and anon key (process env beats `.env.local`). If 3100 is taken it names the process and stops instead of picking another port (`DEV_LOCAL_PORT` overrides). The seed is re-runnable and creates, in the local stack only, `admin@test.local` (site admin), `gm@test.local` and `player@test.local` (password in `utils/devAccounts.ts`) plus the Nimble campaign "Test Table" with the player's level 5 Mage "Iriel" seated. Against the local stack in dev, the sign-in page shows one-click Admin / GM / Player buttons.

## TypeScript

Single `tsconfig.json` — Nuxt manages project references internally via `nuxt typecheck`.

`noUncheckedIndexedAccess: true` is enabled — array/object index access returns `T | undefined`. Guard accordingly.

## Linting

Dual linter setup — both must pass:
1. **Oxlint** (Rust-based, fast) — runs first, covers correctness rules
2. **ESLint** (flat config in `eslint.config.ts`) — runs second with caching

Prettier is the source of truth for formatting (2 spaces, no semicolons, single quotes, width 100) and disables conflicting ESLint rules via `eslint-config-prettier`.
