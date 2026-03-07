# Features & Task List

| ID | Task | Description | Done |
|----|------|-------------|------|
| 001 | PDF Viewer | Many of the files will be .pdf so set up a viewer when a user clicks a doc that will allow them to view one page at a time | ☐ |
| 002 | PDF View Controls | Add a back (to docs) button. Users should be able to change the orientation of the page in case some are landscape or portrait (regular) | ☐ |
| 003 | Fix Subtitle Contrast (Site-Wide) | `text-medium-emphasis` subtitles fail WCAG AA (~3:1). Add a single SCSS override in `main.scss` to raise opacity to `rgba(255,255,255,0.72)` so all card subtitles, list metadata, and body labels meet 4.5:1 | ☐ |
| 004 | Document Rows Clickable | Clicking a document list row should trigger download (or open the PDF viewer). Add `@click` handler + `cursor: pointer` to `v-list-item`; aligns with user mental model | ☐ |
| 005 | Fix Level-Up Data Desync | `levelUp()` commits the level increment before stat edits are saved — cancel leaves level incremented but stats reverted. Move the level increment inside the "Save Stats" confirm handler | ☐ |
| 006 | Mobile Touch Targets (44px) | Icon buttons throughout (document row download/delete, AppBar icons) are 36px — below WCAG 2.1 AA minimum. Apply `size="large"` to icon buttons or add a global SCSS rule: `.v-btn.v-btn--icon { min-width: 44px; min-height: 44px; }` | ☐ |
| 007 | Documents AppBar Title Truncation | "Document Library" truncates to "Document Li…" on mobile (390px). Shorten the AppBar title to "Library" or reduce font size to prevent ellipsis cutoff | ☐ |
| 008 | Upload Button Always Shows Label | Remove `d-none d-sm-inline` from the "Upload" button text on the Documents page — it's the primary CTA on a sparse page and should always display its label | ☐ |
| 009 | File Input `accept` Attribute | The upload dialog's `v-file-input` uses `accept="*/*"` but the hint says "PDF, Word, Excel, images". Set `accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"` to match | ☐ |
| 010 | Password Visibility Toggle | Add a show/hide password toggle (`mdi-eye` / `mdi-eye-off` append-inner-icon) to the password fields on Login and Signup | ☐ |
| 011 | Signup `autocomplete` Attributes | Add `autocomplete="new-password"` to both password fields and `autocomplete="username"` to the display name field on the Signup form | ☐ |
| 012 | Replace Readonly Notes Textarea | The Notes field on Character View is a `readonly v-textarea` — looks editable but isn't. Replace with a `v-card-text` or `<p>` display element | ☐ |
| 013 | Document List Dividers | Add the `divided` prop to `v-list` on the Documents page to render `v-divider` between items, improving row separation as the list grows | ☐ |
| 014 | Delete Dialog `role="alertdialog"` | The delete confirmation dialog renders as `role="dialog"`. Change to `role="alertdialog"` on the `v-card` to signal urgency to screen readers (WCAG 2.1 AA) | ☐ |
| 015 | Progress Linear `aria-label` | Add `aria-label="Loading documents"` to the `v-progress-linear` on the Documents page | ☐ |
| 016 | Feedback form | Add another link in the avatar dropdown that takes the user to a feedback form page where they can flag the submission as a 'comment', 'bug fix', 'feature request' | ☐ |
| 017 | Feedback database | Initialize a database to store the submitted forms | ☐ |
| 018 | Admin Dashboard | Create an admin page where i can see the submitted feedback by categories | ☐ |