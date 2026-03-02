# Features & Task List

| ID | Task | Description | Done |
|----|------|-------------|------|
| 001 | Initialize Vue 3 Project | Scaffold project with Vite, install Vue Router, Pinia, Vuetify 3, and SASS | ☐ |
| 002 | Configure Vuetify Theming | Set up light/dark theme with SASS variables, default to dark, define color palette | ☐ |
| 003 | Theme Toggle | Build a toggle component that switches between light/dark and persists preference in localStorage | ☐ |
| 004 | Supabase Project Setup | Initialize Supabase client, store credentials in `.env`, export client from `src/supabase/` | ☐ |
| 005 | Database Schema — Profiles | Create `profiles` table with `id`, `username`, `display_name`, `avatar_url`, `created_at` | ☐ |
| 006 | Database Schema — Characters | Create `characters` table with all Nimble RPG fields and a `system` column for future templates | ☐ |
| 007 | Row Level Security | Enable RLS on `profiles` and `characters` tables — users can only read/write their own data | ☐ |
| 008 | Supabase Storage Bucket | Create `character-images` bucket, set access policies for authenticated users | ☐ |
| 009 | Auth Store (Pinia) | Create `stores/auth.js` — store session, current user, login/logout actions | ☐ |
| 010 | Sign Up Page | Build `/signup` page — email, username, password fields. On success, create a row in `profiles` | ☐ |
| 011 | Login Page | Build `/` login page — email and password. Redirect to `/dashboard` on success | ☐ |
| 012 | Auth Navigation Guards | Protect `/dashboard`, `/character/*` routes — redirect unauthenticated users to login | ☐ |
| 013 | Logout Functionality | Add logout button/action that clears the Supabase session and redirects to login | ☐ |
| 014 | Vue Router Setup | Configure all routes: `/`, `/signup`, `/dashboard`, `/character/new`, `/character/:id`, `/character/:id/edit` | ☐ |
| 015 | Dashboard Page Layout | Build `/dashboard` page layout with header area and character grid section | ☐ |
| 016 | User Avatar Component | Display user's first initial as avatar fallback, show image if `avatar_url` exists | ☐ |
| 017 | Dashboard Header | Show user display name and avatar, include logout button and theme toggle | ☐ |
| 018 | Create Character Button | Prominent button on dashboard that navigates to `/character/new` | ☐ |
| 019 | Character Card Component | Card showing character image (or placeholder), name, and level. Clicking navigates to `/character/:id` | ☐ |
| 020 | Character Card Grid | Responsive grid on dashboard that fetches and displays all characters belonging to the logged-in user | ☐ |
| 021 | Character Image Placeholder | Styled placeholder (silhouette or styled initial) shown when no character image is uploaded | ☐ |
| 022 | New Character Page | Build `/character/new` — empty character sheet form with all Nimble RPG fields | ☐ |
| 023 | Character Image Upload | Image upload input with preview, saves to Supabase Storage at `character-images/{user_id}/{character_id}` | ☐ |
| 024 | Save New Character | On form submit, insert new row into `characters` table, redirect to `/character/:id` on success | ☐ |
| 025 | View Character Page | Build `/character/:id` — read-only display of all character sheet fields in a clean layout | ☐ |
| 026 | Edit Button | Button on view page that navigates to `/character/:id/edit` | ☐ |
| 027 | Edit Character Page | Build `/character/:id/edit` — all fields editable, with Save and Cancel buttons | ☐ |
| 028 | Save Edited Character | On save, update the character row in Supabase, redirect back to `/character/:id` | ☐ |
| 029 | Level Up Button | Button on view page that increments level by 1 and opens STR, DEX, INT, WIL, Armor, and HP for inline editing. Name and Race are locked. | ☐ |
| 030 | Character Composable | Create `composables/useCharacter.js` — fetch, create, update character logic, keep pages clean | ☐ |
| 031 | Form Validation | Add Vuetify form validation to sign up, login, new character, and edit character forms | ☐ |
| 032 | Snackbar Notifications | Global Vuetify snackbar for success and error feedback (e.g. "Character saved!", "Login failed") | ☐ |
| 033 | Loading States | Show spinners or skeleton loaders during async Supabase operations across all pages | ☐ |
| 034 | Redirect If Logged In | On visiting `/` or `/signup`, redirect to `/dashboard` if a session already exists | ☐ |
| 035 | Delete Character | Allow users to delete a character from the view or edit page, with a confirmation dialog | ☐ |
| 036 | Error Boundary Handling | Handle 404s and unauthorized access attempts gracefully with friendly error pages | ☐ |
| 037 | Responsive Layout | Ensure all pages look good on mobile, tablet, and desktop using Vuetify's grid system | ☐ |
| 038 | Environment Config | Set up `.env` and `.env.example` with Supabase URL and anon key, add `.env` to `.gitignore` | ☐ |
