# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Architecture

Vue 3 SPA with TypeScript, Vite, and Vue Router.

- `src/main.ts` — Entry point: creates app, registers router, mounts to `#app`
- `src/router/index.ts` — Client-side history routing; home is eager-loaded, other routes should be lazy-loaded (`() => import(...)`) for code splitting
- `src/views/` — Page-level components (one per route)
- `src/components/` — Reusable components
- Use `@/` alias for all imports from `src/` (e.g. `@/components/Foo.vue`)
- All components use `<script setup lang="ts">` (Composition API)

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
