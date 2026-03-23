# UI/UX Reviewer Agent Memory

## Project Overview
RPG Character Sheet app — Vue 3 + Nuxt 3 (SPA mode) + TypeScript + Vuetify 3 (dark default) + Pinia + Supabase.
Single user account, RPG-focused (characters, stats, documents).

## Auth
- Dev credentials stored in `.env.local` as `DEV_USER_EMAIL` / `DEV_USER_PASSWORD`
- Password in `.env.local` may go stale; if login fails, reset via Supabase SQL:
  `UPDATE auth.users SET encrypted_password = crypt('NewPass', gen_salt('bf')) WHERE email = '...'`
- Supabase anon key format is `sb_publishable_...`; JWT legacy key also available via MCP

## Design Patterns Observed
- Dark theme: near-black `#121212` bg, `#1e1e1e` card surfaces
- Primary accent: Vuetify default purple (`#7C3AED` range)
- Secondary accent: amber/orange (used for Level Up button)
- Error color: red/pink (used for delete icon buttons)
- Form fields: `v-text-field` with underline variant (no `outlined`) on auth pages; outlined on forms in new/edit views
- Stat display: `v-chip` with `variant="outlined"` in read mode; `v-text-field` with `type="number"` in edit mode
- Character card: `v-card` with `hover` prop + CSS `translateY(-4px)` on hover

## Recurring Issues Found (First Full Review — Mar 2026)
1. **Excessive black space** — pages use `v-container` without `max-width` on auth/404, leaving vast empty side margins
2. **Subtitle contrast** — `text-medium-emphasis` on dark bg produces ~3:1 contrast (fails WCAG AA for small text)
3. **StatField chip layout** — chips are left-aligned with `ma-1` margin, creating uneven grid on character view
4. **No empty state on documents** — upload CTA is present but no illustration/graphic for emotional engagement
5. **AppBar title truncation on mobile** — "Document Li..." truncates in `v-app-bar-title`
6. **Login/signup card vertically centered but page is mostly black** — large wasted empty space above/below card
7. **Documents page upload button hides label on mobile** — `d-none d-sm-inline` makes it icon-only below sm breakpoint
8. **Level Up flow is in-page not a modal** — good for context, but the stat fields switch mid-layout abruptly
9. **No password visibility toggle** on login/signup
10. **Delete button uses icon-only with no visible label** on document rows — relies entirely on aria-label

## Component Inventory
- `AppBar.vue` — global nav bar with theme toggle + avatar menu (Dashboard, Library, Admin [admin only], Log out)
- `CharacterCard.vue` — `v-card` with hover, image + name + level/race/class subtitle
- `StatField.vue` — switches between `v-chip` (read) and `v-text-field` (edit) based on `editable` prop
- Views: pages in `pages/` — `index.vue` (login), `signup.vue`, `dashboard.vue`, `character/new.vue`, `character/[id].vue`, `character/[id]/edit.vue`, `documents.vue`, `admin/index.vue`, `[...slug].vue` (404)

## Document Store Pattern
- `DocumentFile` type with `path`, `name`, `displayName`, `size`, `created_at`
- `/documents` page is now read-only (no upload/delete) — managed by admin only
- Admin documents tab in `/admin` has full upload/delete capability
- Uses Supabase Storage bucket

## Admin Page Pattern (added Mar 2026)
- Route: `/admin` — guarded by `middleware/admin.ts` (checks `authStore.isAdmin`)
- `profiles.is_admin` boolean column controls access; `is_admin()` SQL function used in RLS policies
- Three tabs: Users (`v-data-table`), Documents (list with upload/delete), Inbox (`v-data-table`)
- Users tab uses nested Supabase join: `profiles + user_groups + groups`
- Groups system: `groups` and `user_groups` tables; admin can create/delete groups, assign users
- Inbox: `feedback` table; category chips (bug=error, feature_request=warning, comment=info)
- RLS issue: `is_admin()` function may fail on nested PostgREST joins due to policy evaluation order
- Admin store: `stores/admin.ts`; uses Edge Functions for invite/delete user operations

## Recurring Issues Found (Admin/Documents Review — Mar 2026)
11. **No page-level heading on admin** — `v-tabs` sits flush at top with no `<h1>` or section title above it
12. **`v-container fluid` on admin** — no max-width constraint; content spans full 1440px, feels formless
13. **Error alert displayed alongside empty table** — both "Failed to load profiles" AND "No data available" shown simultaneously; redundant and confusing
14. **Invite dialog has no scrim/backdrop color** — dialog appears very close in tone to the page bg
15. **AppBar title truncates on mobile** — "Admin Dash..." at 390px (same issue as documents)
16. **Inbox table has no row-level action** — feedback items are read-only with no mark-as-resolved or delete capability (UX gap)
17. **Documents page empty state copy change** — was "No documents yet. Upload the first file!" now "No documents available." — passive and unhelpful since users can no longer upload
18. **Documents page title duplicated** — shown in AppBar AND as `<h1>` in page body; redundant
