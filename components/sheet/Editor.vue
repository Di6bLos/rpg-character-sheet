<script setup lang="ts">
// "Edit sheet" form: every stored number and list for the character's system.
// The play layouts stay read-only apart from trackers; structure is edited here.
import type {
  Dnd5eAbility,
  Dnd5eSheet,
  NimbleSheet,
  NimbleStat,
  Pf2eAttr,
  Pf2eSheet,
} from '~/types/sheets'
import { canRestore, restoreLevel } from '~/utils/levelHistory'

const { draft, save } = useSheet()
const snackbar = useSnackbarStore()

const system = computed(() => draft.value.system)
const d5 = computed(() => draft.value.sheet as Dnd5eSheet)
const pf = computed(() => draft.value.sheet as Pf2eSheet)
const nb = computed(() => draft.value.sheet as NimbleSheet)

const ABILITIES: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const ATTRS: Pf2eAttr[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const NIMBLE_STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
const RANKS = ['U', 'T', 'E', 'M', 'L']
const DICE = [4, 6, 8, 10, 12]

function toggleSave(k: Dnd5eAbility) {
  const list = d5.value.saveProfs
  const idx = list.indexOf(k)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(k)
}

// Levels only go up through the Level up dialog. Lowering one undoes what the
// higher levels granted, after a warning.
const levelPick = ref(draft.value.level)
const lowerOpen = ref(false)
const lowering = ref(false)
watch(
  () => draft.value.level,
  (v) => (levelPick.value = v),
)
watch(lowerOpen, (isOpen) => {
  if (!isOpen && !lowering.value) levelPick.value = draft.value.level
})

const lowerTarget = computed(() => levelPick.value)
const lostLevels = computed(() => {
  const from = lowerTarget.value + 1
  const to = draft.value.level
  return from === to ? `level ${to}` : `levels ${from}–${to}`
})
const fullUndo = computed(() => canRestore(draft.value.sheet, lowerTarget.value))
const hpMaxAfter = computed(() => {
  const entry = draft.value.sheet.levelHistory?.find((e) => e.level === lowerTarget.value + 1)
  const hp = entry?.before.hpMax
  return typeof hp === 'number' ? hp : null
})

function onLevelPick() {
  if (levelPick.value < draft.value.level) lowerOpen.value = true
}

async function confirmLower() {
  const target = lowerTarget.value
  lowering.value = true
  try {
    restoreLevel(draft.value.sheet, target)
    draft.value.level = target
    lowerOpen.value = false
    await save()
    snackbar.show(`${draft.value.name} is now level ${target}`)
  } finally {
    lowering.value = false
  }
}

const inventoryCols = computed(() => [
  { key: 'name', label: 'Item', width: 'minmax(160px, 3fr)' },
  { key: 'qty', label: system.value === 'pf2e' ? 'Bulk' : 'Qty', width: 'minmax(80px, 1fr)' },
])
</script>

<template>
  <div class="panel editor">
    <div class="panel-title" style="margin: 0">
      <h2 style="font-size: 22px">Edit sheet</h2>
      <span class="small muted">Changes save automatically.</span>
    </div>

    <!-- Shared -->
    <fieldset class="group">
      <legend>Basics</legend>
      <div class="grid">
        <div class="field span-2">
          <label for="ed-name">Character name</label>
          <input id="ed-name" v-model="draft.name" class="input" maxlength="80" />
        </div>
        <div class="field">
          <label for="ed-level">Level</label>
          <select
            id="ed-level"
            v-model.number="levelPick"
            class="input"
            aria-describedby="ed-level-hint"
            @change="onLevelPick"
          >
            <option v-for="l in draft.level" :key="l" :value="l">
              {{ l === draft.level ? `${l} (current)` : `Lower to ${l}` }}
            </option>
          </select>
          <span id="ed-level-hint" class="hint">Use Level up to go higher.</span>
        </div>
        <div class="field">
          <label for="ed-xp">XP</label>
          <input id="ed-xp" v-model.number="draft.sheet.xp" class="input" type="number" min="0" />
        </div>
        <div class="field">
          <label for="ed-xpnext">XP for next level</label>
          <input
            id="ed-xpnext"
            v-model.number="draft.sheet.xpNext"
            class="input"
            type="number"
            min="1"
          />
        </div>
        <div class="field">
          <label for="ed-hp">Current HP</label>
          <input id="ed-hp" v-model.number="draft.sheet.hp" class="input" type="number" min="0" />
        </div>
        <div class="field">
          <label for="ed-hpmax">Maximum HP</label>
          <input
            id="ed-hpmax"
            v-model.number="draft.sheet.hpMax"
            class="input"
            type="number"
            min="1"
          />
        </div>
        <div class="field">
          <label for="ed-ac">{{ system === 'nimble' ? 'Armor' : 'Armor Class' }}</label>
          <input id="ed-ac" v-model.number="draft.sheet.ac" class="input" type="number" />
        </div>
        <div class="field">
          <label for="ed-init">Initiative modifier</label>
          <input id="ed-init" v-model.number="draft.sheet.initMod" class="input" type="number" />
        </div>
        <div v-if="system !== 'nimble'" class="field">
          <label for="ed-pp">Passive Perception</label>
          <input
            id="ed-pp"
            v-model.number="draft.sheet.passivePerception"
            class="input"
            type="number"
          />
        </div>
      </div>
    </fieldset>

    <!-- D&D 5e -->
    <template v-if="system === 'dnd5e'">
      <fieldset class="group">
        <legend>Identity</legend>
        <div class="grid">
          <div class="field">
            <label for="d5-race">Race</label
            ><input id="d5-race" v-model="d5.lineage" class="input" />
          </div>
          <div class="field span-2">
            <label for="d5-class">Class</label
            ><input id="d5-class" v-model="d5.class" class="input" />
          </div>
          <div class="field">
            <label for="d5-bg">Background</label
            ><input id="d5-bg" v-model="d5.background" class="input" />
          </div>
          <div class="field">
            <label for="d5-al">Alignment</label
            ><input id="d5-al" v-model="d5.alignment" class="input" />
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Ability scores</legend>
        <div class="grid grid--stats">
          <div v-for="k in ABILITIES" :key="k" class="field">
            <label :for="`d5-${k}`">{{ k }}</label>
            <input
              :id="`d5-${k}`"
              v-model.number="d5.abilities[k]"
              class="input"
              type="number"
              min="1"
              max="30"
            />
            <label class="check">
              <input type="checkbox" :checked="d5.saveProfs.includes(k)" @change="toggleSave(k)" />
              Save proficiency
            </label>
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Combat</legend>
        <div class="grid">
          <div class="field">
            <label for="d5-speed">Speed</label
            ><input id="d5-speed" v-model="d5.speed" class="input" />
          </div>
          <div class="field">
            <label for="d5-prof">Proficiency bonus</label>
            <input
              id="d5-prof"
              v-model.number="d5.profBonus"
              class="input"
              type="number"
              min="2"
              max="6"
            />
          </div>
          <div class="field">
            <label for="d5-hd">Hit die</label>
            <select id="d5-hd" v-model.number="d5.hitDie" class="input">
              <option v-for="d in DICE.slice(1)" :key="d" :value="d">d{{ d }}</option>
            </select>
          </div>
        </div>
      </fieldset>
      <SheetListEditor
        v-model="d5.weapons"
        title="Weapons & attacks"
        add-label="Add weapon"
        :blank="() => ({ name: '', atk: 0, dmg: '1d6', type: '', range: '' })"
        :columns="[
          { key: 'name', label: 'Weapon', width: 'minmax(140px, 2fr)' },
          { key: 'atk', label: 'To hit', type: 'number', width: '84px' },
          { key: 'dmg', label: 'Damage', width: '110px' },
          { key: 'type', label: 'Type', width: 'minmax(100px, 1fr)' },
          { key: 'range', label: 'Range / traits', width: 'minmax(140px, 2fr)' },
        ]"
      />
      <SheetListEditor
        v-model="d5.features"
        title="Features & spells"
        add-label="Add feature"
        :blank="() => ({ name: '', desc: '' })"
        :columns="[
          { key: 'name', label: 'Name', width: 'minmax(160px, 1fr)' },
          { key: 'desc', label: 'Description', type: 'textarea', width: 'minmax(220px, 2fr)' },
        ]"
      />
    </template>

    <!-- Pathfinder 2e -->
    <template v-else-if="system === 'pf2e'">
      <fieldset class="group">
        <legend>Identity</legend>
        <div class="grid">
          <div class="field">
            <label for="pf-e-anc">Ancestry</label
            ><input id="pf-e-anc" v-model="pf.lineage" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-her">Heritage</label
            ><input id="pf-e-her" v-model="pf.heritage" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-bg">Background</label
            ><input id="pf-e-bg" v-model="pf.background" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-cls">Class</label
            ><input id="pf-e-cls" v-model="pf.class" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-sub">Subclass</label
            ><input id="pf-e-sub" v-model="pf.subclass" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-deity">Deity</label
            ><input id="pf-e-deity" v-model="pf.deity" class="input" />
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Attribute modifiers</legend>
        <div class="grid grid--stats">
          <div v-for="k in ATTRS" :key="k" class="field">
            <label :for="`pf-e-${k}`">{{ k }}</label>
            <input
              :id="`pf-e-${k}`"
              v-model.number="pf.attrs[k]"
              class="input"
              type="number"
              min="-5"
              max="10"
            />
          </div>
          <div class="field">
            <label for="pf-e-key">Key attribute</label>
            <select id="pf-e-key" v-model="pf.keyAttr" class="input">
              <option v-for="k in ATTRS" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Defenses</legend>
        <div class="grid">
          <div class="field">
            <label for="pf-e-acrank">AC proficiency</label>
            <select id="pf-e-acrank" v-model="pf.acRank" class="input">
              <option v-for="r in RANKS" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="field">
            <label for="pf-e-speed">Speed</label
            ><input id="pf-e-speed" v-model="pf.speed" class="input" />
          </div>
          <div class="field">
            <label for="pf-e-hpl">HP per level</label
            ><input
              id="pf-e-hpl"
              v-model.number="pf.hpPerLevel"
              class="input"
              type="number"
              min="6"
              max="12"
            />
          </div>
          <div class="field">
            <label for="pf-e-temp">Temp HP</label
            ><input id="pf-e-temp" v-model.number="pf.tempHp" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label for="pf-e-dying">Dying</label
            ><input
              id="pf-e-dying"
              v-model.number="pf.dying"
              class="input"
              type="number"
              min="0"
              max="4"
            />
          </div>
          <div class="field">
            <label for="pf-e-wounded">Wounded</label
            ><input
              id="pf-e-wounded"
              v-model.number="pf.wounded"
              class="input"
              type="number"
              min="0"
            />
          </div>
        </div>
        <div class="grid">
          <div class="field span-2">
            <label for="pf-e-sh">Shield name</label>
            <input
              id="pf-e-sh"
              v-model="pf.shield.name"
              class="input"
              placeholder="Leave empty for no shield"
            />
          </div>
          <div class="field">
            <label for="pf-e-shh">Hardness</label
            ><input
              id="pf-e-shh"
              v-model.number="pf.shield.hardness"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label for="pf-e-shhp">Shield HP</label
            ><input
              id="pf-e-shhp"
              v-model.number="pf.shield.hp"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label for="pf-e-shmax">Shield max HP</label
            ><input
              id="pf-e-shmax"
              v-model.number="pf.shield.hpMax"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label for="pf-e-shbt">Broken threshold</label
            ><input
              id="pf-e-shbt"
              v-model.number="pf.shield.bt"
              class="input"
              type="number"
              min="0"
            />
          </div>
        </div>
      </fieldset>
      <SheetListEditor
        v-model="pf.saves"
        title="Saves, Perception & Class DC"
        add-label=""
        fixed
        :blank="() => ({ label: '', rank: 'T' as const, value: 0 })"
        :columns="[
          { key: 'label', label: 'Name', width: 'minmax(140px, 2fr)' },
          { key: 'rank', label: 'Rank', type: 'select', options: RANKS, width: '90px' },
          { key: 'value', label: 'Value', type: 'number', width: '100px' },
        ]"
      />
      <SheetListEditor
        v-model="pf.skills"
        title="Skills"
        add-label="Add skill or lore"
        :blank="() => ({ name: '', attr: 'INT' as const, rank: 'T' as const, value: 0 })"
        :columns="[
          { key: 'name', label: 'Skill', width: 'minmax(140px, 2fr)' },
          { key: 'attr', label: 'Attribute', type: 'select', options: ATTRS, width: '100px' },
          { key: 'rank', label: 'Rank', type: 'select', options: RANKS, width: '90px' },
          { key: 'value', label: 'Modifier', type: 'number', width: '100px' },
        ]"
      />
      <SheetListEditor
        v-model="pf.strikes"
        title="Strikes"
        add-label="Add strike"
        :blank="() => ({ name: '', bonus: 0, agile: false, dmg: '1d6', type: '', traits: '' })"
        :columns="[
          { key: 'name', label: 'Strike', width: 'minmax(140px, 2fr)' },
          { key: 'bonus', label: 'Attack', type: 'number', width: '84px' },
          { key: 'agile', label: 'Agile', type: 'checkbox', width: '60px' },
          { key: 'dmg', label: 'Damage', width: '110px' },
          { key: 'type', label: 'Type', width: 'minmax(100px, 1fr)' },
          { key: 'traits', label: 'Traits (comma separated)', width: 'minmax(160px, 2fr)' },
        ]"
      />
      <fieldset class="group">
        <legend>Focus &amp; hero points</legend>
        <div class="grid">
          <div class="field">
            <label for="pf-e-fmax">Focus pool</label
            ><input
              id="pf-e-fmax"
              v-model.number="pf.focus.max"
              class="input"
              type="number"
              min="0"
              max="3"
            />
          </div>
          <div class="field span-2">
            <label for="pf-e-fnote">Focus note</label
            ><input
              id="pf-e-fnote"
              v-model="pf.focus.note"
              class="input"
              placeholder="Lay on Hands · refocus for 10 min"
            />
          </div>
        </div>
      </fieldset>
      <SheetListEditor
        v-model="pf.feats"
        title="Feats & actions"
        add-label="Add feat"
        :blank="
          () => ({ type: 'Class', level: `Lvl ${draft.level}`, action: '', name: '', desc: '' })
        "
        :columns="[
          { key: 'type', label: 'Type', width: '110px' },
          { key: 'level', label: 'Level', width: '80px' },
          { key: 'action', label: 'Action', width: '70px' },
          { key: 'name', label: 'Name', width: 'minmax(140px, 1fr)' },
          { key: 'desc', label: 'Description', type: 'textarea', width: 'minmax(200px, 2fr)' },
        ]"
      />
      <fieldset class="group">
        <legend>Wealth &amp; Bulk</legend>
        <div class="grid">
          <div class="field">
            <label for="pf-e-gp">gp</label
            ><input id="pf-e-gp" v-model.number="pf.coins.gp" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label for="pf-e-sp">sp</label
            ><input id="pf-e-sp" v-model.number="pf.coins.sp" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label for="pf-e-cp">cp</label
            ><input id="pf-e-cp" v-model.number="pf.coins.cp" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label for="pf-e-bulk">Bulk before encumbered</label
            ><input
              id="pf-e-bulk"
              v-model.number="pf.bulkLimit"
              class="input"
              type="number"
              min="0"
            />
          </div>
        </div>
      </fieldset>
    </template>

    <!-- Nimble -->
    <template v-else>
      <fieldset class="group">
        <legend>Identity</legend>
        <div class="grid">
          <div class="field">
            <label for="nb-e-anc">Ancestry</label
            ><input id="nb-e-anc" v-model="nb.lineage" class="input" />
          </div>
          <div class="field">
            <label for="nb-e-cls">Class</label
            ><input id="nb-e-cls" v-model="nb.class" class="input" />
          </div>
          <div class="field">
            <label for="nb-e-sub">Subclass</label
            ><input id="nb-e-sub" v-model="nb.subclass" class="input" />
          </div>
          <div class="field">
            <label for="nb-e-bg">Background</label
            ><input id="nb-e-bg" v-model="nb.background" class="input" />
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Stats &amp; saves</legend>
        <div class="grid grid--stats">
          <div v-for="k in NIMBLE_STATS" :key="k" class="field">
            <label :for="`nb-e-${k}`">{{ k }}</label>
            <input
              :id="`nb-e-${k}`"
              v-model.number="nb.stats[k]"
              class="input"
              type="number"
              min="-5"
              max="10"
            />
          </div>
          <div class="field">
            <label for="nb-e-adv">Save with advantage</label>
            <select id="nb-e-adv" v-model="nb.saveAdv" class="input">
              <option value="">None</option>
              <option v-for="k in NIMBLE_STATS" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>
          <div class="field">
            <label for="nb-e-dis">Save with disadvantage</label>
            <select id="nb-e-dis" v-model="nb.saveDis" class="input">
              <option value="">None</option>
              <option v-for="k in NIMBLE_STATS" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Vitals</legend>
        <div class="grid">
          <div class="field">
            <label for="nb-e-speed">Speed</label
            ><input id="nb-e-speed" v-model="nb.speed" class="input" />
          </div>
          <div class="field">
            <label for="nb-e-hd">Hit die</label>
            <select id="nb-e-hd" v-model.number="nb.hitDie" class="input">
              <option v-for="d in DICE.slice(1)" :key="d" :value="d">d{{ d }}</option>
            </select>
          </div>
          <div class="field">
            <label for="nb-e-hdn">Hit dice available</label
            ><input id="nb-e-hdn" v-model.number="nb.hitDice" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label for="nb-e-wmax">Max wounds</label
            ><input
              id="nb-e-wmax"
              v-model.number="nb.woundsMax"
              class="input"
              type="number"
              min="1"
              max="12"
            />
          </div>
          <div class="field">
            <label for="nb-e-mana">Max mana</label
            ><input
              id="nb-e-mana"
              v-model.number="nb.mana.max"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label for="nb-e-gold">Gold</label
            ><input id="nb-e-gold" v-model="nb.gold" class="input" />
          </div>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Class resource</legend>
        <p class="small muted">
          A toggled state that adds bonus dice to melee damage, like a Berserker’s Rage and Fury
          dice. Leave the name empty if your class has none.
        </p>
        <div class="grid">
          <div class="field">
            <label for="nb-e-rn">Name</label
            ><input id="nb-e-rn" v-model="nb.resource.name" class="input" placeholder="Rage" />
          </div>
          <div class="field">
            <label for="nb-e-rd">Dice name</label
            ><input id="nb-e-rd" v-model="nb.resource.diceName" class="input" placeholder="Fury" />
          </div>
          <div class="field">
            <label for="nb-e-rdie">Die size</label>
            <select id="nb-e-rdie" v-model.number="nb.resource.die" class="input">
              <option v-for="d in DICE" :key="d" :value="d">d{{ d }}</option>
            </select>
          </div>
        </div>
      </fieldset>
      <SheetListEditor
        v-model="nb.attacks"
        title="Attacks"
        add-label="Add attack"
        :blank="() => ({ name: '', props: '', dmg: '1d6', melee: true })"
        :columns="[
          { key: 'name', label: 'Attack', width: 'minmax(140px, 2fr)' },
          { key: 'props', label: 'Properties', width: 'minmax(140px, 2fr)' },
          { key: 'dmg', label: 'Damage', width: '110px' },
          { key: 'melee', label: 'Melee', type: 'checkbox', width: '60px' },
        ]"
      />
      <SheetListEditor
        v-model="nb.skills"
        title="Skills"
        add-label=""
        fixed
        :blank="() => ({ name: '', stat: 'STR' as const, points: 0 })"
        :columns="[
          { key: 'name', label: 'Skill', width: 'minmax(140px, 2fr)' },
          { key: 'stat', label: 'Stat', type: 'select', options: NIMBLE_STATS, width: '100px' },
          { key: 'points', label: 'Skill points', type: 'number', width: '110px' },
        ]"
      />
      <SheetListEditor
        v-model="nb.abilities"
        title="Class abilities"
        add-label="Add ability"
        :blank="() => ({ name: '', src: '', desc: '' })"
        :columns="[
          { key: 'name', label: 'Name', width: 'minmax(140px, 1fr)' },
          { key: 'src', label: 'Source', width: '130px' },
          { key: 'desc', label: 'Description', type: 'textarea', width: 'minmax(200px, 2fr)' },
        ]"
      />
    </template>

    <SheetListEditor
      v-model="draft.sheet.inventory"
      title="Inventory"
      add-label="Add item"
      :blank="() => ({ name: '', qty: '1' })"
      :columns="inventoryCols"
    />

    <UiDialog
      v-model="lowerOpen"
      :title="`Lower ${draft.name} to level ${lowerTarget}?`"
      alert
      width="500px"
    >
      <div class="notice notice--error">
        <strong>Everything gained at {{ lostLevels }} will be lost</strong>
        <template v-if="fullUndo">
          Abilities, spells, stat increases, skill points and hit points from those levels are
          removed<template v-if="hpMaxAfter !== null">
            (max HP goes back to {{ hpMaxAfter }})</template
          >, along with a subclass picked at those levels. This can’t be undone.
        </template>
        <template v-else>
          This sheet was levelled before level history was kept, so only abilities and picks tagged
          with those levels are removed. Fix stats and hit points by hand.
        </template>
      </div>
      <p class="small muted">
        Inventory, notes and wounds stay as they are; current HP is capped at the new maximum.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="lowerOpen = false">
          Keep level {{ draft.level }}
        </button>
        <button type="button" class="btn btn--danger" :disabled="lowering" @click="confirmLower">
          Lower to level {{ lowerTarget }}
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.editor {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.group {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;

  legend {
    padding: 0;
    margin-bottom: 10px;
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;

  &--stats {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}

.span-2 {
  grid-column: span 2;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--page-soft);

  input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
}

@media (max-width: 480px) {
  .span-2 {
    grid-column: auto;
  }
}
</style>
