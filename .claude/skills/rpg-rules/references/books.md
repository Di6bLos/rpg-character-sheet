# Source books

PDFs live in `.local/` (gitignored, never committed). Cache and search them with
`.claude/skills/source-extract/scripts/pdf-pages.sh` (see the `source-extract` skill).

## Page numbering

Some PDFs are two-page **spreads**: one PDF page holds two printed pages. Citations in the repo always use **printed** pages.

| Book                     | File                        | Cache slug       | Layout  | Printed page → PDF page | License                           |
| ------------------------ | --------------------------- | ---------------- | ------- | ----------------------- | --------------------------------- |
| Nimble Core Rules        | `.local/core-rules.pdf`     | `core-rules`     | spreads | `floor(p / 2) + 1`      | Nimble 3PCL                       |
| Nimble Heroes            | `.local/nimble-heroes.pdf`  | `nimble-heroes`  | spreads | `floor(p / 2) + 1`      | Nimble 3PCL                       |
| Nimble Creator's Kit 1.2 | `.local/CreatorsKit1.2.pdf` | `CreatorsKit1.2` | single  | same                    | Nimble 3PCL (guidance, not rules) |

The PDF → printed direction on spreads: PDF page `n` holds printed pages `2n−2` (left) and `2n−1` (right). The printed number sits on the page's footer line.

## Where things are (printed pages)

**Core Rules**: character creation 18–21 · ancestries 22–27 · backgrounds 28–29 · equipment 32–36 · spells 44–53 · combat, heroic reactions, monsters & armor, minions 14–15 · conditions ~10–11 · dying & wounds ~8–9 · rests ~16–17 · license 56–57.

**Heroes**: Berserker 6–11 · Cheat 12–17 · Commander 18–23 · Hunter 24–29 · Mage 30–35 · Oathsworn 36–41 · Shadowmancer 42–47 · Shepherd 48–53 · Songweaver 54–59 · Stormshifter 60–65 · Zephyr 66–71 · story subclasses: Oathbreaker 74–75, Spellblade 76–77, Reaver 78–79, Beastmaster 80–81.

**Creator's Kit** (single pages): fiddliness and conditions 3–6 · designing classes and the level framework 7–9 · average hero stats 10 · designing monsters 11–16 · legendary monsters 17–18 · magic items 19–20 · spell framework and average spell damage 21–22 · adventures 23–24 · license 2.

Entries marked `~` were found by keyword search; confirm them before citing.

## Adding a book

1. Put the PDF in `.local/<file>.pdf` (for 5e/PF2e, prefer `.local/<system>/…`).
2. Run `pdf-pages.sh extract <pdf>`. Check a footer to see whether it's spreads.
3. Add a row above, with its license (open vs own-book; see `licensing.md`).
