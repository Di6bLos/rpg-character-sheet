# Commit Message Instructions — 50/72 Rule

Commit messages must follow the **50/72 rule**:

- **Title**: max **50 characters**
- **Body**: max **72 characters per line**
- **Blank line** must separate the title from the body

---

## Format

```
TAG: Short title, max 50 chars
#--------------------------------------------------

Body description — explain why, not how.
Wrap at 72 characters. Link to issue if relevant.
#---------------------------------------------------------------------
```

---

## Tags

Use one tag prefix per commit:

| Tag | When to use |
|-----|-------------|
| `FEAT` | New feature or functionality |
| `BUG` | Bug fix |
| `CHG` | Change that is not a refactor or copy change |
| `REFAC` | Refactors existing code without changing functionality |
| `PERF` | Performance improvement |
| `DATA` | Data-only changes (e.g. seed files) |
| `TOOL` | Developer/tooling changes; no direct user impact |
| `COPY` | Text/copy changes only |
| `DOC` | Documentation changes |
| `SPEC` | Test or spec changes |
| `WIP` | Work in progress — use sparingly |

---

## Rules

- Write the title as a completion of: *"If applied, this commit will…"*
- Describe **why**, not how — the diff shows the how
- Do not exceed 50 chars in the title or 72 chars per body line
- Always leave a blank line between title and body
- One blank line between title and body is enough for git to separate them correctly in `git log`
