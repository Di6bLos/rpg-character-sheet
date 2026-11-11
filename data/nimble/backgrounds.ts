// Nimble Core Rules, "Backgrounds" (pp. 28–29).
import type { BackgroundDef } from './types'

export const BACKGROUNDS: BackgroundDef[] = [
  {
    slug: 'back-out-of-retirement',
    name: 'Back Out of Retirement',
    desc: 'You’ve forgotten more than most adventurers know. Let’s see if I remember how to do this: you may gain 1 Wound to use an ability or cast a spell as if you were 1 level higher. These old bones: –1 max Wounds.',
    woundsMax: -1,
  },
  {
    slug: 'devoted-protector',
    name: 'Devoted Protector',
    desc: 'Choose 1 ally in your party. You can survive +3 max Wounds as long as they are nearby. Whenever they take a Wound, you do too.',
  },
  {
    slug: 'academy-dropout',
    name: 'Academy Dropout',
    desc: 'School just isn’t for everyone; you learn by experience. Learn any 1 Utility Spell.',
    choice: {
      id: 'academy-utility',
      label: 'Choose a Utility Spell',
      count: 1,
      source: {
        kind: 'utility',
        schools: ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'],
      },
    },
  },
  {
    slug: 'made-a-bad-choice',
    name: 'Made a BAD Choice',
    desc: 'Start with 500 or 1000 extra gold, or an uncommon/rare magic item your GM allows. Gain an equally powerful curse or enemy who wants it back. Your GM may let you choose another background too.',
  },
  {
    slug: 'haunted-past',
    name: 'Haunted Past',
    desc: 'Voices occasionally give you cryptic advice: sometimes VERY helpful, sometimes they only want you to suffer. Advantage against fear.',
  },
  {
    slug: 'ear-to-the-ground',
    name: 'Ear to the Ground',
    desc: 'Advantage on checks to know or obtain gossip about events that will soon happen or happened less than 1 year ago.',
  },
  {
    slug: 'ive-been-around',
    name: 'What? I’ve Been Around',
    desc: '1/location: you know JUST the person who has the information you need or can get you out of a jam. Roll 1d20: 1–5 they want you DEAD; 6–12 you owe them money; 13–19 they can be convinced to help; 20 they are your biggest fan.',
  },
  {
    slug: 'acrobat',
    name: 'Acrobat',
    desc: 'Can be thrown by a larger ally, REALLY far. Half damage from falling and forced movement.',
  },
  {
    slug: 'wild-one',
    name: 'Wild One',
    desc: 'Wild creatures are less frightened of you and more willing to aid you. +1 Naturecraft. While Field Resting in the wild, roll your Hit Dice with advantage.',
    skills: { Naturecraft: 1 },
  },
  {
    slug: 'fey-touched',
    name: 'Fey Touched',
    desc: 'You take half damage from all magical effects, and double from weapons made of metal (before armor is applied).',
  },
  {
    slug: 'survivalist',
    name: 'Survivalist',
    desc: 'You never run out of your own rations; anything can be food if you try hard enough. Advantage against poison saves. +1 max Hit Die.',
    hitDice: 1,
  },
  {
    slug: 'home-at-sea',
    name: 'Home at Sea',
    desc: 'Recover twice as many Wounds and HP while resting on a ship or near water. You can fill in as first mate or captain. Advantage on water-related skill checks.',
  },
  {
    slug: 'at-home-underground',
    name: 'At Home Underground',
    desc: 'You dig twice as fast as others. Underground Safe Rests always count as Lavish lodging. You struggle to rest (INT save) while it’s raining. “Water… from the SKY?!”',
  },
  {
    slug: 'raised-by-goblins',
    name: 'Raised by Goblins',
    desc: 'You speak Goblin natively. You automatically notice and avoid crudely made traps, and have advantage to notice and disarm sophisticated ones. (Change it up: be raised by another ancestry and gain its language and an iconic ability.)',
  },
  {
    slug: 'history-buff',
    name: 'History Buff',
    desc: 'Advantage on all Lore checks about items, facts, or events from more than 100 years ago.',
  },
  {
    slug: 'con-artist',
    name: '(Former) Con Artist',
    desc: 'You can forge most documents or mimic voices flawlessly, and have a criminal contact in most major cities. Your reputation often precedes you, until you prove yourself trustworthy.',
  },
  {
    slug: 'secretly-undead',
    name: '(Secretly) Undead',
    desc: 'Unnatural Resilience: immune to disease, and you don’t need to eat, drink, or breathe. Children, animals, and Celestials are uneasy around you; many will be horrified to discover your true nature.',
  },
  {
    slug: 'finer-things',
    name: 'Taste for the Finer Things',
    desc: 'You always know the customs and dress of the upper classes, and many of their secrets. Advantage on Influence checks with the upper class.',
  },
  {
    slug: 'fearless',
    name: 'Fearless',
    desc: 'You are immune to the Frightened condition. +1 Initiative. –1 Armor.',
    initiative: 1,
    armor: -1,
  },
  {
    slug: 'so-dumb-im-smart',
    name: 'So Dumb I’m Smart Sometimes',
    desc: 'Reroll an INT-related skill check, 1/day. Reroll a failed INT save with advantage, 1/Safe Rest.',
    requires: { stat: 'INT', max: 0 },
  },
  {
    slug: 'wily-underdog',
    name: 'Wily Underdog',
    desc: 'Reroll a failed STR-related roll (STR attack, STR save, Might check) and use another stat instead, 1/day.',
    requires: { stat: 'STR', max: 0 },
  },
  {
    slug: 'bumblewise',
    name: 'Bumblewise',
    desc: 'A result of 1 or less on any WIL-related roll (WIL save, Naturecraft, Perception, Influence, or Insight) counts as a natural 20.',
    requires: { stat: 'WIL', max: 0 },
  },
  {
    slug: 'accidental-acrobat',
    name: 'Accidental Acrobat',
    desc: 'Whenever you fail a DEX-related roll (DEX attack, DEX save, Stealth, Finesse), you may roll again. If you still fail, the consequences are BAD.',
    requires: { stat: 'DEX', max: 0 },
  },
  {
    slug: 'tradesman',
    name: 'Tradesman / Artisan',
    desc: 'Choose a profession (Baker, Smith, Stonemason, Weaver, Leatherworker…). Checks related to it are made with advantage, and you keep special knowledge of the trade.',
  },
]

export function backgroundBySlug(slug: string): BackgroundDef | undefined {
  return BACKGROUNDS.find((b) => b.slug === slug)
}
