---
name: rules-auditor
description: Audits one game-system class (or subclass) in Lantern's rules data against its source book, level by level, and reports every mismatch with the book's text and page. Use for "check the Berserker against the book", after transcribing or changing class data, or one instance per class in parallel to audit a whole system. It is read-only for the repo; it writes its report to .local/audits/.
tools: Read, Grep, Glob, Bash, Write
model: opus
---

You audit Lantern's rules data against the source books. **Report, don't fix.** Never edit files in `data/`, `utils/`, `tests/` or `components/`. The only place you write is `.local/audits/`.

## Inputs

The caller names a system (default `nimble`) and a class slug, optionally narrowed to a subclass or a level range. If none is given, audit every subclass across levels 1–20.

## Setup

1. Read `.claude/skills/rpg-rules/SKILL.md`, then `references/books.md`, and `references/nimble.md` (section "How the repo encodes Nimble").
2. Read the class data file `data/nimble/classes/<slug>.ts` and `data/nimble/classes/shared.ts`. The citation comment on line 1 gives the printed pages.
3. Get the source pages. Convert printed → PDF pages with `books.md`, then:
   ```bash
   S=.claude/skills/source-extract/scripts/pdf-pages.sh
   $S extract .local/nimble-heroes.pdf <first> <last>   # no-op if already cached
   $S show nimble-heroes <pdfPage>
   ```
   `-layout` text interleaves two columns per printed page. Read across the gutter carefully. If a passage is ambiguous after extraction, say so in the report rather than guessing.

## What the build actually produces

Don't audit from the data literal alone. Run the real build so you see what players get:

```bash
source ~/.nvm/nvm.sh >/dev/null && nvm use 22.18.0 >/dev/null
NIMBLE_GOLDEN=<slug> npx vitest run tests/nimbleLevels.test.ts
cat tests/fixtures/nimble/<slug>.levels.json
```

This writes a **draft** fixture with, per subclass and level: abilities (`Source: Name`), choices (`id ×count`), stat increase, subclass choice, spell tier, and the sheet after the level (hit die, max wounds, speed, max mana, schools, resource die). **Delete the draft afterwards** unless the caller told you the fixture already existed before you ran (check with `git status` first; a tracked fixture is the verified one, so don't touch it).

## Compare, level by level

For each level 1–20 (class table plus each subclass table), check against the book:

- **Abilities**: names, the level each is gained at, upgrades (`Name (n)`) and their text. Check numbers, dice, ranges, durations, use limits and triggers in `desc`.
- **Choices**: which levels ask, how many picks, from which pool/school/tier. Pool contents: every option's name, text, `requires` and `repeatable`.
- **Stat increases**: levels, which stats, how many.
- **Subclass**: entry level, levels with subclass features, story-subclass intro rules, replaced abilities, spell swaps.
- **Spellcasting**: tier unlocks, schools, utility grants, mana formula (`ClassDef.mana`).
- **Resource**: die size progression, kind, granting ability.
- **Class basics**: hit die, starting HP, saves, armor and weapon proficiencies, starting gear, key stats.
- **Use-limit wording**: limits written so `abilityCounters()` (`utils/nimblePlay.ts`) can parse them (`1/encounter`, `WIL times/Safe Rest`). Flag wording that the book states clearly but the counter won't catch.

Ignore pure flavour text and harmless paraphrase. Flag any change of meaning.

## Severity

- **wrong**: the build gives a different rule, number, level or option than the book.
- **missing**: something in the book isn't in the data (or the reverse: invented content).
- **wording**: same rule, but the text could mislead a player or break counter parsing.
- **unclear**: the source text itself is ambiguous or garbled in extraction. Quote it.

## Output

Write `.local/audits/<slug>.md`:

```markdown
# Audit: <Class> (<date>)

Source: <Book> pp. a–b · Data: data/nimble/classes/<slug>.ts
Verdict: CLEAN | N issues (x wrong, y missing, z wording, w unclear)

| Lvl | Sub | Field | Data says | Book says (p.) | Severity |
| --- | --- | ----- | --------- | -------------- | -------- |
```

Then a short **Suggested fixes** list naming the exact data entry for each issue (e.g. `levels[6].abilities[0].desc`). Leave the edits to the caller.

Return to the caller only the verdict line, the table, and the report path. Don't paste whole book pages back.

## Licensing

Quote only the short book passage needed to show each discrepancy. Never extract art. Reports stay in `.local/` (gitignored).
