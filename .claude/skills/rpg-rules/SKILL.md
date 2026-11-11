---
name: rpg-rules
description: Shared rules knowledge for Lantern's game systems (Nimble now; D&D 5e and Pathfinder 2e later). Covers core math, level cadence, monster and spell budgets, where each rule lives in the source books, and what content may be committed under each license. Load it before transcribing, auditing, designing homebrew, or converting content between systems.
---

# RPG rules reference

Read only the reference file you need:

| File                      | When                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `references/books.md`     | Finding a rule in a source PDF; turning a printed page into a PDF page; citing pages                   |
| `references/licensing.md` | Before committing any transcribed text, and before using anything visual from a book                   |
| `references/nimble.md`    | Nimble math: hero curve, level cadence, spell damage, monster design, and how the repo encodes classes |
| `references/dnd5e.md`     | D&D 5e (stub until that system is data-driven)                                                         |
| `references/pf2e.md`      | Pathfinder 2e (stub until that system is data-driven)                                                  |

Ground rules for everything built on this skill:

1. **The book is the source of truth, the repo is the encoding.** Rules live in the books (`.local/`, gitignored); the typed data in `data/<system>/` is the encoding. When they disagree, quote the book with a page number. Don't "fix" either one from memory.
2. **Cite pages** as printed page numbers in the house format: `// Nimble Heroes, Berserker (pp. 6–11).`
3. **Never use art** from any book (see `licensing.md`).
4. **Numbers in these references that say "derived"** are our own heuristics, not book rules. Label them that way wherever they're used.
