// Nimble Core Rules, "Spells" (pp. 44–53).
import type { SpellDef, SpellSchool } from './types'

export const SCHOOL_LABELS: Record<SpellSchool, string> = {
  fire: 'Fire',
  ice: 'Ice',
  lightning: 'Lightning',
  wind: 'Wind',
  radiant: 'Radiant',
  necrotic: 'Necrotic',
}

export const SCHOOL_BLURBS: Record<SpellSchool, string> = {
  fire: 'High, consistent damage at medium range; some spells punish Smoldering enemies.',
  ice: 'Medium damage at long range, controlling the battlefield and protecting the caster.',
  lightning: 'High damage at long range and teleporting, but it may strike the caster instead.',
  wind: 'Move friend and foe around, and slice through groups with vicious crits.',
  radiant: 'Obliterate the unholy, protect allies, mend wounds and even restore life.',
  necrotic: 'Summon minions or trap and sap targets, often at a cost to friend and foe.',
}

export const SPELL_RULES =
  'A spell’s mana cost equals its tier; cantrips cost nothing. Upcast by spending extra mana (up to your unlocked tier). Save DC is 10+KEY. Multi-target and AoE spells do not miss or crit.'

export const SPELLS: SpellDef[] = [
  // --- Fire -----------------------------------------------------------------
  {
    name: 'Flame Dart',
    school: 'fire',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 8. Damage: 1d10. On crit: Smoldering. High Levels: +5 damage every 5 levels.',
  },
  {
    name: 'Heart’s Fire',
    school: 'fire',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 4. Give an ally within Range an extra action. Spend 1 mana to cast this when it is not your turn. High Levels: +1 Range every 5 levels.',
  },
  {
    name: 'Ignite',
    school: 'fire',
    tier: 1,
    cast: '2 Actions, Single Target',
    desc: 'Range: 8. Damage: 4d10 to a Smoldering target, ending the condition on hit. Upcast: +10 damage.',
  },
  {
    name: 'Enchant Weapon',
    school: 'fire',
    tier: 2,
    cast: '1 Action, Single Target',
    desc: 'Concentration: Up to 1 minute. A weapon you touch is enchanted with magical flame. It deals +KEY damage and inflicts Smoldering on crit. Upcast: +KEY damage.',
  },
  {
    name: 'Flame Barrier',
    school: 'fire',
    tier: 3,
    cast: '1 Action, Self',
    desc: 'Reaction: When attacked, Defend for free. Until the start of your next turn, melee attackers against you take KEY damage (ignoring armor) and gain Smoldering. Upcast: +KEY damage.',
  },
  {
    name: 'Pyroclasm',
    school: 'fire',
    tier: 4,
    cast: '2 Actions, AoE',
    desc: 'Reach: 3. Others within Reach take 2d20+10 damage (ignoring armor) on a failed DEX save. Half damage on save. Smoldering creatures fail. Upcast: +1 Reach, +2 damage.',
  },
  {
    name: 'Fiery Embrace',
    school: 'fire',
    tier: 5,
    cast: '2 Actions, AoE',
    desc: 'Concentration: Up to 1 minute. Reach: 8. While within Reach: 1 ally gains the effects of Enchant Weapon. Enemies gain Smoldering, lose damage resistance, and their damage immunity is reduced to resistance. Upcast: +1 ally.',
  },
  {
    name: 'Living Inferno',
    school: 'fire',
    tier: 7,
    cast: '3 Actions, Self',
    desc: 'Gain the effects of Flame Barrier until your next turn. At the end of this turn and your next turn, cast Pyroclasm for free. Upcast: Upcast Flame Barrier and Pyroclasm.',
  },
  {
    name: 'Dragonform',
    school: 'fire',
    tier: 9,
    cast: '5 Actions, Self',
    desc: 'Transform into a Huge dragon. Gain 3 actions, a fly speed of 12, LVL Armor, 10×LVL temp HP, and: Tooth & Claw. Action: (Reach 2) 1d20+LVL damage (ignoring armor), inflicts Smoldering. Immolating Breath. 2 Actions: (Cone 8) DC 20 DEX save, KEY d20 damage, half on save; Smoldering targets fail. You keep this form while its temp HP remain (max 10 minutes). When it ends, you drop to 0 HP.',
  },

  // --- Ice ------------------------------------------------------------------
  {
    name: 'Ice Lance',
    school: 'ice',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 12. Damage: 1d6 cold or piercing damage. On hit: Slowed. High Levels: +3 damage every 5 levels.',
  },
  {
    name: 'Snowblind',
    school: 'ice',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Reach: 1. Damage: 1d6. On hit: Blinded until the end of their next turn. High Levels: +3 damage every 5 levels.',
  },
  {
    name: 'Frost Shield',
    school: 'ice',
    tier: 1,
    cast: '1 Action, Self',
    desc: 'Reaction: When attacked, gain 2×KEY temp HP and Defend for free. The ice melts and these temp HP are lost at the start of your next turn. Upcast: +2×KEY temp HP.',
  },
  {
    name: 'Shatter',
    school: 'ice',
    tier: 2,
    cast: '2 Actions, Single Target',
    desc: 'Range: 12. Damage: 3d6. If any die rolls the max against a Hampered target, this counts as a crit. On crit: +20 damage. Upcast: Increase the result of ANY die by 1. +5 damage on crit.',
  },
  {
    name: 'Cryosleep',
    school: 'ice',
    tier: 3,
    cast: '2 Actions, AoE',
    desc: 'Reach: 12. Creatures in a 2×2 area within Reach are Dazed. On a failed STR save, they fall asleep instead, becoming Incapacitated until their next two turns have passed, until damaged, or until an ally uses an action to wake them. Upcast: +1 area, +1 turn asleep.',
  },
  {
    name: 'Rimeblades',
    school: 'ice',
    tier: 4,
    cast: '3 Actions, AoE',
    desc: 'Concentration: Up to 1 minute. Reach: 12. Conjure razor-sharp icy spikes in 5 contiguous spaces within Reach; this area is difficult terrain. Creatures that enter these spaces (or are in the area when you conjure them) suffer 2d6 damage for each space they touch. Upcast: +1 space, +1 damage.',
  },
  {
    name: 'Arctic Blast',
    school: 'ice',
    tier: 5,
    cast: '2 Actions, AoE',
    desc: 'Reach: Cone 4. Damage: 4d6+10. This area is difficult terrain until the end of your next turn. Surviving creatures must make a STR save or be frozen in place (Restrained) until the end of their next turn; creatures already Hampered are Incapacitated for 1 turn instead. Upcast: +1 Reach.',
  },
  {
    name: 'Glacier Strike',
    school: 'ice',
    tier: 8,
    cast: '3 Actions, AoE',
    desc: 'Range: 12. Damage: d66 bludgeoning to creatures in a 3×3 area (roll 2d6: the left die is the tens, the right the ones). Creatures adjacent to that area take half as much. The entire area permanently becomes difficult terrain. Upcast: +1 initial area.',
  },
  {
    name: 'Arctic Annihilation',
    school: 'ice',
    tier: 9,
    cast: '3 Actions, AoE',
    desc: 'Reach: 12. Encase any number of objects or willing creatures within Reach in ice: they are Incapacitated and immune to damage and negative effects until the start of their next turn. All other creatures and objects within Reach take d66 damage; survivors must make a STR save or be Incapacitated for 1 round. Once cast, you must Safe Rest for 1 week before using it again.',
  },

  // --- Lightning ------------------------------------------------------------
  {
    name: 'Zap',
    school: 'lightning',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 12. Damage: 2d8. On miss: the lightning fails to find ground, and strikes you instead. High Levels: +6 damage every 5 levels.',
  },
  {
    name: 'Overload',
    school: 'lightning',
    tier: 0,
    cast: '1 Action, AoE',
    desc: 'Castable only if you are Charged, ending the condition. Reach: 2. Damage: 2d8 to others within Reach. High Levels: +4 damage every 5 levels.',
  },
  {
    name: 'Arc Lightning',
    school: 'lightning',
    tier: 1,
    cast: '2 Actions, Single Target',
    desc: 'Range: 12. Damage: 3d8. The bolt also damages the next closest creature to your target (an ally if they are closest!). On miss: the lightning fails to find ground and strikes you instead. Upcast: +4 damage.',
  },
  {
    name: 'Alacrity',
    school: 'lightning',
    tier: 2,
    cast: '1 Action, Self',
    desc: 'Range: 4. Reaction: When attacked, Defend for free. After damage is dealt, you gain the Charged condition then teleport anywhere within Range. Upcast: +4 Range.',
  },
  {
    name: 'Stormlash',
    school: 'lightning',
    tier: 3,
    cast: '2 Actions, AoE',
    desc: 'Line: 12. Damage: 3d8+4 (ignoring metal armor). Surviving creatures are Dazed on a failed STR save, or Incapacitated for 1 of their turns if they fail by 5 or more. Creatures with a large amount of metal roll with disadvantage. Upcast: +4 damage.',
  },
  {
    name: 'Electrickery',
    school: 'lightning',
    tier: 4,
    cast: '3 Actions, 2 Targets',
    desc: 'Range: 8. Reaction: When an ally is attacked, choose another creature within Range to swap places with your ally on a failed WIL save (they become the new target). Costs 1 Action while Charged, ending the condition. Upcast: +2 Range.',
  },
  {
    name: 'Electrocharge',
    school: 'lightning',
    tier: 5,
    cast: '2 Actions, Single Target',
    desc: 'Concentration: Up to 1 minute. A creature you touch gains the Charged condition, +1 max action, +5 armor, 2× speed, and advantage on DEX saves. Upcast: +4 Range.',
  },
  {
    name: 'Ride the Lightning',
    school: 'lightning',
    tier: 6,
    cast: '3 Actions, AoE',
    desc: 'Teleport up to 12 spaces away to a spot you can see (swap places with a willing creature there). Adjacent creatures take d88 damage (roll 2d8: tens and ones). Survivors must make a STR save or be hurled back 3 spaces, knocked Prone, and deafened for 1 day. Upcast: +1 DC.',
  },
  {
    name: 'Seething Storm',
    school: 'lightning',
    tier: 9,
    cast: '3 Actions, AoE',
    desc: 'Concentration: Up to 1 minute. Reach: 4. You become a tempestuous storm cloud: you can fly, move for free 1/round, and attacks against you have disadvantage. At the end of each of your turns, strike up to 4 creatures within Reach for d88 damage (each 1/round); +2 Reach and bolts each round. Costs 3 actions each round to maintain. Once cast, you must Safe Rest for 1 week before using it again.',
  },

  // --- Wind -----------------------------------------------------------------
  {
    name: 'Razor Wind',
    school: 'wind',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 12. Damage: 1d4 slashing (Vicious: roll 1 additional die whenever you roll crit damage). Also damages up to 1 adjacent target. High Levels: +2 damage every 5 levels.',
  },
  {
    name: 'Breath of Life',
    school: 'wind',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 6. Restore 1 HP to a Dying creature. High Levels: +2 Range every 5 levels.',
  },
  {
    name: 'Blustery Gale',
    school: 'wind',
    tier: 1,
    cast: '2 Actions, Single Target',
    desc: 'Range: 12. Damage: 3d4 bludgeoning, advantage against flying, Small, or Tiny targets. On hit: move a Medium target 2 spaces away; Small/Tiny twice as far; Large half as far (round down). For each die you would roll due to forced movement from this spell, deal +5 damage instead. Upcast: +1 movement.',
  },
  {
    name: 'Barrier of Wind',
    school: 'wind',
    tier: 2,
    cast: '1 Action, Self',
    desc: 'Reaction: When attacked at Range, Defend for free. Ranged attacks have disadvantage against you this round (including the triggering attack). Upcast: +3 Armor.',
  },
  {
    name: 'Fly',
    school: 'wind',
    tier: 3,
    cast: '1 Action, Single Target+',
    desc: 'Concentration: Up to 10 minutes. Touch a creature, grant a flying speed of 12. Upcast: +1 target.',
  },
  {
    name: 'Eye of the Storm',
    school: 'wind',
    tier: 4,
    cast: '2 Actions, AoE',
    desc: 'Reach: 3. Damage: 4d4+10 bludgeoning to enemies within Reach. You may place surviving creatures anywhere within 1 space of the storm’s Reach on a failed STR save. Upcast: +1 Reach.',
  },
  {
    name: 'Updraft',
    school: 'wind',
    tier: 5,
    cast: '3 Actions, AoE',
    desc: 'Reach: 12. Enemies within a 5×5 area must repeat a DEX save until they succeed. For each failure they suffer 1d6 falling damage and land Prone. Upcast: +2 Range, +1 area.',
  },
  {
    name: 'Thousand Cuts',
    school: 'wind',
    tier: 6,
    cast: '3 Actions, AoE',
    desc: 'Range: 12. Damage: d44 slashing with advantage (roll 3d4, drop the lowest: tens and ones). Also damages enemies within Reach 1 of your target. Upcast: +1 Reach.',
  },
  {
    name: 'Boisterous Winds',
    school: 'wind',
    tier: 7,
    cast: '2 Actions, Multi-target',
    desc: 'Concentration: Up to 1 minute. You and up to 12 allies within Reach 12 gain: ranged attacks have disadvantage against you, a flying speed of 12, and can move for free 1/round. Upcast: +1 minute or +2 targets.',
  },
  {
    name: 'Vicious Mockery',
    school: 'wind',
    tier: 0,
    cast: '1 Action, Single Target',
    classOnly: 'songweaver',
    desc: 'Range: 12. Damage: 1d4+INT psychic (ignoring armor). On hit: the target is Taunted during their next turn. High Levels: +2 damage every 5 levels.',
  },

  // --- Radiant --------------------------------------------------------------
  {
    name: 'Rebuke',
    school: 'radiant',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Reach: 4. Damage: 1d6 (ignoring armor), does not miss. 2× damage against undead or cowardly (those Frightened or behind cover). High Levels: +2 damage every 5 levels.',
  },
  {
    name: 'True Strike',
    school: 'radiant',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Reach: 2. Give a creature advantage on the next attack they make (until the end of their next turn). High Levels: +1 Reach every 5 levels.',
  },
  {
    name: 'Heal',
    school: 'radiant',
    tier: 1,
    cast: '1 Action, Single Target+',
    desc: 'Reach: 1. Heal a creature 1d6+KEY HP. Upcast: choose one: +1 target, +4 Reach, +1d6 healing. If 5+ mana is spent, you may also heal 1 negative condition (e.g., Blind, Poisoned, 1 Wound).',
  },
  {
    name: 'Warding Bond',
    school: 'radiant',
    tier: 2,
    cast: '1 Action, Single Target',
    desc: 'Designate a willing creature as your ward for 1 minute. They take half damage from all attacks; you are attacked for the other half. Upcast: +1 creature.',
  },
  {
    name: 'Shield of Justice',
    school: 'radiant',
    tier: 3,
    cast: '1 Action, Self',
    desc: 'Reaction: When attacked, Defend for free and reflect Radiant damage back at the attacker equal to the amount blocked (ignoring armor). Upcast: +5 Armor.',
  },
  {
    name: 'Condemn',
    school: 'radiant',
    tier: 4,
    cast: '2 Actions, Single Target',
    desc: 'Reach: 4. Damage: 30. Can only target an enemy that crit you or an ally since your last turn. Cannot be reduced by any means. The next attack against that enemy is made with advantage. Upcast: +1 Reach, +1 advantage.',
  },
  {
    name: 'Vengeance',
    school: 'radiant',
    tier: 5,
    cast: '2 Actions, Single Target',
    desc: 'Reach: 1. Damage: 1d100, to a creature that attacked a Dying ally or reduced one to 0 HP since your last turn. Upcast: +1 Reach, roll with advantage.',
  },
  {
    name: 'Sacrifice',
    school: 'radiant',
    tier: 6,
    cast: '1 Action, Special',
    desc: 'Reach: 4. Reduce yourself to 0 HP; you cannot have more than 0 HP until you Safe Rest. Heal HP equal to your maximum HP, divided as you choose among other creatures within Reach. You may revive a creature that died in the past minute if you give them at least 20 HP (also healing 2 Wounds), provided this spell has not revived them before. Upcast: +4 Reach.',
  },
  {
    name: 'Redeem',
    school: 'radiant',
    tier: 9,
    cast: 'Casting Time: 24 hours, AoE',
    desc: 'Requires a diamond worth at least 10,000 gp, which this spell consumes. Revive any number of deceased creatures you choose within 1 mile that died in the past year, provided they did not die of old age and this spell has not revived them before.',
  },
  {
    name: 'Lifebinding Spirit',
    school: 'radiant',
    tier: 1,
    cast: '1 Action',
    classOnly: 'shepherd',
    desc: 'Summon a spirit companion that follows you and is immune to harm. It lasts until you cast this spell again, take a Safe Rest, or it heals a number of times equal to the mana spent summoning it. Action: It attacks or heals a creature within Reach 4 for 1d6+WIL radiant damage (ignoring armor), or heals for the same amount. Upcast: Increment its die size by 1 (max d12), +1 healing use.',
  },

  // --- Necrotic -------------------------------------------------------------
  {
    name: 'Entice',
    school: 'necrotic',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Range: 8. Damage: 1d4 (ignoring armor). On hit: target moves 2 spaces closer to you. High Levels: increment the die size 1 step every 5 levels (d6 » d8 » d10 » d12).',
  },
  {
    name: 'Withering Touch',
    school: 'necrotic',
    tier: 0,
    cast: '1 Action, Single Target',
    desc: 'Reach: 1. Damage: 1d12. On hit: target is considered undead for 1 round. High Levels: +6 damage every 5 levels.',
  },
  {
    name: 'Shadow Trap',
    school: 'necrotic',
    tier: 1,
    cast: '2 Actions, Single Target',
    desc: 'Concentration: Up to 1 minute. The next creature to move adjacent to you suffers 3d12 damage; if Small or Tiny, it is also Restrained by shadowy tendrils while you concentrate or until it escapes. Upcast: +1 size category, +1d12 damage when they escape.',
  },
  {
    name: 'Dread Visage',
    school: 'necrotic',
    tier: 2,
    cast: '1 Action, Self',
    desc: 'Reaction: When attacked, Defend for free. Melee attackers are Frightened of you and suffer 1d12 damage if they attack you this round. Costs 2 mana less while Dying. Upcast: +2 damage, +2 armor.',
  },
  {
    name: 'Vampiric Greed',
    school: 'necrotic',
    tier: 3,
    cast: '2 Actions, AoE',
    desc: 'Gain 1 Wound. Deal 4d12 to all adjacent creatures and heal HP equal to the damage done. Surviving creatures make a STR save; gain 1 additional Wound for each creature that saves. Upcast: +1 DC.',
  },
  {
    name: 'Greater Shadow',
    school: 'necrotic',
    tier: 4,
    cast: '2 Actions',
    desc: 'Summon a 5d12 Greater Shadow minion (max 1) adjacent to you. When it dies, it explodes into 5 shadow minions placed anywhere within 8 spaces. Upcast: +1d12 damage, +1 shadow minion on explosion.',
  },
  {
    name: 'Gangrenous Burst',
    school: 'necrotic',
    tier: 5,
    cast: '2 Actions, AoE',
    desc: 'Reach: Up to 8. Other damaged creatures must make a STR save or take 3d20 damage (ignoring armor), half on save. The save is rolled with disadvantage while Bloodied. Upcast: +10 damage.',
  },
  {
    name: 'Unspeakable Word',
    school: 'necrotic',
    tier: 6,
    cast: '2 Actions, Special',
    desc: 'Reach: 8. Damage: d66 with advantage (roll 3d6, drop the lowest; ignores armor, does not miss or crit) on a failed INT save. Target rolls with disadvantage if Bloodied or Frightened. On a success, you both take half of this damage instead. Upcast: +1 DC, +10 damage.',
  },
  {
    name: 'Creeping Death',
    school: 'necrotic',
    tier: 7,
    cast: '3 Actions, AoE',
    desc: 'Reach: 8. Damage: 4d20. If this kills the creature, it erupts and you MUST deal the same damage to another creature within 8 spaces of it not yet damaged by this effect. Repeat until a creature survives or none are within Reach. Upcast: +1d20 damage.',
  },
  {
    name: 'Shadow Blast',
    school: 'necrotic',
    tier: 0,
    cast: '1 Action, Single Target',
    classOnly: 'shadowmancer',
    desc: 'Range: 8. Damage: 1d12+KEY. 1/turn. High Levels: +1d12 damage every 5 levels.',
  },
  {
    name: 'Bonescythe',
    school: 'necrotic',
    tier: 0,
    cast: '1 Action, Melee (Reach 2)',
    classOnly: 'shadowmancer',
    learnedOnly: true,
    desc: 'Summon a magical Bonescythe, a melee weapon: 2d12 slashing + DEX necrotic damage to each die (Reach 2). It shatters after you hit with it (or when combat ends). Any Invocations affecting Shadow Blast affect your Bonescythe instead. High Levels: every 5 levels, add 1 extra damage die (Level 5: 3d12, Level 10: 4d12, etc.).',
  },
  {
    name: 'Summon Shadows',
    school: 'necrotic',
    tier: 0,
    cast: '1 Action',
    classOnly: 'shadowmancer',
    desc: 'Action: Summon a shadow minion within Reach 1 (max INT or LVL minions, whichever is lower). Action (1/turn): command ALL your minions to move 6 then attack (Reach 1, 1d12 each). Minions have 1 HP, no damage bonus, do not crit, and abandon you outside of combat. High Levels: +1 Reach every 5 levels.',
  },

  // --- Utility spells (chosen by some classes) ------------------------------
  {
    name: 'Firebrand',
    school: 'fire',
    tier: 0,
    utility: true,
    cast: '1 Action',
    desc: 'Touch a surface and secretly mark it with a symbol or brief message. Speaking a chosen command word while nearby reveals it.',
  },
  {
    name: 'Fire Step',
    school: 'fire',
    tier: 0,
    utility: true,
    cast: 'Self, Casting Time: 1 min',
    desc: 'Teleport to a fire source you can see.',
  },
  {
    name: 'Kindle',
    school: 'fire',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Conjure a minor visual illusion. OR: Ignite a small, unheld item within Range 6.',
  },
  {
    name: 'Ice Disk',
    school: 'ice',
    tier: 0,
    utility: true,
    cast: 'Casting Time: 1 min',
    desc: 'Conjure a disk of ice that floats just above the ground and follows you. It carries up to 250 lbs./115 kg for 1 hour or until you cast this spell again.',
  },
  {
    name: 'Chillcraft',
    school: 'ice',
    tier: 0,
    utility: true,
    cast: '1 Action',
    desc: 'Chill: harmlessly freeze, thaw, or move a bath-sized amount of water near you. OR: Craft: conjure a sheet of opaque, mirror-like, or transparent ice the size of a window or small door.',
  },
  {
    name: 'Wintry Scrying',
    school: 'ice',
    tier: 0,
    utility: true,
    cast: 'Casting Time: 10 min',
    desc: 'Turn a small patch of water into a reflective icy mirror. Looking through it grants vision of any desired location near this same body of water for 10 minutes.',
  },
  {
    name: 'Spark Buddy',
    school: 'lightning',
    tier: 0,
    utility: true,
    cast: 'Casting Time: 1 min',
    desc: 'Conjure a Tiny electrical helper for up to 1 hour. It can fetch Tiny objects (~1 lb.), open unlocked doors, light a small area, or deliver a harmless shock. It dissipates if damaged or more than 6 spaces from you.',
  },
  {
    name: 'Spark Step',
    school: 'lightning',
    tier: 0,
    utility: true,
    cast: '1 Action, Self',
    desc: 'Range: 4. Teleport to a metal object.',
  },
  {
    name: 'Tempest’s Command',
    school: 'lightning',
    tier: 0,
    utility: true,
    cast: '1 Action',
    desc: 'Dispel a minor magical effect, or temporarily suppress a stronger one. OR: Voice of Thunder: your eyes glow and your voice booms like thunder for 1 minute.',
  },
  {
    name: 'Wind Whisper',
    school: 'wind',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Whisper a message into the wind; it is secretly carried to a specified target within 100 miles/160 km.',
  },
  {
    name: 'Helpful Gust',
    school: 'wind',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Reach: 6. Gently move a Tiny unheld item within Reach in any direction. OR: Generate an illusory scent.',
  },
  {
    name: 'Feather Fall',
    school: 'wind',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Reach: 6. Reaction: When a creature falls, it gently floats to the ground, unharmed.',
  },
  {
    name: 'Light',
    school: 'radiant',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Cause an item to glow brightly as a torch with radiant light for as long as you hold it.',
  },
  {
    name: 'Beautify',
    school: 'radiant',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target',
    desc: 'Clean stains or repair a small tear or break in a non-magical item, or conjure tiny beautiful things: flowers, butterflies, etc.',
  },
  {
    name: 'Bond of Peace',
    school: 'radiant',
    tier: 0,
    utility: true,
    cast: '1 Action, Single Target/Self',
    desc: 'Bond: telepathically share simple thoughts or feelings with a friendly creature you can see. OR: Peace: your words gain calming magic, granting advantage on checks to soothe anger or fear in creatures who hear you.',
  },
  {
    name: 'Gravecraft',
    school: 'necrotic',
    tier: 0,
    utility: true,
    cast: 'Single Target',
    desc: 'Gravemark (Action): soil a surface with blood, filth, or other disgusting things. OR: Gravework (1 minute): shape or move a body-sized plot of earth.',
  },
  {
    name: 'False Face',
    school: 'necrotic',
    tier: 0,
    utility: true,
    cast: 'Casting Time: 1 min',
    desc: 'Change your appearance to look like someone else for 10 minutes. Requires a piece of them.',
  },
  {
    name: 'Thought Leech',
    school: 'necrotic',
    tier: 0,
    utility: true,
    cast: '1 Action',
    desc: 'Reach: 6. Read the surface thoughts of a creature within Reach. Creatures can sense you doing this and may not like it.',
  },
]

const BY_NAME = new Map(SPELLS.map((s) => [s.name, s]))

export function spellByName(name: string): SpellDef | undefined {
  return BY_NAME.get(name)
}

/** Combat spells of a school the hero can cast (class-only spells need a matching class). */
export function schoolSpells(school: SpellSchool, classSlug: string): SpellDef[] {
  return SPELLS.filter(
    (s) =>
      s.school === school &&
      !s.utility &&
      !s.learnedOnly &&
      (!s.classOnly || s.classOnly === classSlug),
  )
}

export function utilitySpells(school: SpellSchool): SpellDef[] {
  return SPELLS.filter((s) => s.school === school && s.utility)
}
