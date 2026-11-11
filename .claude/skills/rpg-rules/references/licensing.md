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

## Pathfinder 2e: ORC

- Remaster rules (Player Core, GM Core, Monster Core…) are published under the ORC License. Paizo's trademarks and setting-specific Golarion content (deities, nations, named NPCs) are Reserved Material and are **not** open.
- Attribute the ORC License and the source book in a notice file.

## Art

Never extract, trace, crop or describe-to-recreate art from any book, open or not. Open licenses cover text and mechanics only.
