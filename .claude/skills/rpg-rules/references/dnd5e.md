# 5e (2024 rules): rules reference

Source: the System Reference Document 5.2.1 (CC-BY-4.0, see `licensing.md`), `.local/dnd5e/SRD_CC_v5.2.1.pdf`. Its PDF page numbers equal its printed ones, so cite `SRD 5.2.1 p. N`. The same text, by topic, is in `data/rules/dnd5e/` (the Library's Rules tab). Player's Handbook (2024) and Forge of the Artificer options the SRD lacks are mechanics plus Lantern's own summaries only; their rules are on dnd2024.wikidot.com (cached in `.local/dnd5e/wikidot/`), never quoted.

## Core math

- **Ability modifier** = floor((score − 10) / 2); scores run 1–30, and 20 is the usual cap for a character (SRD pp. 5–6).
- **D20 Test**: d20 + modifiers against a DC or AC. Advantage / Disadvantage: roll two d20s and keep the higher / lower; any number of each cancel to a single roll (pp. 6–7). On an attack roll a natural 20 hits and is a Critical Hit, a natural 1 misses (p. 7).
- **Proficiency Bonus** by character level: +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20) (Character Advancement table, p. 23). It's added once to a roll, never twice (p. 8); Expertise doubles it for that skill (p. 182).
- **Save DC** of a spell = 8 + spellcasting ability modifier + Proficiency Bonus; spell attack = that modifier + PB (p. 106). Features use 8 + an ability modifier + PB likewise.
- **Armor Class**: 10 + DEX unarmored, or the armor's formula; only one base AC calculation applies at a time (p. 7).
- **Initiative** is a Dexterity check; a surprised combatant has Disadvantage on it (p. 13).
- **Critical Hit**: roll the attack's damage dice twice, add modifiers once (p. 16).

## Character advancement

| Level | XP     | PB  |     | Level | XP      | PB  |
| ----- | ------ | --- | --- | ----- | ------- | --- |
| 1     | 0      | +2  |     | 11    | 85,000  | +4  |
| 2     | 300    | +2  |     | 12    | 100,000 | +4  |
| 3     | 900    | +2  |     | 13    | 120,000 | +5  |
| 4     | 2,700  | +2  |     | 14    | 140,000 | +5  |
| 5     | 6,500  | +3  |     | 15    | 165,000 | +5  |
| 6     | 14,000 | +3  |     | 16    | 195,000 | +5  |
| 7     | 23,000 | +3  |     | 17    | 225,000 | +6  |
| 8     | 34,000 | +3  |     | 18    | 265,000 | +6  |
| 9     | 48,000 | +4  |     | 19    | 305,000 | +6  |
| 10    | 64,000 | +4  |     | 20    | 355,000 | +6  |

_SRD 5.2.1 p. 23._

- **Hit Points**: level 1 is the Hit Die's maximum + CON; each later level, roll the Hit Die (or take the fixed value: d6 4, d8 5, d10 6, d12 7) + CON, minimum 1 (p. 23).
- **Class table shape** (every class, pp. 28–82): subclass at level 3; Ability Score Improvement (the feat of that name, or another feat you qualify for) at 4, 8, 12 and 16, plus 6 and 14 for the Fighter and 10 for the Rogue; Epic Boon at 19; a capstone at 20. The data reads these from each class table (`asiLevels`, `subclassLevel`, `epicBoonLevel`).
- **Origins** (pp. 83–86): a background gives +2/+1 or +1/+1/+1 among its three abilities (none above 20), an Origin feat, two skills, a tool and an equipment choice; a species gives traits only.
- **Multiclassing** (pp. 24–26): you need 13+ in the primary ability of your current class and of the new one. The new class gives only the multiclass traits of its Core Traits table. Spell slots combine on the Multiclass Spellcaster table: full casters count all their levels, Paladins and Rangers half (rounded up); Pact Magic stays separate.

## Spellcasting

- Spell levels 0 (cantrips) to 9. A spell cast from a higher slot follows its "Using a Higher-Level Spell Slot" text; cantrips grow at character levels 5, 11 and 17 ("Cantrip Upgrade") (p. 104).
- **One spell with a slot per turn**: on a turn you can expend only one spell slot to cast a spell (p. 105).
- **Concentration** ends if you cast another Concentration spell, have the Incapacitated condition or die; taking damage calls for a CON save, DC 10 or half the damage, up to DC 30 (p. 179).
- **Rituals**: a prepared spell with the Ritual tag can be cast as a Ritual, taking 10 minutes longer and no slot (p. 187); the Wizard's Ritual Adept casts them from the spellbook unprepared (`spellcasting.ritual`).
- **Slot table** of a full caster, by class level:

| Slot | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12  | 13  | 14  | 15  | 16  | 17  | 18  | 19  | 20  |
| ---- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1st  | 2   | 3   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   | 4   |
| 2nd  | –   | –   | 2   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   |
| 3rd  | –   | –   | –   | –   | 2   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   |
| 4th  | –   | –   | –   | –   | –   | –   | 1   | 2   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   | 3   |
| 5th  | –   | –   | –   | –   | –   | –   | –   | –   | 1   | 2   | 2   | 2   | 2   | 2   | 2   | 2   | 2   | 3   | 3   | 3   |
| 6th  | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | 1   | 1   | 1   | 1   | 1   | 1   | 1   | 1   | 2   | 2   |
| 7th  | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | 1   | 1   | 1   | 1   | 1   | 1   | 1   | 2   |
| 8th  | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | 1   | 1   | 1   | 1   | 1   | 1   |
| 9th  | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | –   | 1   | 1   | 1   | 1   |

_SRD 5.2.1 pp. 25–26 (Multiclass Spellcaster table) and each class table._

- Full casters (Bard, Cleric, Druid, Sorcerer, Wizard) use it at their level; the Paladin and Ranger at half their level rounded up (slots to 5th); so does the Artificer (Forge of the Artificer). The Eldritch Knight and Arcane Trickster have their own tables (to 4th).
- **Pact Magic** (Warlock, pp. 71–72): 1 slot at level 1, 2 from level 2, 3 from 11, 4 from 17; the slot level is 1, then 2 at 3, 3 at 5, 4 at 7 and 5 from 9; the slots come back on a Short or Long Rest. Mystic Arcanum gives one 6th-, 7th-, 8th- and 9th-level spell a day at levels 11, 13, 15 and 17.
- `tests/dnd5eData.test.ts` holds these tables against the data.

## Rests, dying, exhaustion

- **Short Rest**: 1 hour; spend Hit Point Dice, each healing its roll + CON. **Long Rest**: 8 hours; regain all HP and all spent Hit Point Dice, and lose 1 Exhaustion level; one per 24 hours, and an hour of strenuous activity interrupts it (pp. 185–187).
- **Dropping to 0 HP** (pp. 17–18): you die outright if the damage left over equals your HP maximum; otherwise you're Unconscious and make a **Death Saving Throw** at the start of each turn: d20, 10 or more succeeds, three successes stabilize you, three failures kill you; a 1 counts as two failures and a 20 gives you 1 HP. Damage while at 0 HP is a failure (two from a Critical Hit); any healing ends it. A Stable creature regains 1 HP after 1d4 hours.
- **Exhaustion** (2024 rules, p. 181): levels 1 to 6, death at 6. Each D20 Test drops by 2 × the level and Speed by 5 ft × the level. A Long Rest removes one level.
- **Heroic Inspiration** (p. 8): spend it to reroll any die; you either have it or don't.

## Weapons and mastery

- Weapons are Simple or Martial, Melee or Ranged, with properties (Ammunition, Finesse, Heavy, Light, Loading, Range, Reach, Thrown, Two-Handed, Versatile) and one **mastery property** (pp. 89–91), usable only by a character whose feature grants it (Weapon Mastery: Barbarian, Fighter, Paladin, Ranger, Rogue; the Weapon Master feat):
  - **Cleave**: on a melee hit, attack a second creature within 5 ft of the first (no ability modifier to its damage), once per turn.
  - **Graze**: on a miss, deal damage equal to the attack's ability modifier.
  - **Nick**: the Light property's extra attack becomes part of the Attack action, once per turn.
  - **Push**: on a hit, push a Large or smaller creature up to 10 ft away.
  - **Sap**: on a hit, the target has Disadvantage on its next attack roll before your next turn.
  - **Slow**: on a hit that deals damage, the target's Speed drops by 10 ft until your next turn (it doesn't stack).
  - **Topple**: on a hit, a CON save (8 + the attack's ability modifier + PB) or Prone.
  - **Vex**: on a hit that deals damage, Advantage on your next attack roll against it before the end of your next turn.
- **Armor** (p. 92): Light (base + DEX), Medium (base + DEX, at most +2), Heavy (base only; a STR requirement or −10 ft Speed; some give Disadvantage on Stealth checks); a Shield adds +2. Armor you lack training with gives Disadvantage on STR and DEX D20 Tests and stops spellcasting (p. 177).

## Encounters (Gameplay Toolbox, pp. 202–203)

The XP budget is the XP Budget per Character for the party's level and the chosen difficulty (Low, Moderate, High), times the number of characters, spent on monsters by their XP. `data/rules/dnd5e/12-running-encounters.md` holds the table. Monster stat blocks (SRD pp. 254–364) aren't in Lantern's data yet.

## How the repo encodes it

- **Data**: `data/dnd5e/` (`npm run dnd5e:data`, from the SRD PDF and the wiki cache, `npm run dnd5e:fetch`): classes with their full level tables, spellcasting and features; subclasses (the SRD's one per class plus the PHB's other three, and the Artificer's five); species, backgrounds, feats, spells; option groups (Eldritch Invocations, Metamagic, Battle Master maneuvers, Artificer plans); weapons, armor, gear and tools, conditions, weapon masteries and the SRD's magic items. Types in `data/dnd5e/types.ts`; `loadDnd5e(set)` fetches a set.
- **SRD or not**: `srd: true` entries keep the SRD's text and page; `srd: false` ones carry mechanics and a `summary` only, from `data/dnd5e/authored/` (hand-written; never paste book or wiki text there). `tests/dnd5eData.test.ts` checks the SRD allowlist and the 8-word copy rule.
- **Mechanics**: features, traits, feat benefits and options share `Dnd5eMechanics` (activation, uses with recharge, dice, save, grants, choices, named options). `column:Rages`-style values point at the class table. A feature the class table lists again later (Expertise, Metamagic) grants its choices again at that level.
- **Build and level-up**: `utils/dnd5eBuild.ts` (one walk over the levels with the sheet's recorded picks; the builder at `/characters/new/dnd5e`, a Custom background per SRD p. 193) and `utils/dnd5eLevelUp.ts`; golden tables in `tests/fixtures/dnd5e/`. Numbers the data has no column for are constants there (Battle Master maneuvers and dice, Psionic Energy Dice, Lay on Hands' pool). The 5e sheet layouts are still the hand-edited ones (`Dnd5eSheet` in `types/sheets.ts`); the play engine comes next.
