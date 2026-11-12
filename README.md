# Lantern

Character sheets and campaign tools for a tabletop group.

- Character sheets for Nimble, Pathfinder 2e and D&D 5e, with dice rollers and a level-up flow
- Campaigns with a board for maps and images, a journal, party and secret messages, and a GM console with an initiative tracker
- A shared document library
- Four themes (Classic, Gothic, Eldritch, Cursed) and a per-player accent colour
- An admin area for roles, permissions and reported uploads

Built with Nuxt 3 (SPA), Vue 3, TypeScript, Pinia and Supabase. Hosted on Vercel.

## Getting started

Requires Node.js `^20.19.0 || >=22.12.0`.

```bash
npm install
npm run dev        # http://localhost:3000
```

Create `.env.local` with your Supabase project's values (Dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Database

The schema, row-level security policies, storage buckets and realtime setup are in `supabase/migrations/`.

- Hosted project: `supabase link --project-ref <ref>` then `supabase db push`.
- Local: `supabase start` runs a local stack (API on port 55421) with the migrations applied.

> **Upgrading a project that ran the first version of this app?** The first migration
> (`20261109000000_lantern_schema.sql`) replaces the old schema: it drops the v1 `profiles`,
> `characters`, `groups`, `user_groups` and `feedback` tables and their rows. Accounts are kept
> and get new profiles; the old `documents` and `character-images` buckets are left in place
> but no longer reachable from the app. Back up anything you need before pushing.

The first admin is promoted by hand after signing up:

```sql
update public.profiles set role = 'admin' where handle = '<username>';
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript check |
| `npm run lint` | Oxlint, then ESLint |
| `npm run test` | Unit tests for the rules logic |
| `npm run format` | Prettier |

## Design

`design/` holds the reference screens and tokens the app is built from. See `design/README.md`.
