# Copilot Instructions --- Bebop Theme

## Architecture

All work is scoped exclusively to `wp-content/themes/bebop/`. Never edit outside this directory.

Key directories:

- `acf-blocks/` — ACF block templates (one folder per block)
- `inc/` — Theme functions: `acf-blocks.php`, `blocks-list.php`, `template-tags.php`, `template-functions.php`
- `sass/` — Sass source; compiled to `css/` via npm
- `js/` — Vanilla JS, enqueued via `functions.php`
- `theme.json` — Design tokens (colors, spacing, typography)
- `sass/utilities/_variables.scss` — Sass variables mapped from `theme.json`

Scoped rules by file type live in `.github/instructions/`.

------------------------------------------------------------------------

## Build and Test

Requires Node 22.18.0. Run from `wp-content/themes/bebop/`.

```bash
npm install          # Install dependencies
npm run dev          # Watch: compiles sass/style.scss → css/style.css and sass/editor/editor.scss → css/editor.css
npm run build        # One-time build of both stylesheets
```

No automated tests. Validate by loading pages in the browser via Lando (`lando start` from repo root).

------------------------------------------------------------------------

## Formatting

- Tabs indentation (tab width: 4)
- Opening brace on the same line as the selector, declaration, or statement
- Closing brace on its own line
- One statement or declaration per line
- Blank line between distinct blocks or logical sections

------------------------------------------------------------------------

## Forbidden

- DO NOT: Hardcode colors or inline styles
- DO NOT: Output unescaped values
- DO NOT: Add third-party libraries
- DO NOT: Modify theme structure or architectural patterns
- DO NOT: Support `alignwide`/`alignfull` unless explicitly requested
- DO NOT: Edit any file outside `wp-content/themes/bebop/`
- DO NOT: Modify WordPress core behavior
