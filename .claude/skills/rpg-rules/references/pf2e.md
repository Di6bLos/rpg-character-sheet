# Pathfinder 2e: rules reference

Remaster rules (ORC License; see `licensing.md`). Pages are printed page numbers: Player Core (PC), GM Core (GMC). Every number below was checked against the book text in the local bible.

## Sources

- **The local rules bible**, `.local/rules/pf2e/` (gitignored), built by `scripts/pf2e-bible.ts` from the Archives of Nethys data in `.local/pf2e/aon/*.json.gz`.
  - Start at its `README.md`. It covers 46.5k entries from every book, legacy included.
  - Topics: `rules/NN-<book>.md` holds each book's rules chapters in book order (core books first). Then `classes/<class>.md` (features, subclasses, every book's class feats, focus spells, kits), `ancestries/<ancestry>.md` (heritages, ancestry feats), `archetypes/`, `feats/`, `spells/`, `equipment/`, `creatures/`, `gm/`, `conditions.md`, `traits.md`, `actions.md`, `skills.md`.
  - Each entry shows its source and page, and is tagged **Remaster (ORC)** (Rage of Elements, Aug 2023, and later) or **Legacy (OGL)**, with the name of what replaced it.
- **Refreshing the data**: the data comes from the search backend 2e.aonprd.com itself uses (`https://elasticsearch.aonprd.com/aon/_search`). Page through each `category` with `sort: [{ 'id.keyword': 'asc' }]` and `search_after`, 1000 entries a request, about one request a second. Fetch from an AoN tab in Chrome, then save the gzipped JSON into `.local/pf2e/aon/` and rerun `node scripts/pf2e-bible.ts`.
- **Legacy (OGL) books** are local-only until the user decides otherwise (`licensing.md`). Golarion names (deities, nations, NPCs) are Reserved Material even in ORC books.

## Core math

- **Proficiency** (PC p. 11):
  - Untrained +0.
  - Trained, expert, master and legendary add your level plus 2, 4, 6 or 8.
  - It applies to AC, attack rolls, Perception, saves, skills and spells.
- **Degrees of success** (PC p. 401):
  - Beating the DC by 10 or more is a critical success. Missing it by 10 or more is a critical failure.
  - A natural 20 moves the result one degree better, a natural 1 one degree worse.
  - A Strike deals double damage on a critical hit.
  - If an effect lists no critical result, the critical result is the same as the normal one.
- **Multiple attack penalty** (PC p. 275):
  - The second attack in a turn takes −5, later attacks −10. The agile trait makes these −4 and −8 (PC p. 282).
  - It applies only on your own turn. Reactions like Reactive Strike don't take it.
- **Actions** (PC p. 9):
  - Three actions on your turn.
  - Free actions don't count toward them.
  - Up to one reaction a round.
  - The steps of a turn are on PC p. 435.
- **Dying** (PC p. 411):
  - You're unconscious while dying, and you die at dying 4.
  - Wounded and doomed change those values. They're described with dying on PC p. 411.
- **Hero Points** (PC p. 413):
  - 1 at the start of each session, 3 at most, and any left are lost at the end of the session.
  - Spend 1 to reroll a check (a fortune effect).
  - Spend all of them (minimum 1) to avoid death: you stabilize at 0 HP and don't gain wounded.
- **Leveling** (PC p. 29): 1,000 XP per level, with XP over 1,000 carried over.
- **Encumbered** (PC p. 269): clumsy 1 and −10 feet to every Speed (no Speed below 5 feet).

## Class advancement shape

From the Fighter's table (PC; the Player Core classes follow this pattern, with their own features added):

| Levels                     | Gains                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| 1                          | Ancestry and background, attribute boosts, initial proficiencies, class feat |
| 2, 4, 6 … 20 (even levels) | Class feat and skill feat                                                    |
| 3, 7, 11, 15, 19           | General feat                                                                 |
| 3, 5, 7 … 19 (odd levels)  | Skill increase                                                               |
| 5, 9, 13, 17               | Ancestry feat                                                                |
| 5, 10, 15, 20              | Four attribute boosts                                                        |

Class feats can be spent on archetypes instead (PC p. 215). An attribute boost that raises CON or INT also changes HP (+1 per level) or adds a trained skill and a language (PC p. 29).

## Spells

- **Ranks** run from 1 to 10. Slots per rank come from each class's spellcasting table (PC p. 297).
- **Heightening** (PC p. 297):
  - A spell cast from a higher-rank slot becomes that rank.
  - A "Heightened (+N)" entry adds its effect for every N ranks above the spell's lowest rank. Fireball, for example, adds 2d6 per rank.
  - Spontaneous casters need the spell known at that rank.
- **Cantrips** (PC p. 298): cast at will, and always heightened to half your level, rounded up.
- **Focus spells** (PC p. 298):
  - Each costs 1 Focus Point. The pool holds as many points as focus spells you know, up to 3; composition cantrips don't count.
  - They heighten like cantrips.
  - The pool refills at daily preparations, and Refocus regains 1 point.

## DCs (GMC p. 52)

Simple DCs: untrained 10, trained 15, expert 20, master 30, legendary 40.

| Level | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12  | 13  | 14  | 15  | 16  | 17  | 18  | 19  | 20  | 21  | 22  | 23  | 24  | 25  |
| ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DC    | 14  | 15  | 16  | 18  | 19  | 20  | 22  | 23  | 24  | 26  | 27  | 28  | 30  | 31  | 32  | 34  | 35  | 36  | 38  | 39  | 40  | 42  | 44  | 46  | 48  | 50  |

Spell-rank DCs, ranks 1–10: 15, 18, 20, 23, 26, 28, 31, 34, 36, 39. Adjust them for uncommon or rare spells.

## Encounters (GMC pp. 75–76)

The budget assumes four PCs. Each additional PC adds the character adjustment; each missing one takes it away.

| Threat   | XP budget  | Per PC more or fewer |
| -------- | ---------- | -------------------- |
| Trivial  | 40 or less | 10 or less           |
| Low      | 60         | 20                   |
| Moderate | 80         | 20                   |
| Severe   | 120        | 30                   |
| Extreme  | 160        | 40                   |

XP per creature, by its level relative to the party level:

| Level relative to party | −4  | −3  | −2  | −1  | 0   | +1  | +2  | +3  | +4  |
| ----------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| XP                      | 10  | 15  | 20  | 30  | 40  | 60  | 80  | 120 | 160 |

## Building creatures (GMC pp. 112–122)

The bible's `rules/03-gm-core.md` has the full tables: Perception, saves, skills, HP, AC, Strike attack and damage, spell DC. Moderate values for a quick check:

| Level | AC (Table 2–5) | HP (Table 2–7) | Strike attack (Table 2–9) | Strike damage (Table 2–10) |
| ----- | -------------- | -------------- | ------------------------- | -------------------------- |
| −1    | 14             | 8–7            | +6                        | 1d4 (3)                    |
| 1     | 15             | 21–19          | +7                        | 1d6+2 (5)                  |
| 3     | 18             | 48–42          | +10                       | 1d8+6 (10)                 |
| 5     | 21             | 78–72          | +13                       | 2d6+6 (13)                 |
| 10    | 29             | 179–171        | +21                       | 2d10+11 (22)               |
| 15    | 36             | 279–271        | +28                       | 3d10+14 (30)               |
| 20    | 44             | 379–371        | +36                       | 4d8+19 (37)                |
| 24    | 50             | 508–492        | +42                       | 4d10+22 (44)               |

## How the repo encodes it

There is no data-driven PF2e yet. Today the app has a hand-edited sheet (`Pf2eSheet` in `types/sheets.ts`, `components/sheet/Pf2eSheet.vue`). Typed data, the builder and the play engine follow the `add-game-system` checklist. Automation will use structured effect data on each feat and spell rather than regexes over rules text.
