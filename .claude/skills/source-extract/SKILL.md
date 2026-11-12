---
name: source-extract
description: Pull rules content (classes, subclasses, spells, ancestries, backgrounds, monsters, items) out of a source PDF in .local/ or a web page, and transcribe it into Lantern's typed data files with page citations and license checks. Use when adding or correcting game data from a book or site, or when an agent needs the source text for a rule.
---

# Source extract

Load the `rpg-rules` skill first. `references/books.md` lists the books and page offsets, and `references/licensing.md` says what may be committed.

## 1. Get the source text

**PDF** (books live in `.local/`, gitignored):

```bash
S=.claude/skills/source-extract/scripts/pdf-pages.sh
$S extract .local/nimble/nimble-heroes.pdf          # cache every page (skips cached ones)
$S search nimble-heroes "Savage Arsenal"     # which PDF pages mention it, with hit counts
$S show nimble-heroes 5                      # print one cached page
```

- The cache lives in `.local/text/<slug>/p###.txt`, where `p###` is the **PDF** page. Nimble's Core Rules and Heroes are two-page spreads. Convert to **printed** pages with `books.md` before citing.
- `pdftotext -layout` keeps the columns side by side, so lines from two columns interleave. Read across carefully, and use the column gutters (runs of spaces) to split them. Tables usually survive intact.
- Text inside sidebars or art captions can land mid-paragraph. Check that every sentence you transcribe makes sense on its own.

**Web**: use the `web-fetch` agent with the full URL and a precise ask ("list every level 1–20 feature of X with its text"). Preferred open sources: Archives of Nethys (PF2e, check that the entry is ORC/remaster), the SRD 5.2 (5e). Record the URL in the citation comment.

## 2. Classify the license

Before writing anything, tag the source as **open** or **own-book** (`licensing.md`).

- Open: transcribe normally, with the attribution header.
- Own-book: write it only where it stays local (`.local/`), **or** stop and ask the user before it goes into `data/`. Never commit own-book text silently.

## 3. Transcribe into the typed data

- Match the system's types exactly (`data/nimble/types.ts` today; `data/<system>/types.ts` later). If the source has a mechanic the types can't express, **stop and propose a type change**. Don't hide the mechanic in `desc` text the build code can't see.
- Start each file (or section) with a citation comment in house style: `// Nimble Heroes, Berserker (pp. 6–11).`
- Keep rules text close to the book, but tight. Drop flavour fluff, and keep every number, limit and trigger. Write use limits in the wording `abilityCounters()` (`utils/nimblePlay.ts`) can parse: `(1/turn)`, `1/encounter`, `WIL times/Safe Rest`.
- Reuse existing helpers (`inc`, `poolChoice`, `CAPSTONE_STATS`, `EPIC_BOON`, `tierNote` in `data/nimble/classes/shared.ts`) instead of new literals.
- Never copy, crop or describe-to-recreate art.

## 4. Check it

```bash
nvm use 22.18.0 >/dev/null
npm run test          # integrity tests catch dangling pool/spell/ability references
npm run type-check
```

Then hand the class or file to the `rules-auditor` agent for a level-by-level check against the same pages. Update the golden fixture (`tests/fixtures/nimble/`) only after the audit comes back clean and the user agrees.
