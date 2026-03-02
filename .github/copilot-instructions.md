# Copilot Instructions — RPG Character Sheet App

## Project Overview
A web app where users can create accounts and build, store, and manage RPG character sheets. Built with Vue 3 and Supabase. Initially supports the **Nimble RPG** system, with plans to add more RPG templates in the future. A dice rolling feature is also planned.

---

## Tech Stack
- **Frontend:** Vue 3 (Composition API), Vue Router, Pinia
- **UI Component Library:** Vuetify 3
- **Styling:** SASS — use `.scss` files for custom styles, leverage Vuetify's SASS variables for theming
- **Backend & Auth:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage)
- **Language:** JavaScript (not TypeScript for now — keep it beginner-friendly)

---

## General Coding Guidelines
- Use the **Vue 3 Composition API** with `<script setup>` syntax in all components
- Keep components small and focused on a single responsibility
- Use **Pinia** for all shared/global state (auth state, character data, theme preference)
- Use **Vue Router** for navigation between pages
- Always use `async/await` for Supabase calls — wrap in `try/catch` with user-friendly error handling
- Add clear comments explaining what code does, especially for Supabase queries and auth logic — this is a beginner-friendly project
- Prefer readability over cleverness

---

## Project Structure
```
src/
├── assets/          # Global styles, images
│   └── styles/      # SCSS files
├── components/      # Reusable UI components
│   ├── character/   # Character sheet, card, stat fields, etc.
│   ├── dashboard/   # Dashboard-specific components
│   └── ui/          # Generic UI (avatar, theme toggle, etc.)
├── composables/     # Reusable logic (useAuth, useCharacter, etc.)
├── pages/           # Route-level page components
├── router/          # Vue Router config
├── stores/          # Pinia stores
└── supabase/        # Supabase client init and helper functions
```

---

## Theming
- Default theme is **dark**
- Users can toggle between light and dark — store preference in `localStorage`
- Use Vuetify's built-in theming system configured with SASS variables
- Keep the color palette consistent — define primary, secondary, and surface colors in the Vuetify theme config, not inline

---

## Authentication
- Use **Supabase Auth** with email/password (username stored in the `profiles` table)
- On sign-up, create a corresponding row in a `profiles` table with `user_id`, `username`, `avatar_url`, and `display_name`
- Protect all dashboard and character routes — redirect unauthenticated users to the login page using a Vue Router navigation guard
- Store the current user session in a Pinia auth store (`stores/auth.js`)

---

## Supabase Database Schema

### `profiles` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | Foreign key → `auth.users.id` |
| username | text | Unique |
| display_name | text | |
| avatar_url | text | Nullable |
| created_at | timestamptz | |

### `characters` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | Foreign key → `profiles.id` |
| system | text | e.g. `"nimble"` — for future multi-template support |
| name | text | |
| image_url | text | Nullable |
| level | integer | Default 1 |
| class | text | |
| race | text | |
| str | integer | Strength |
| dex | integer | Dexterity |
| int | integer | Intelligence |
| wil | integer | Willpower |
| armor | integer | |
| hit_points | integer | |
| notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

- Always apply **Row Level Security (RLS)** — users can only read and write their own data
- Use Supabase Storage for character images (bucket: `character-images`)

---

## Pages & Routing

| Route | Page | Notes |
|---|---|---|
| `/` | Landing / Login | Redirect to `/dashboard` if already logged in |
| `/signup` | Sign Up | |
| `/dashboard` | User Dashboard | Protected route |
| `/character/new` | New Character Sheet | Protected route |
| `/character/:id` | View Character Sheet | Protected route |
| `/character/:id/edit` | Edit Character Sheet | Protected route |

---

## Dashboard (`/dashboard`)
- Display the user's **display name** and an **avatar** showing their first initial (fallback if no avatar image)
- A prominent **"Create Character"** button that navigates to `/character/new`
- Characters displayed in a **responsive card grid**
  - Each card shows: character image (or a placeholder if none), character name, and level
  - Clicking a card navigates to `/character/:id`

---

## Character Sheet

### Fields (Nimble RPG)
- Character Name
- Character Image (upload, stored in Supabase Storage)
- Level
- Class
- Race
- Core Stats: STR, DEX, INT, WIL
- Armor
- Hit Points
- Notes (textarea)

### View Mode (`/character/:id`)
- Display all fields in a clean, readable layout
- **Edit button** — navigates to `/character/:id/edit`
- **Level Up button** — increments level by 1 and opens stat fields (STR, DEX, INT, WIL, Armor, HP) for editing. Name and Race are NOT editable during level up.

### Edit Mode (`/character/:id/edit`)
- All fields are editable
- Save and Cancel buttons
- On save, update the record in Supabase and navigate back to view mode

---

## Character Image Handling
- Users can upload a character image when creating or editing a sheet
- Store images in Supabase Storage under `character-images/{user_id}/{character_id}`
- Display a styled placeholder (e.g. silhouette or initials) if no image is uploaded
- Show a preview before saving

---

## Future Features (keep architecture in mind)
- **More RPG system templates** — the `system` column on `characters` allows routing to different sheet layouts per system
- **Dice roller** — plan for a reusable `DiceRoller` component that can be used standalone or embedded in a character sheet

---

## Error Handling & UX
- Show a **Vuetify snackbar** for success and error messages (e.g. "Character saved!", "Login failed")
- Show loading spinners during async operations
- Validate all forms before submitting — use Vuetify's built-in form validation

---

## What to Avoid
- Do not use the Options API — always use `<script setup>`
- Do not store sensitive data in `localStorage` (auth tokens are handled by Supabase automatically)
- Do not call Supabase directly from templates — always go through a composable or store
- Do not hardcode colors — use the Vuetify theme system

---

## Features & Task List
- See [features.md](./_features.md) for a detailed task list and roadmap.
- when implementing features, check off tasks in that list and add comments linking to the relevant task ID (e.g. `// Task 014: Vue Router Setup`) to keep track of progress and maintain clarity on which code corresponds to which feature.

