---
name: system-converter
description: Convert a spell, monster, character, class feature or item between Nimble, D&D 5e and Pathfinder 2e, keeping its intent and rebalancing it to the target system's math. Every conversion ends with an explicit list of judgement calls. Use for "convert this 5e spell to Nimble", "what would my Nimble Berserker look like in PF2e", "port this monster to 5e".
---

# System converter

1. **Load `rpg-rules`** and the reference for both systems. If either is still a stub (5e/PF2e), say so and convert from the open SRD/ORC math you know, marking each such number as "unverified".
2. **Read the source content in full.** If it comes from a book, get it with `source-extract`. Note the source's license (`licensing.md`). Converting own-book content is fine for private use, but the output inherits the restriction: say so in the output header.
3. **Capture its intent** in one sentence: the role, the fantasy, and the one thing it must still do after conversion.
4. **Convert with the tables** in `references/mappings.md`: stats, action economy, damage, level/tier, defenses, conditions, durations.
5. **Rebalance to the target's yardstick, not the source's numbers.** Use the target's damage-per-tier, monster budget or level framework, and show the check (e.g. "Nimble T3 average 33; converted Fireball deals 6d6+INT ≈ 21+3 over an AoE → OK for 3 actions").
6. **Respect the target's design rules.** Nimble, for example: no Field Rest recharges, no healing monsters, one clear best action, use limits written as `1/encounter`.

## Output

Markdown in the same format as `homebrew/` (see the `homebrew-designer` agent), saved to `homebrew/<target-system>/<slug>.md` unless the user only wants it inline. Always end with:

```markdown
## Judgement calls

- <what had no direct equivalent and what was chosen instead, with the reason>

## Source

<Book/URL, page> · license: open | own-book (private use only)
```

If the converted content should become app data (e.g. a spell in `data/nimble/spells.ts`), hand off to `source-extract` step 3. Don't write data files from here.
