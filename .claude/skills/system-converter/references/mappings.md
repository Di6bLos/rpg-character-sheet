# Cross-system mappings

Rules of thumb for converting between systems. **These are heuristics**: always rebalance against the target system's yardstick (`rpg-rules` references) and list your choices under "Judgement calls".

## Stats

| Nimble | 5e                       | PF2e       | Notes                                                                                   |
| ------ | ------------------------ | ---------- | --------------------------------------------------------------------------------------- |
| STR    | STR, (CON for toughness) | STR, (CON) | Nimble has no CON: fold it into HP / Hit Dice, and STR saves cover poison and endurance |
| DEX    | DEX                      | DEX        |                                                                                         |
| INT    | INT                      | INT        |                                                                                         |
| WIL    | WIS, CHA                 | WIS, CHA   | WIL covers willpower, perception, presence and charm/fear saves                         |

Score ↔ modifier: Nimble stats are already modifiers (see the stat arrays in `data/nimble/core.ts`). They rise by the level-table increases at 4/5/8/9/12/13/16/17/20. 5e scores convert as `mod = floor((score − 10) / 2)`; PF2e remaster uses modifiers directly (attribute boosts).

## Action economy

| Nimble                                                                                                 | 5e                                            | PF2e                                   |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------- |
| 3 actions per turn, all interchangeable; moving costs an action                                        | Action + Bonus action + Move + Reaction       | 3 actions + 1 reaction                 |
| Heroic reactions (Defend, Interpose, Help, Opportunity Attack) spend next turn's actions, 1/round each | 1 reaction per round                          | 1 reaction per round (more from feats) |
| Cantrip = 1 action; tiered spell = 2; ranged AoE = 3                                                   | Spell = 1 action (some bonus action/reaction) | Most spells = 2 actions; 1–3 variable  |
| Attacks: each attack after the first in a turn has +1 disadvantage                                     | Extra Attack feature                          | MAP −5/−10 (agile −4/−8)               |

A 5e bonus action → Nimble 1 action. A 5e full action spell → 2 actions (3 if it's a ranged AoE). PF2e actions map roughly 1:1 to Nimble actions.

## Level / tier / rank

| Nimble spell tier | 5e spell level | PF2e spell rank | Nimble hero level (full caster gets it) |
| ----------------- | -------------- | --------------- | --------------------------------------- |
| cantrip           | cantrip        | cantrip         | 1                                       |
| T1                | 1              | 1               | 1                                       |
| T2                | 2              | 2               | 3                                       |
| T3                | 3              | 3               | 5                                       |
| T4                | 4              | 4               | 7                                       |
| T5                | 5              | 5               | 9                                       |
| T6                | 6              | 6               | 11                                      |
| T7                | 7              | 7               | 13                                      |
| T8                | 8              | 8               | 15                                      |
| T9                | 9              | 9–10            | 17                                      |

(Nimble column: "full casters gain a new tier every other level" per CK 8. Check the class table.)

Hero levels map 1:1 in all three systems (1–20). Monster level: Nimble level ≈ 5e CR at low levels (1/3 ≈ CR 1/4–1/2) and ≈ PF2e creature level (party level −1 / +0 / +2 for weak / standard / boss). Verify against the target's budget table.

## Damage

- Nimble average spell damage per tier: cantrip 6, T1 14, T2 23, T3 33, T4 44, T5 56, T6 69, T7 83, T8 98, T9 114 (CK 21).
- Nimble attack rolls _are_ the damage roll: a 1 on the Primary Die (the leftmost die) misses, and its max is an exploding crit (roll it again and add; crits ignore monster armor) (CR 12–13). There's no separate attack bonus. So converting a 5e "+5 to hit, 2d6+3" → Nimble "2d6+3", with the miss chance coming from the die.
- 5e and PF2e have to-hit vs AC; Nimble has no AC. **Armor reduces damage instead**: heroes Defend by subtracting Armor, and monsters' M/H armor ignores modifiers or halves dice. When converting _to_ Nimble, a high-AC monster usually becomes Medium/Heavy armor; _from_ Nimble, M → AC +2–3 over the CR norm, H → +4–5.
- Saves: a 5e/PF2e save DC → Nimble `10 + KEY` for heroes; monsters use the stated DC.

## Defenses & HP

- Nimble adds Wounds as a second, slower durability track, and Armor reduces damage instead of avoiding hits. Use the hero curve (CK 10) for HP rather than scaling the source's HP proportionally.
- Resistance/immunity: Nimble rarely uses damage-type resistance. Prefer armor or a conditional effect. Vulnerabilities exist and ignore armor.
- Healing monsters: allowed in 5e/PF2e; in Nimble replace healing with armor, more HP or another defensive trick (CK 12).

## Durations & resources

| 5e / PF2e            | Nimble                                                     |
| -------------------- | ---------------------------------------------------------- |
| Short rest recharge  | **Never a Field Rest.** Use `1/encounter` or `X/Safe Rest` |
| Long rest / daily    | `/Safe Rest`                                               |
| Concentration        | Concentration (same idea; breaks while Dying)              |
| 1 minute (10 rounds) | "until the end of the encounter"                           |
| Spell slots          | Mana (Nimble casters)                                      |
| Focus points (PF2e)  | `X/encounter` or `WIL times/Safe Rest`                     |

## Conditions

Map by effect, not by name. Nimble's condition list is in Core Rules pp. 10–11. Before naming a target condition, check it exists in the target system. If it doesn't, write the effect out in full.
