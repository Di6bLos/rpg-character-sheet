// What each Pathfinder 2e skill, save and Perception is for, from Player Core's skills chapter
// (pp. 233–247), saving throws (p. 9) and Perception (p. 404): the book's opening line and the
// skill actions it lists, untrained and trained. ORC-licensed (see ./NOTICE.md). The Skills
// panel shows it beside each name (`skillUses` in utils/pf2ePlay.ts).

export interface Pf2eSkillInfo {
  page: number
  what: string
  untrained?: string[]
  trained?: string[]
}

export const PF2E_SKILLS: Record<string, Pf2eSkillInfo> = {
  Acrobatics: {
    page: 233,
    what: 'Acrobatics measures your ability to perform tasks requiring coordination and grace.',
    untrained: ['Balance', 'Tumble Through'],
    trained: ['Maneuver in Flight', 'Squeeze'],
  },
  Arcana: {
    page: 234,
    what: 'Arcana measures how much you know about arcane magic and creatures.',
    trained: ['Borrow an Arcane Spell'],
  },
  Athletics: {
    page: 234,
    what: 'Athletics allows you to perform deeds of physical prowess.',
    untrained: [
      'Climb',
      'Force Open',
      'Grapple',
      'High Jump',
      'Long Jump',
      'Reposition',
      'Shove',
      'Swim',
      'Trip',
    ],
    trained: ['Disarm'],
  },
  Crafting: {
    page: 236,
    what: 'You can use this skill to create and repair items.',
    untrained: ['Repair'],
    trained: ['Craft', 'Identify Alchemy'],
  },
  Deception: {
    page: 237,
    what: 'You can trick and mislead others using disguises, lies, and other forms of subterfuge.',
    untrained: ['Create a Diversion', 'Impersonate', 'Lie'],
    trained: ['Feint'],
  },
  Diplomacy: {
    page: 239,
    what: 'You influence others through negotiation and flattery, or find out information through friendly chats.',
    untrained: ['Gather Information', 'Make an Impression', 'Request'],
  },
  Intimidation: {
    page: 240,
    what: 'You bend others to your will using threats.',
    untrained: ['Coerce', 'Demoralize'],
  },
  Lore: {
    page: 240,
    what: 'You have specialized information on a narrow topic.',
  },
  Medicine: {
    page: 241,
    what: 'You can patch up wounds and help people recover from diseases and poisons.',
    untrained: ['Administer First Aid'],
    trained: ['Treat Disease', 'Treat Poison', 'Treat Wounds'],
  },
  Nature: {
    page: 242,
    what: 'You know about the natural world, and you command and train animals and magical beasts.',
    untrained: ['Command an Animal'],
  },
  Occultism: {
    page: 243,
    what: 'You know a great deal about ancient philosophies, esoteric lore, obscure mysticism, and supernatural creatures.',
  },
  Performance: {
    page: 243,
    what: 'You are skilled at a form of performance, using your talents to impress a crowd or make a living.',
    untrained: ['Perform'],
  },
  Religion: {
    page: 244,
    what: 'The secrets of deities, dogma, faith, and the realms of divine creatures both sublime and sinister are open to you.',
  },
  Society: {
    page: 244,
    what: 'You understand the people and systems that make civilization run, and you know the historical events that make societies what they are today.',
    trained: ['Create Forgery'],
  },
  Stealth: {
    page: 244,
    what: 'You are skilled at avoiding detection, allowing you to slip past foes, hide, or conceal an item.',
    untrained: ['Conceal an Object', 'Hide', 'Sneak'],
  },
  Survival: {
    page: 246,
    what: 'You are adept at living in the wilderness, foraging for food and building shelter, and with training you discover the secrets of tracking and hiding your trail.',
    untrained: ['Sense Direction'],
    trained: ['Cover Tracks', 'Track'],
  },
  Thievery: {
    page: 246,
    what: 'You are trained in a particular set of skills favored by thieves and miscreants.',
    untrained: ['Palm an Object', 'Steal'],
    trained: ['Disable a Device', 'Pick a Lock'],
  },
  Fortitude: {
    page: 9,
    what: "A Fortitude saving throw is used when your character's health or vitality is under attack, such as from poison or disease.",
  },
  Reflex: {
    page: 9,
    what: 'A Reflex saving throw is called for when your character must dodge away from danger, usually something that affects a large area.',
  },
  Will: {
    page: 9,
    what: "A Will saving throw is often your defense against spells and effects that target your character's mind.",
  },
  Perception: {
    page: 404,
    what: 'Perception measures your ability to be aware of your environment.',
  },
}
