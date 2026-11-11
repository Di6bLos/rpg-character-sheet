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
- [x] Source PDFs in `.local.docs/` (gitignored); class portraits are original SVG sigils (license forbids book art)
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
