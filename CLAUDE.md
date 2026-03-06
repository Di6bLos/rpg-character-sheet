# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- when working on a 'feature' form the `_features.md` list, check off the tasks as you complete them.
- After each sprint of updates, run the ui-ux-reviewer

## Commands

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check + production build (runs in parallel)
npm run type-check   # TypeScript check only (vue-tsc --build)
npm run lint         # Run oxlint then eslint sequentially, both with --fix
npm run format       # Prettier format src/ only
npm run preview      # Preview production build locally
```

> Requires Node.js `^20.19.0 || >=22.12.0`. Use `nvm use 22.18.0` if needed.

## Stack

Vue 3 + TypeScript + Vite + Vuetify 3 (dark-default) + Pinia + Supabase (auth, DB, storage).

## Architecture

- `src/main.ts` — Entry point: Pinia → `authStore.init()` → router → Vuetify → mount
- `src/router/index.ts` — All routes lazy-loaded; nav guard checks `authStore.isAuthenticated`
- `src/views/` — Page-level components (one per route)
- `src/components/` — Reusable components (`AppBar`, `CharacterCard`, `StatField`)
- `src/stores/` — Pinia setup stores (`auth.ts`, `character.ts`)
- `src/plugins/vuetify.ts` — Vuetify instance; exports `VUETIFY_THEME_KEY`
- `src/lib/supabase.ts` — Supabase client (reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `src/types/index.ts` — Shared interfaces (`Profile`, `Character`, `CharacterFormData`, `LevelUpEditableField`)
- `src/styles/main.scss` — App-specific CSS overrides (Vuetify styles handled by plugin)
- Use `@/` alias for all imports from `src/`
- All components use `<script setup lang="ts">` (Composition API)

## Routes

| Path | Name | Auth |
|------|------|------|
| `/` | `login` | no |
| `/signup` | `signup` | no |
| `/dashboard` | `dashboard` | yes |
| `/character/new` | `character-new` | yes |
| `/character/:id` | `character-view` | yes |
| `/character/:id/edit` | `character-edit` | yes |

## Environment

Copy `.env.local` values from Supabase Dashboard → Project Settings → API:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## TypeScript

Two tsconfig project references:
- `tsconfig.app.json` — App source (`src/`), targets browser DOM
- `tsconfig.node.json` — Vite/ESLint config files, targets Node

`noUncheckedIndexedAccess: true` is enabled — array/object index access returns `T | undefined`. Guard accordingly.

## Linting

Dual linter setup — both must pass:
1. **Oxlint** (Rust-based, fast) — runs first, covers correctness rules
2. **ESLint** (flat config in `eslint.config.ts`) — runs second with caching

Prettier is the source of truth for formatting and disables conflicting ESLint rules via `eslint-config-prettier`.
