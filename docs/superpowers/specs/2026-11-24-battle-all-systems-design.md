# Battle board for every system, Party (classic) retired — design

Status: planned for a future update (not started). Plan:
`docs/superpowers/plans/2026-11-24-battle-all-systems.md`.

## Why

The Battle tab (`components/battle/`) is Nimble-only, so every campaign also carries the old
Party page (`components/board/PartyView.vue`: the old initiative tracker, roster, chat, the
docked quick-action and Scribe panels). D&D 5e and Pathfinder 2e campaigns have Party as their
only play page. We want one play page: Battle, for every system, and Party removed.

## What a 5e / PF2e campaign gets on Battle (v1: parity with Party, not new rules)

Everything Party gives them today, in the Battle layout, at every size (phone, tablet, desktop):

- **Initiative strip** (`BattleInitiative`): turn order, acting token, HP bars, conditions on
  hover. No summons (Nimble data), no action pips.
- **Right column / drawer / phone tabs:** Party cards (no pips, no mana), Chat, Scribe (Scribe
  already works for every system).
- **GM:** stat block (left; NPC stat blocks are already system-neutral), turn bar with Next,
  New round, Add creatures, Add party, End encounter; encounter grid with HP and conditions.
  Hidden: Sync summons, the Nimble/classic initiative switch (non-Nimble is always classic,
  as `useInitiative` already decides), action pips. The GM's hero view (`GmHero`, the hero
  stats dialog) shows the hero's vitals read-only: the board's HP and condition changes for
  heroes (`hero_hp_changes`, `gm_set_hero_condition`) are applied only by Nimble sheets.
- **Creature conditions:** the condition picker lists the campaign system's conditions: Nimble
  as today, PF2e from `PF2E_CONDITIONS` (`utils/sheetDefaults.ts`) extended to the remaster's
  full list, 5e the 15 SRD conditions. Names only (no values like "Frightened 2" in v1).
- **Player with a seated hero:** a read-only hero card in the left column / phone Hero tab
  (portrait, name, class and level, HP with temp HP, AC, conditions, "Open full sheet ↗"),
  and in the centre a turn bar (Your turn / _name_ is acting / Not in combat, round) with
  **Roll initiative** while their row is unrolled (d20 + `initMod`, sent through the existing
  `set_my_initiative` RPC), above the classic roster (`BoardRoster`, which already shows 5e/PF2e
  details such as concentration and death saves). No action tiles, no turn steps, no sheet
  editor on the board.
- **Member without a seated hero:** as on Nimble today (watcher).

Nimble campaigns: unchanged, pixel for pixel, at every size.

## Party retired

- Removed: the Party tab and its label; `PartyView`, the old tracker `board/Initiative.vue`,
  the quick-action panel (`ActionPanel`, `ActionPanelBody`, `ActionPanelMenus`), the docked
  Scribe (`LorePanel`; `LorePanelChat` stays, Comms uses it), `useDockedPanel`,
  `assets/styles/_board-dock.scss`.
- Opening a campaign (`/board`, `/gm`) lands on Battle for every system.
- Old links keep working: `/campaigns/:id/board/party` and `/gm/party` redirect to Battle
  (query and hash kept); the dashboard and chat notifications link to Battle.
- Analytics keeps `'party'` as a surface so old events still chart; nothing new records it.
- The GM's Table panel (invites, session, players) stays reachable from the campaign name on
  the Battle bar (desktop, tablet, phone), as today.

## Out of scope (later)

5e/PF2e action economy (PF2e's 3 action pips, 5e action/bonus/reaction), valued conditions,
editing a 5e/PF2e hero's HP or conditions from the board, a 5e/PF2e quick-action panel.
