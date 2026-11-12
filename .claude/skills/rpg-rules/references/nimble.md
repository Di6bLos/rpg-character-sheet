# Nimble: rules reference

Sources: Core Rules (CR), Heroes (H), Creator's Kit (CK). Pages are printed pages. The table-side rules are already implemented in `utils/nimblePlay.ts` and the creation and level-up rules in `utils/nimbleBuild.ts`. When behaviour matters, read the code rather than restating it.

## Core math (CR)

- **Stats**: STR, DEX, INT, WIL (`NimbleStat`). Each class has a key stat pair (`ClassDef.keyStats`). Hero DCs are `10 + KEY` (CR 8).
- **Saves**: each hero has 1 advantaged save, 1 disadvantaged and 2 neutral (`saveAdv` / `saveDis`). A 1 always fails and a 20 always succeeds (CR 8).
- **Skills**: d20 + skill; the maximum skill bonus is +12. Sample DCs: 8 easy, 12 medium, 15 challenging, 18 very difficult, 20+ extreme (CR 8).
- **Advantage / disadvantage** apply to _any_ dice: roll one extra die of that type per instance and drop the lowest (or highest). Instances cancel one for one (CR 9).
- **HP and dying** (CR 9): at 0 HP you gain 1 Wound and the Dying condition. While Dying you have 1 action and no Concentration; attacking or casting causes 1 Wound unless you pass a DC 10 STR save; taking damage causes 2 Wounds (3 on a crit). **6 Wounds = death** (ancestry and background can change the maximum).
- **Hit Dice**: the maximum equals your level. Catch Breath (10 min) = roll HD + STR each. Make Camp (8 h) = maximum value + STR each (CR 16).
- **Rests**: a **Safe Rest** restores all HP, HD, mana and class resources, and heals 1 Wound. **Field Rests only restore HP.** No ability ever recharges on a Field Rest (CR 16; CK 8).
- **Actions**: 3 per turn. Initiative sets the actions in round 1 (single digit = 1, two digits = 2, 20+ = 3). Heroic reactions cost 1 action and each is limited to 1/round: Defend (reduce damage from one attack by your Armor), Interpose (within 2 spaces), Opportunity Attack (at disadvantage; heroes only), Help (CR 14). Actions can be spent across turns while you keep Concentration (CR 15).
- **Monsters and armor** (CR 15): unarmored monsters take full damage. **Medium armor ignores damage modifiers (dice only); Heavy armor halves the dice and ignores modifiers.** Crits and vulnerabilities ignore monster armor. **Minions** die to any damage, cannot crit, attack together and are Defended as one attack.

## Level cadence (CK 7–8)

| Lvl | Framework feature                            | Lvl | Framework feature                                      |
| --- | -------------------------------------------- | --- | ------------------------------------------------------ |
| 1   | Simple taste of the class (no extra choices) | 11  | Subclass                                               |
| 2   | More fully fledged; utility ability          | 12  | Key stat increase, cool choice                         |
| 3   | **Subclass**                                 | 13  | Passive buff, secondary stat increase                  |
| 4   | Key stat increase, cool choice               | 14  | Cool choice                                            |
| 5   | Secondary stat increase, damage increase     | 15  | Subclass capstone                                      |
| 6   | Cool choice                                  | 16  | Key stat increase, cool choice                         |
| 7   | Subclass                                     | 17  | Secondary stat increase, ability boost                 |
| 8   | Key stat increase, new core ability          | 18  | Big iconic improvement                                 |
| 9   | Secondary stat increase, cool choice         | 19  | **Epic Boon**                                          |
| 10  | Improve the level 5 feature                  | 20  | Capstone (and +1 to any 2 stats in the repo's classes) |

Full casters gain a new spell tier every other level; half casters gain them more slowly. Over levels 1–20 a hero should pick roughly ½ to ⅔ of a class's pool options. **Treat this table as a sanity check, not as truth.** Real classes deviate from it, and the class's own table in Heroes always wins.

## Hero curve (CK 10): the balance yardstick

| Lvl | HP  | Armor | Effective HP | Dmg/turn | Lvl | HP  | Armor | Effective HP | Dmg/turn |
| --- | --- | ----- | ------------ | -------- | --- | --- | ----- | ------------ | -------- |
| 1   | 15  | 5     | 32           | 10       | 11  | 79  | 17    | 140          | 36       |
| 2   | 21  | 7     | 45           | 12       | 12  | 86  | 18    | 150          | 39       |
| 3   | 28  | 9     | 60           | 14       | 13  | 92  | 19    | 160          | 42       |
| 4   | 34  | 10    | 70           | 16       | 14  | 99  | 20    | 170          | 45       |
| 5   | 41  | 11    | 80           | 18       | 15  | 105 | 22    | 182          | 48       |
| 6   | 47  | 12    | 90           | 21       | 16  | 112 | 24    | 196          | 51       |
| 7   | 54  | 13    | 100          | 24       | 17  | 118 | 26    | 209          | 54       |
| 8   | 60  | 14    | 110          | 27       | 18  | 125 | 28    | 223          | 57       |
| 9   | 67  | 15    | 120          | 30       | 19  | 131 | 30    | 236          | 60       |
| 10  | 73  | 16    | 130          | 33       | 20  | 137 | 34    | 256          | 64       |

Effective HP assumes 1 defensive action per turn (Armor × rounds). Damage per turn assumes 2 offensive actions. **A standard encounter lasts 3–4 rounds; a legendary one lasts ~15 hero turns to reach the Last Stand.**

## Spells (CK 21; CR 44–53)

- Typical Range is 8 (just beyond a 6-space move). A shorter Range needs a benefit and a longer one a drawback.
- Cantrips cost 1 action; tiered spells usually cost 2. Reaction or non-damaging spells can cost 1; ranged AoE costs 3.
- **Average damage per tier**: cantrip 6 · T1 14 · T2 23 · T3 33 · T4 44 · T5 56 · T6 69 · T7 83 · T8 98 · T9 114. Above the average needs a drawback; below it needs utility.
- Schools: fire, ice, lightning, wind, radiant, necrotic (`SpellSchool`). Each has a flavour: radiant uses Reach and supports allies; wind uses d4s, is Vicious and moves things; ice defends and controls.
- No class except the Mage gets 3 schools and deals damage mainly through mana (CK 8).

## Monster design (CK 11–18)

Per-level monster numbers come from the **GM's Guide** and are transcribed in `data/nimble/monsters.ts`: the Monster Builder (HP by armor, damage per round, sample dice, save DC; p. 29), the Legendary Monster Builder (by party level; p. 43) and minion die sizes (p. 26). Encounters: total monster levels = total hero levels is Hard; under half is Easy; 150%+ is Very Deadly; 1–4 monsters per hero (pp. 25–26). Each special ability costs one row of HP or damage. `utils/npcBudget.ts` turns them into the AI generator's targets and checks drafts.

- Monster groups share one simple flavour ability (goblins laugh when you miss). They span a wide level band (Kobolds 1/3–1, Bandits 1/3–4).
- Roles: Melee, Ranged, Controller, Support, AoE, Summoner, Striker, Ambusher, Defender.
- Each monster has 1 action, or 1 clearly _best_ action. Attacks that fight together use the same die size (Troll Claw 1d4+10 / Bite 1d4+20).
- Use attack effects to make monsters different: Automatic, On Hit, On Damage, On Crit/Miss, On Death.
- **Avoid**: monsters that heal, kiting, complex individual monsters, statblocks that are too verbose or too terse.
- Statblock format: `Name` / `Lvl N, size | armor (–/M/H) | speed` / one or two bullet actions / flavour ability. Example: "Goblin Taskmaster, Lvl 2, small | M | 30. Meat Shield… • Stab. 1d6+2 (or Shoot, Range 8)…" (CK 13).
- GM guidance sections (CK 16): Lore, Loot, Premade Encounters, Increasing and Decreasing the Difficulty, Names, What to Say in Combat, Defeat/Parley.
- **Legendary** (CK 17–18): ~15 hero turns to the Last Stand; Bloodied and Last Stand phases shift the tide; Medium armor is recommended. **HP multiplier vs unarmored: Medium ×0.8, Heavy ×0.6.** Give it a script (opening, crit, bloodied, last stand, death lines).

## How the repo encodes Nimble

Types live in `data/nimble/types.ts`. Data: `data/nimble/classes/<slug>.ts` (one per class, plus `shared.ts` helpers `inc`, `poolChoice`, `CAPSTONE_STATS`, `EPIC_BOON`, `tierNote`), `spells.ts`, `ancestries.ts`, `backgrounds.ts`, `core.ts` (stat arrays, weapons).

- `ClassDef.levels[n]: LevelDef`: `abilities` (a name ending in `(n)` upgrades the earlier ability with the same base name), `choices` (`ChoiceDef` with a `ChoiceSource`: pool / utility / utilitySchool / school / spell / text), `statIncrease`, `subclassChoice`, `spellTier`, `schools`, `grantUtility`, `spells.learn/lose`, `resourceDie`, `hitDie`, `hpBonus`, `speed`, `woundsMax`, `notes` (dialog only).
- `SubclassDef.levels` merges into the class levels. Story subclasses (`story: true`) replace the current subclass and may carry `intro`, `introChoices`, `introSpells`, `replacesAbilities`, `poolSwap`, `utilityExtra`.
- `ClassDef.resource: ResourceDef` drives the resource panel (`sheetResource()`); `abilityCounters()` in `utils/nimblePlay.ts` reads use limits ("1/encounter", "WIL times/Safe Rest") from ability text. Write limits in that wording so the counters pick them up.
- Every class data file starts with a citation comment: `// Nimble Heroes, <Class> (pp. a–b).`
