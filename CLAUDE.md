# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- when working on a 'feature' from the `_features.md` list, check off the tasks as you complete them.
- After each sprint of updates, run the ui-ux-reviewer

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build (nuxt build)
npm run generate     # Static site generation (nuxt generate)
npm run type-check   # TypeScript check (nuxt typecheck)
npm run lint         # Run oxlint then eslint sequentially, both with --fix
npm run format       # Prettier format all files
npm run preview      # Preview production build locally
```

> Requires Node.js `^20.19.0 || >=22.12.0`. Use `nvm use 22.18.0` if needed.

## Stack

Vue 3 + Nuxt 3 (SPA mode) + TypeScript + Vuetify 3 (dark-default) + Pinia + Supabase (auth, DB, storage).

## Architecture

- `nuxt.config.ts` — Nuxt configuration; modules: `@pinia/nuxt`, `vuetify-nuxt-module`
- `app.vue` — Root layout component (Nuxt entry point)
- `plugins/auth.client.ts` — Initialises auth store on client mount
- `middleware/auth.ts` — Redirects unauthenticated users to `/`
- `middleware/guest.ts` — Redirects authenticated users away from login/signup
- `pages/` — File-based routing (one file per route)
- `components/` — Reusable components (`AppBar`, `CharacterCard`, `StatField`)
- `stores/` — Pinia setup stores (`auth.ts`, `character.ts`, `document.ts`)
- `lib/supabase.ts` — Lazy Supabase client (reads `runtimeConfig.public.supabaseUrl/supabaseAnonKey`)
- `types/index.ts` — Shared interfaces (`Profile`, `Character`, `CharacterFormData`, `LevelUpEditableField`)
- `assets/styles/main.scss` — App-specific CSS overrides (Vuetify styles handled by plugin)
- All components use `<script setup lang="ts">` (Composition API)

## Routes

| Path | Name | Auth |
|------|------|------|
| `/` | `index` | no |
| `/signup` | `signup` | no |
| `/dashboard` | `dashboard` | yes |
| `/character/new` | `character-new` | yes |
| `/character/:id` | `character-view` | yes |
| `/character/:id/edit` | `character-edit` | yes |
| `/documents` | `documents` | yes |

## Environment

Copy `.env.local` values from Supabase Dashboard → Project Settings → API:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

These are automatically mapped to `runtimeConfig.public.supabaseUrl` / `supabaseAnonKey` in `nuxt.config.ts`.
For production, you can also use `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_ANON_KEY`.

## TypeScript

Single `tsconfig.json` — Nuxt manages project references internally via `nuxt typecheck`.

`noUncheckedIndexedAccess: true` is enabled — array/object index access returns `T | undefined`. Guard accordingly.

## Linting

Dual linter setup — both must pass:
1. **Oxlint** (Rust-based, fast) — runs first, covers correctness rules
2. **ESLint** (flat config in `eslint.config.ts`) — runs second with caching

Prettier is the source of truth for formatting and disables conflicting ESLint rules via `eslint-config-prettier`.
