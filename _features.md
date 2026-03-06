# Features & Task List

| ID | Task | Description | Done |
|----|------|-------------|------|
| 001 | Theme Toggle | Build a toggle component that switches between light/dark and persists preference in localStorage | ☑ |
| 002 | Row Level Security | Enable RLS on `profiles` and `characters` tables — users can only read/write their own data | ☑ |
| 003 | Supabase Storage Bucket | Create `character-images` bucket, set access policies for authenticated users | ☑ |
| 004 | Character Composable | Create `composables/useCharacter.js` — fetch, create, update character logic, keep pages clean | ☑ |
| 005 | Snackbar Notifications | Global Vuetify snackbar for success and error feedback (e.g. "Character saved!", "Login failed") | ☑ |
| 006 | Error Boundary Handling | Handle 404s and unauthorized access attempts gracefully with friendly error pages | ☑ |
| 007 | Verify Supabase | Verify connection to `rpg-character-sheet` database through Supabase MCP | ☑ |
| 008 | Document Library | 'Document' button in user dashboard takes them to a document library | ☑ |
| 009 | Library Controls | Users can view, upload, and download new documents | ☑ |
| 010 | Document Display | Files will be in a list format. The display name will be the file name without dashes or underscores and uppercase each first letter | ☑ |
| 011 | PDF Viewer | Many of the files will be .pdf so set up a viewer when a user clicks a doc that will allow them to view one page at a time | ☐ |
| 012 | PDF View Controls | Add a back (to docs) button. Users should be able to change the orientation of the page in case some are landscape or portrait (regular) | ☐ |
| 013 | Document Delete | Add a delete icon button to each document list item (the store's `deleteDocument` fn already exists); include a confirmation dialog before removal | ☑ |
| 014 | Documents Empty-State CTA | Add an "Upload" `v-btn` inside the empty-state `div` on the Documents page so users don't have to scroll to the header to upload their first file | ☑ |
| 015 | Documents Back Navigation | Add a back-to-Dashboard affordance on the Documents page — breadcrumb (`v-breadcrumbs`) or a back `v-btn` in the header row; also update the AppBar title to reflect the current route | ☑ |
| 016 | Document Fetch Error State | Handle failures in `documentStore.fetchDocuments()` with an `error` ref; display a `v-alert type="error"` in `DocumentsView.vue` instead of silently showing the empty state | ☑ |
| 017 | Upload Guardrails | Show accepted file types as a hint in the upload dialog's `v-file-input`; add a client-side file size check (e.g., 50 MB cap) with a specific error message before the Supabase upload is attempted | ☑ |
| 018 | Global Snackbar in Documents | Replace local `snackbar` ref state in `DocumentsView.vue` with the existing `useSnackbarStore().show()` to match the app-wide convention used elsewhere | ☑ |
| 019 | Accessibility: Icon Button Labels | Add `aria-label` to all icon-only buttons: download ("`Download [filename]`"), AppBar theme toggle ("`Toggle theme`"), AppBar logout ("`Log out"`"), AppBar avatar ("`User profile`") — WCAG 2.1 AA SC 4.1.2 | ☑ |
| 020 | Dashboard Loading State | Add a `v-progress-linear` or `v-skeleton-loader` to `DashboardView.vue` while `characterStore.fetchCharacters()` is in flight, preventing a false "No characters yet" flash | ☑ |
| 021 | Mobile-Responsive Header Buttons | On the Dashboard and Documents header rows, show icon-only buttons on `xs` breakpoints and full label+icon on `sm+` using `d-none d-sm-inline` on the button text spans | ☑ |
| 022 | Fix Subtitle Contrast (Site-Wide) | `text-medium-emphasis` subtitles fail WCAG AA (~3:1). Add a single SCSS override in `main.scss` to raise opacity to `rgba(255,255,255,0.72)` so all card subtitles, list metadata, and body labels meet 4.5:1 | ☐ |
| 023 | Document Rows Clickable | Clicking a document list row should trigger download (or open the PDF viewer). Add `@click` handler + `cursor: pointer` to `v-list-item`; aligns with user mental model | ☐ |
| 024 | Fix Level-Up Data Desync | `levelUp()` commits the level increment before stat edits are saved — cancel leaves level incremented but stats reverted. Move the level increment inside the "Save Stats" confirm handler | ☐ |
| 025 | Mobile Touch Targets (44px) | Icon buttons throughout (document row download/delete, AppBar icons) are 36px — below WCAG 2.1 AA minimum. Apply `size="large"` to icon buttons or add a global SCSS rule: `.v-btn.v-btn--icon { min-width: 44px; min-height: 44px; }` | ☐ |
| 026 | Documents AppBar Title Truncation | "Document Library" truncates to "Document Li…" on mobile (390px). Shorten the AppBar title to "Library" or reduce font size to prevent ellipsis cutoff | ☐ |
| 027 | Upload Button Always Shows Label | Remove `d-none d-sm-inline` from the "Upload" button text on the Documents page — it's the primary CTA on a sparse page and should always display its label | ☐ |
| 028 | File Input `accept` Attribute | The upload dialog's `v-file-input` uses `accept="*/*"` but the hint says "PDF, Word, Excel, images". Set `accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"` to match | ☐ |
| 029 | Password Visibility Toggle | Add a show/hide password toggle (`mdi-eye` / `mdi-eye-off` append-inner-icon) to the password fields on Login and Signup | ☐ |
| 030 | Signup `autocomplete` Attributes | Add `autocomplete="new-password"` to both password fields and `autocomplete="username"` to the display name field on the Signup form | ☐ |
| 031 | Replace Readonly Notes Textarea | The Notes field on Character View is a `readonly v-textarea` — looks editable but isn't. Replace with a `v-card-text` or `<p>` display element | ☐ |
| 032 | Document List Dividers | Add the `divided` prop to `v-list` on the Documents page to render `v-divider` between items, improving row separation as the list grows | ☐ |
| 033 | Delete Dialog `role="alertdialog"` | The delete confirmation dialog renders as `role="dialog"`. Change to `role="alertdialog"` on the `v-card` to signal urgency to screen readers (WCAG 2.1 AA) | ☐ |
| 034 | Progress Linear `aria-label` | Add `aria-label="Loading documents"` to the `v-progress-linear` on the Documents page | ☐ |
