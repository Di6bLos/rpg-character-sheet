// Magic items, from Nimble Core Rules "Magical Items" and "Spell Scrolls & Wands"
// (pp. 38–43) and the GM's Guide "Story Items" and "Combat Items" (p. 19).
import type { MagicItemDef } from './types'

export const MAGIC_ITEMS: MagicItemDef[] = [
  {
    name: 'Weapon of Many Hands',
    rarity: 'Varies',
    kind: 'template',
    desc: 'While equipped, you grow extra arms that can do anything your hands can (wield, Grapple, climb) but not act faster. 1 arm: uncommon; 4 arms: legendary.',
  },
  {
    name: 'Weapon of Animosity',
    rarity: 'Varies',
    kind: 'template',
    desc: 'Roll an extra animosity die with each attack: on a hit it adds to the damage, on a miss you take it. +1d4: uncommon; +1d10 or more: legendary.',
  },
  {
    name: 'Weapon of Slaying',
    rarity: 'Varies',
    kind: 'template',
    desc: 'An extra damage die against one creature type (who may come for you first). +1d4: uncommon; +1d10 or more: legendary.',
  },
  {
    name: 'Gnatbane Weapon',
    rarity: 'Uncommon',
    kind: 'template',
    desc: 'Never misses Small or Tiny creatures.',
  },
  {
    name: 'Harbinger & Sovereign',
    rarity: 'Legendary',
    kind: 'weapon',
    desc: 'A matched pair of glaives (Weapon of Many Hands): +4 extra arms while both are equipped.',
  },
  {
    name: 'Vindication',
    rarity: 'Legendary',
    kind: 'weapon',
    desc: 'Weapon of Animosity: +1d12 damage on a hit; you take it on a miss.',
  },
  {
    name: 'Weapon of Wounding',
    rarity: 'Uncommon',
    kind: 'weapon',
    desc: 'On a hit, you may take 1d6 damage to deal twice that much extra damage.',
  },
  {
    name: 'Mindlink Daggers',
    rarity: 'Rare',
    kind: 'weapon',
    desc: 'A pair of silver daggers: anyone holding (or stabbed by) one can share thoughts.',
  },
  {
    name: 'Resolute Fangs, Golden Bastion',
    rarity: 'Legendary',
    kind: 'shield',
    armor: '+8',
    desc: 'Reaction: when you reduce a melee hit with it, it may Grapple the attacker (escape DC 20 STR, 1 creature). Action: speak its command word to fix it in place until spoken again.',
  },
  {
    name: 'Trinket of Ill Omen',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: '−1 to your saves, +1 to your save DC.',
  },
  {
    name: 'Bloodstained Quill',
    rarity: 'Uncommon',
    kind: 'wondrous',
    desc: 'Dipped in a dead intelligent creature’s blood, it writes that creature’s last words.',
  },
  {
    name: 'Eyes of the Street',
    rarity: 'Uncommon',
    kind: 'wondrous',
    desc: 'Goggles: see and hear through a rat or pigeon for 10 minutes. Recharge by whispering a secret to them (it soon becomes a rumor).',
  },
  {
    name: 'Handwraps of Force',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: 'Unarmed strikes may push the target 2 spaces and you 2 the other way; or strike the air to fly 4 spaces in any direction.',
  },
  {
    name: 'Key of Doors',
    rarity: 'Very Rare',
    kind: 'wondrous',
    desc: 'Opens any locked door onto a doorway you’ve walked through while holding it.',
  },
  {
    name: 'Grim Coronet',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: 'When you would die wearing it, take a turn with 3 actions at once; you die at its end.',
  },
  {
    name: 'Pocket Cauldron',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: 'On a Safe Rest, brew 1 elixir to drink at once: Futuresight (a cryptic vision), Requiem (relive a memory), or, once a century, Time (go back 1 day).',
  },
  {
    name: 'Phoenix Helm',
    rarity: 'Legendary',
    kind: 'wondrous',
    desc: 'If you die wearing it, you burst into flame and rise again from the ashes (see GM’s Guide).',
  },
  {
    name: 'Ball of Spiders',
    rarity: 'Uncommon',
    kind: 'wondrous',
    desc: 'Action: throw up to 6 spaces; spectral spiders fill a 2×2 area: WIL save or Frightened until the end of their next turn. Reforms on a Safe Rest.',
  },
  {
    name: 'Skitter Shoes',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: 'Walk on walls and ceilings at half speed; end your turn there and make a DC 10 STR save or fall Prone.',
  },
  {
    name: 'Button of Protection',
    rarity: 'Rare',
    kind: 'wondrous',
    desc: 'Reaction when attacked: throw it; the attacker makes a WIL save or the attack misses. Inert until sewn back on with silver thread on a Safe Rest.',
  },
  {
    name: 'The Grimoire of Truths',
    rarity: 'Varies',
    kind: 'wondrous',
    desc: 'A sentient book that knows the world and eagerly advises its owner, toward trouble.',
  },
  {
    name: 'Hear-ring',
    rarity: 'Varies',
    kind: 'wondrous',
    desc: 'Earrings, usually a pair or set: wearers can talk to each other at any distance.',
  },
  {
    name: 'Lumina, Living Sunbeam',
    rarity: 'Varies',
    kind: 'wondrous',
    desc: 'One use, action: LVL d6 radiant damage to all enemies within 6 spaces, healing allies there the same.',
  },
  {
    name: 'Wand of Firestep',
    rarity: 'Uncommon',
    kind: 'wand',
    desc: 'Fire Step (cantrip), 3 charges. Recharge: heat it in a forge and quench it in oil.',
  },
  {
    name: 'Wand of Dread Visage',
    rarity: 'Uncommon',
    kind: 'wand',
    desc: 'Dread Visage (tier 2), 2 charges. Recharge: leave it in a fresh corpse until only bones remain.',
  },
  {
    name: 'Wand of Fly',
    rarity: 'Uncommon',
    kind: 'wand',
    desc: 'Fly (tier 3), 2 charges. Recharge: let a wild bird carry it and fetch it where it drops.',
  },
  {
    name: 'Wand of Barrier of Wind',
    rarity: 'Rare',
    kind: 'wand',
    desc: 'Barrier of Wind (tier 2), 3 charges. Recharge: hang it with wind chimes in a breeze for 3 days.',
  },
  {
    name: 'Wand of Ride the Lightning',
    rarity: 'Very Rare',
    kind: 'wand',
    desc: 'Ride the Lightning (tier 6), 2 charges. Recharge: leave it at the highest point for 3 thunderstorms.',
  },
  {
    name: 'Wand of Sacrifice',
    rarity: 'Very Rare',
    kind: 'wand',
    desc: 'Sacrifice (tier 6), 1 charge. Recharge: plant it in a new garden until the flowers bloom.',
  },
  {
    name: 'Wand of Glacier Strike',
    rarity: 'Very Rare',
    kind: 'wand',
    desc: 'Glacier Strike (tier 8), 1 charge. Recharge: leave it at the bottom of a lake until it freezes and thaws.',
  },
  {
    name: 'Elderwyrm’s Majesty',
    rarity: 'Legendary',
    kind: 'wand',
    desc: 'Dragonform (tier 9), 1 charge, as the dragon that last charged it. Recharge: give an ancient dragon a gift it truly desires.',
  },
  {
    name: 'Heartwood, Splinter of the Tree of Life',
    rarity: 'Legendary',
    kind: 'wand',
    desc: 'Redeem (tier 9) without components, 1 charge. Recharge: a hymn sung over it for 100 years.',
  },
]

export const WAND_RULES =
  'Wands cast without mana or magical ability. Proficient: any school. Otherwise a DC 10+tier Arcana check; the charge is spent either way.'

export const SCROLL_RULES =
  'Single use, no mana or magical ability needed; takes the spell’s actions. DC 10 Arcana check if you know no spell of that school, or it’s wasted.'

export function magicItemByName(name: string): MagicItemDef | undefined {
  return MAGIC_ITEMS.find((m) => m.name === name)
}
