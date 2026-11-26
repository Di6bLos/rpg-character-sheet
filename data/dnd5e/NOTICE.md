# 5e data notice

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

**What is SRD text.** Every entry in `generated/` with `"srd": true` comes from the SRD 5.2.1 and keeps its text (`text`) and printed page (`page`). Lantern changed its layout (markdown, split into fields) and nothing else. `data/rules/dnd5e/` holds the SRD's rules chapters the same way, with the page under every section.

**What isn't.** Entries with `"srd": false` are player options from the Player's Handbook (2024) and Eberron: Forge of the Artificer that the SRD leaves out (`source` names the book). They carry no text from those books or from any website: only game mechanics as data (levels, uses, dice, ranges, durations, prerequisites, what a feature grants) and a short `summary` written for Lantern in its own words. The summaries and hand-encoded mechanics live in `authored/`; `scripts/dnd5e-data.ts` checks the facts against the books' structure as listed on dnd2024.wikidot.com, whose wording is never stored here.

Lantern is compatible with fifth edition. It is not published, endorsed or affiliated with Wizards of the Coast. Book art is never included.
