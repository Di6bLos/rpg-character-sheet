# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- when working on a 'feature' from the `_features.md` list, check off the tasks as you complete them.
- Run the ui-ux-reviewer only after major UI changes (layout changes, new components or pages), not after every sprint of updates

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build (nuxt build)
npm run generate     # Static site generation (nuxt generate)
npm run type-check   # TypeScript check (nuxt typecheck)
npm run lint         # Run oxlint then eslint sequentially, both with --fix
npm run format       # Prettier format all files
npm run test         # Vitest unit tests for utils/ (dice, level-up, contrast, themes)
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
- `components/ui/` — `UiDialog` (native `<dialog>`), `UiSwitch`, `UiToast`
- `components/sheet/` — `Shell` (action bar, editor, level-up), `Dnd5e{Classic,Gothic,Eldritch,Cursed}`, `Pf2eSheet`, `NimbleSheet`, `Editor`, `ListEditor`, `LevelUpDialog`, `Portrait`
- `composables/useSheetEditor.ts` — provides the working copy of a character with debounced autosave; sheets read it with `useSheet()`
- `utils/dice.ts`, `utils/levelUp.ts`, `utils/contrast.ts` — pure rules logic, covered by `tests/`
- `data/nimble/` — Nimble rules data transcribed from the Core Rules and Heroes PDFs (kept locally in gitignored `.local.docs/`): 11 classes with levels 1–20, subclasses (incl. 4 story subclasses), ability pools, spells, ancestries, backgrounds. Never use the books' art (license); class "portraits" are original SVGs in `components/nimble/Sigil.vue`
- `utils/nimbleBuild.ts` — builds a level 1 Nimble sheet, the per-level plan (abilities, choices, stat increases, subclass), applies level-ups and subclass changes; covered by `tests/nimbleBuild.test.ts`. Nimble sheets with a `classSlug` use the data-driven level-up; hand-made ones keep the free-text flow
- `components/nimble/` — `HeroCard`, `Sigil`, `ChoicePicker` (shared by creation, level-up, subclass change), `SubclassDialog`
- Components in subfolders are auto-registered with the folder as prefix (`components/ui/Dialog.vue` is `<UiDialog>`)
- All components use `<script setup lang="ts">`

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
| `/settings` | Theme, accent, notifications | user |
| `/admin`, `/admin/reports`, `/admin/campaigns`, `/admin/documents` | Admin area | admin, moderator |

## Data model

Schema lives in `supabase/migrations/`; every table has RLS. Key points:

- `profiles` (public bits, role, theme) and `user_permissions` (flags, suspension, restriction reason) are separate so other players can't read someone's restrictions. Role and flags change only through `staff_*` / `admin_*` RPCs, which also write `moderation_history`.
- `characters.sheet` is JSON typed per system (`types/sheets.ts`); a trigger caps characters at 5 per user. Shared keys (`class`, `lineage`, `hp`, `hpMax`, `ac`, `initMod`, `passivePerception`) feed the `campaign_roster` RPC.
- A character joins a campaign through `campaign_members.character_id`.
- `messages.recipient_ids` null = whole party; otherwise a secret message to those users.
- Policy helpers live in the `private` schema (`is_staff`, `can`, `is_campaign_member`, `is_campaign_gm`).
- Storage buckets: `portraits` (public), `campaign-files` (`{campaign_id}/…`, members only), `library` (`{user_id}/…`, any signed-in user can read).

## Environment

Copy `.env.local` values from Supabase Dashboard → Project Settings → API:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Local database: `supabase start` runs a local stack on ports 5542x (see `supabase/config.toml`) and applies the migrations. Point the dev server at it by setting `VITE_SUPABASE_URL=http://127.0.0.1:55421` and the local anon key in the environment.

## TypeScript

Single `tsconfig.json` — Nuxt manages project references internally via `nuxt typecheck`.

`noUncheckedIndexedAccess: true` is enabled — array/object index access returns `T | undefined`. Guard accordingly.

## Linting

Dual linter setup — both must pass:
1. **Oxlint** (Rust-based, fast) — runs first, covers correctness rules
2. **ESLint** (flat config in `eslint.config.ts`) — runs second with caching

Prettier is the source of truth for formatting (2 spaces, no semicolons, single quotes, width 100) and disables conflicting ESLint rules via `eslint-config-prettier`.
