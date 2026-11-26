# Licensing: what may be committed

Lantern is a public app. Every piece of transcribed content has to be one of:

| Class        | Examples                                                                                                                                             | May be committed?                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Open**     | D&D SRD 5.2 (CC-BY-4.0); Pathfinder 2e remaster content under ORC (e.g. as published on Archives of Nethys); Nimble books under the 3PCL (see below) | Yes, with the required attribution                                                                              |
| **Own-book** | Any other book the user owns (non-SRD 5e books, non-ORC PF2e books)                                                                                  | **No.** Use it locally for audits and private play. Flag it, and never commit it without the user's explicit OK |

If you can't tell which class a source belongs to, treat it as own-book and ask.

## Nimble 3rd Party Creator License (Creator's Kit p. 2; Core Rules / Heroes final page)

- You may use and reference the books' text in original products (classes, subclasses, monsters, supplements…). Copying large portions **verbatim with little added value** doesn't count as an original product. Lantern adds value (an interactive sheet, level-up automation), but keep descriptions tight rather than pasting whole pages.
- **No Nimble art or logo.** Only the Nimble compatibility logo (nimbleRPG.com/creators) is allowed. That's why class "portraits" are original SVG sigils in `components/nimble/Sigil.vue`.
- The product must not appear official or endorsed by Nimble Co.
- **Required attribution:** "[Product Name] is an independent product published under the Nimble 3rd Party Creator License and is not affiliated with Nimble Co. Nimble © 2025 Nimble Co."
- Data file header already used in the repo (`data/nimble/types.ts`): "transcribed from the Nimble Core Rules and Heroes books (Nimble © 2025 Nimble Co., referenced under the Nimble 3rd Party Creator License). Art from the books is never used."

## D&D 5e: SRD 5.2 (CC-BY-4.0)

- Only content that appears in the SRD 5.2 document is open. Most subclasses, many spells, and named setting content (e.g. Beholders, Mind Flayers) are **not** in it.
- Attribution, required in any product using it: "This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode."
- Don't use "Dungeons & Dragons" or "D&D" as branding; "5e" or "compatible with fifth edition" is the safe wording.
- The SRD 5.2.1 asks for its own wording of the attribution (its Legal Information page); `data/dnd5e/NOTICE.md` and `data/rules/index.ts` use it.
- **Non-SRD player options are the one exception the user approved (2026-11-25)**: every 2024 player option (Player's Handbook 2024, and the Artificer from Eberron: Forge of the Artificer; extended below) may be in the app as **mechanics plus an original summary, never the books' text**. In `data/dnd5e/` such an entry has `srd: false`, `source` set to its book, no `text`, its mechanics as fields (level, uses, recharge, dice, DCs, ranges, durations, prerequisites, what it grants) and a `summary` written from scratch in Lantern's own words: clearly shorter than and different from the source, not a light edit of its sentences. SRD entries keep their SRD text with `srd: true` and a `page`. Two tests hold the line (`tests/dnd5eData.test.ts`): every `srd: true` entry is on the SRD allowlist built from the SRD PDF (`data/dnd5e/srd-allowlist.json`), and no `srd: false` entry's prose (anything but its stat lines and item lists: casting-time triggers, material components, starting gear) shares a run of 8 or more words with the wiki page it was checked against (`.local/dnd5e/wikidot/`, skipped when the cache is absent). The wiki's pages and the books' PDFs stay in `.local/`. **Extended (2026-11-26)**: the user approved the same treatment for the player options of every official Wizards of the Coast / D&D Beyond 2024-rules publication: Eberron: Forge of the Artificer (feats, backgrounds, species, items too), Forgotten Realms: Heroes of Faerûn, Astarion’s Book of Hungers, Lorwyn: First Light, Ravenloft: The Horrors Within, Arcana Unleashed, Project Lamordia, World of Warcraft and the monthly D&D Beyond Drops. `data/dnd5e/sources.ts` lists them with their release month; a reprint (the same page naming two books) takes the latest as `source` and lists all in `sources`, and two books' different options with one name get distinct slugs. Still not covered: Unearthed Arcana and other playtests, homebrew, third-party books, and the Dungeon Master's Guide and adventure books (Arcana Unleashed: Deadfall, Icecrown Citadel, Adventures in Faerûn…); ask before adding them.

## Pathfinder 2e: ORC

- Remaster rules (Player Core, GM Core, Monster Core…) are published under the ORC License. Paizo's trademarks and setting-specific Golarion content (deities, nations, named NPCs) are Reserved Material and are **not** open.
- Attribute the ORC License and the source book in a notice file.
- **Deities are the one exception the user approved (2026-11-24)**: `data/pf2e/generated/deities.json` is Reserved Material kept under Paizo's **Community Use Policy** (paizo.com/licenses/communityuse). That policy covers free, non-commercial fan tools only and requires its notice (in `data/pf2e/NOTICE.md`, and shown wherever deities are). If Lantern ever charges for access, the deity data has to come out. Don't extend this to other Reserved Material without asking.
- **Setting material stays out (user's decision, 2026-11-24)**: what Lantern shares (the committed data, the ORC bible and its library PDFs) takes entries only from the setting-neutral rulebooks in `OPEN_BOOKS` (`scripts/lib/aon.ts`), never from the Lost Omens line, Adventure Paths and their player's guides, adventures or Society scenarios, and leaves out any entry named for a deity, place, people or organization of Golarion (`GOLARION_NAMES` plus every deity name; `settingName`). Archetypes are judged the same way from their own record (`closedArchetypes`): a setting or legacy-only archetype's feats go, and its name comes off the Archetype lines and `archetypes` of the feats that stay. A book not on the list is setting until someone checks it. Golarion names inside an open rulebook's rules text stay as printed.

## Art

Never extract, trace, crop or describe-to-recreate art from any book, open or not. Open licenses cover text and mechanics only.
