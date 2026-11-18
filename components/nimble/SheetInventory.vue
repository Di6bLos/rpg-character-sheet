<script setup lang="ts">
// Inventory with Nimble's slot limit (10 + STR), coins and notes.
import type { CustomItem, InventoryItem, NimbleSheet, NimbleStat } from '~/types/sheets'
import {
  bookItem,
  catalog,
  customItem,
  isWeapon,
  itemAttack,
  itemStat,
  itemSummary,
} from '~/utils/nimbleItems'
import { inventorySlots, itemSlots } from '~/utils/nimblePlay'

const MAX_COINS = 999_999
const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
const RARITIES = ['Uncommon', 'Rare', 'Very Rare', 'Legendary']

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const slots = computed(() => inventorySlots(sheet.value))
const over = computed(() => slots.value.used > slots.value.max)
const pct = computed(() =>
  slots.value.max > 0 ? Math.min(100, Math.round((slots.value.used / slots.value.max) * 100)) : 100,
)

const SLOT_LABELS: Record<number, string> = { 0: 'small', 1: '1 slot', 2: '2 slots' }
const groups = catalog()

const items = computed(() =>
  sheet.value.inventory.map((item) => {
    const size = itemSlots(item)
    return {
      info: itemSummary(sheet.value, item, draft.value.level),
      item,
      qty: Number.parseInt(item.qty, 10) || 0,
      tag: item.custom?.rarity ?? item.tag ?? bookItem(item.name)?.tag ?? '',
      weapon: isWeapon(item),
      stat: itemStat(sheet.value, item, draft.value.level),
      equipped: sheet.value.attacks.some((a) => a.name === item.name),
      size,
      sizeLabel: SLOT_LABELS[size] ?? `${size} slots`,
    }
  }),
)

function adjust(item: InventoryItem, delta: number) {
  if (!canEdit.value) return
  const next = (Number.parseInt(item.qty, 10) || 0) + delta
  if (next <= 0) sheet.value.inventory = sheet.value.inventory.filter((i) => i !== item)
  else item.qty = String(next)
}

/** Cycles small → 1 slot → 2 slots. */
function cycleSize(item: InventoryItem) {
  if (canEdit.value) item.slots = (itemSlots(item) + 1) % 3
}

const uid = useId()
const building = ref(false)
const blank = (): CustomItem & { name: string } => ({
  name: '',
  kind: 'weapon',
  dice: '1d6',
  stat: 'STR',
  melee: true,
  damageType: '',
  props: '',
  armor: '',
  rarity: '',
  desc: '',
})
const draftItem = ref(blank())
const customReady = computed(() => !!customItem(draftItem.value.name, draftItem.value))

function addPicked(event: Event) {
  const select = event.target as HTMLSelectElement
  const item = canEdit.value ? bookItem(select.value) : null
  select.value = ''
  if (item) sheet.value.inventory.push(item)
}

function addCustom() {
  if (!canEdit.value) return
  const { name, ...custom } = draftItem.value
  const item = customItem(name, custom)
  if (!item) return
  sheet.value.inventory.push(item)
  draftItem.value = blank()
  building.value = false
}

function toggleEquip(item: InventoryItem) {
  if (!canEdit.value) return
  if (sheet.value.attacks.some((a) => a.name === item.name)) {
    sheet.value.attacks = sheet.value.attacks.filter((a) => a.name !== item.name)
    return
  }
  const attack = itemAttack(sheet.value, item, draft.value.level)
  if (attack) sheet.value.attacks = [...sheet.value.attacks, attack]
}

function setCoins(kind: 'gp' | 'sp', event: Event) {
  if (!canEdit.value) return
  const value = Math.floor(Number((event.target as HTMLInputElement).value)) || 0
  sheet.value.coins[kind] = Math.max(0, Math.min(MAX_COINS, value))
}
</script>

<template>
  <section class="panel stack" style="gap: 10px" aria-labelledby="inv-h">
    <UiFold name="Inventory" />
    <div class="panel-title" style="margin: 0">
      <h2 id="inv-h">Inventory</h2>
      <span class="slots" :class="{ over }">{{ slots.used }} / {{ slots.max }} slots</span>
    </div>
    <div class="meter meter--thin" :class="over ? 'meter--over' : 'meter--accent'">
      <span :style="{ width: pct + '%' }" />
    </div>
    <p v-if="over" class="notice notice--error" role="status">
      Carrying more than {{ slots.max }} slots (10 + STR).
    </p>

    <ul class="items">
      <li v-for="(row, i) in items" :key="i">
        <span class="items__name">
          <UiHelp v-if="row.info" :label="`About ${row.item.name}`" :text="row.info">
            {{ row.item.name }}
          </UiHelp>
          <template v-else>{{ row.item.name }}</template>
        </span>
        <span v-if="row.stat" class="stat">{{ row.stat }}</span>
        <span v-if="row.tag" class="tag">{{ row.tag }}</span>
        <button
          v-if="row.weapon && canEdit"
          type="button"
          class="equip"
          :aria-pressed="row.equipped"
          :aria-label="`${row.equipped ? 'Unequip' : 'Equip'} ${row.item.name} as an attack`"
          @click="toggleEquip(row.item)"
        >
          {{ row.equipped ? 'Equipped' : 'Equip' }}
        </button>
        <button
          type="button"
          class="size"
          :aria-label="`${row.item.name}: ${row.sizeLabel}. Change size`"
          :disabled="!canEdit"
          @click="cycleSize(row.item)"
        >
          {{ row.sizeLabel }}
        </button>
        <button
          type="button"
          class="step step--xs"
          :aria-label="`One fewer ${row.item.name}`"
          :disabled="!canEdit"
          @click="adjust(row.item, -1)"
        >
          −
        </button>
        <span class="items__qty">{{ row.qty }}</span>
        <button
          type="button"
          class="step step--xs"
          :aria-label="`One more ${row.item.name}`"
          :disabled="!canEdit"
          @click="adjust(row.item, 1)"
        >
          +
        </button>
      </li>
    </ul>
    <p v-if="!items.length" class="empty">Nothing carried yet.</p>

    <details v-if="canEdit" class="add-menu">
      <summary class="btn btn--ghost btn--sm">Add item</summary>
      <div class="add-menu__body">
        <div class="pickers">
          <label v-for="(g, gi) in groups" :key="g.label" class="field" :for="`${uid}-pick-${gi}`">
            <span class="caps">{{ g.label }}</span>
            <select :id="`${uid}-pick-${gi}`" class="input" value="" @change="addPicked">
              <option value="" disabled selected>Choose…</option>
              <option v-for="it in g.items" :key="it.name" :value="it.name">
                {{ it.name }}{{ it.hint ? ` · ${it.hint}` : '' }}
              </option>
            </select>
          </label>
        </div>
        <button
          type="button"
          class="btn btn--quiet btn--sm add-custom"
          :aria-expanded="building"
          @click="building = !building"
        >
          {{ building ? 'Cancel custom item' : 'Build a custom item' }}
        </button>
        <form v-if="building" class="tile custom" @submit.prevent="addCustom">
          <div class="custom__row">
            <label class="field grow"
              ><span class="caps">Name</span
              ><input
                v-model="draftItem.name"
                class="input"
                maxlength="80"
                placeholder="Frostbite Axe"
            /></label>
            <label class="field"
              ><span class="caps">Type</span
              ><select v-model="draftItem.kind" class="input">
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="shield">Shield</option>
                <option value="gear">Gear / item</option>
              </select></label
            >
          </div>
          <div v-if="draftItem.kind === 'weapon'" class="custom__row">
            <label class="field"
              ><span class="caps">Damage dice</span
              ><input v-model="draftItem.dice" class="input" placeholder="1d8" maxlength="8"
            /></label>
            <label class="field"
              ><span class="caps">Stat</span
              ><select v-model="draftItem.stat" class="input">
                <option v-for="st in STATS" :key="st" :value="st">{{ st }}</option>
              </select></label
            >
            <label class="field"
              ><span class="caps">Attack</span
              ><select v-model="draftItem.melee" class="input">
                <option :value="true">Melee</option>
                <option :value="false">Ranged</option>
              </select></label
            >
            <label class="field grow"
              ><span class="caps">Damage type</span
              ><input
                v-model="draftItem.damageType"
                class="input"
                placeholder="Slashing"
                maxlength="30"
            /></label>
            <NimbleWeaponProps v-model="draftItem.props" class="field custom__wide" />
          </div>
          <div v-else-if="draftItem.kind !== 'gear'" class="custom__row">
            <label class="field"
              ><span class="caps">Armor</span
              ><input
                v-model="draftItem.armor"
                class="input"
                :placeholder="draftItem.kind === 'shield' ? '+2' : '4+DEX (max 2)'"
                maxlength="30"
            /></label>
          </div>
          <div class="custom__row">
            <label class="field"
              ><span class="caps">Magic</span
              ><select v-model="draftItem.rarity" class="input">
                <option value="">Not magic</option>
                <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
              </select></label
            >
            <label class="field custom__wide"
              ><span class="caps">Effect / notes</span
              ><textarea
                v-model="draftItem.desc"
                class="input"
                rows="2"
                maxlength="500"
                placeholder="+1d4 cold damage on a hit; on a crit the target is Slowed."
              />
            </label>
          </div>
          <p
            v-if="draftItem.kind === 'weapon' && !customReady && draftItem.name.trim()"
            class="small"
          >
            Damage dice look like 1d8 or 2d6.
          </p>
          <button type="submit" class="btn btn--sm" :disabled="!customReady">
            Add to inventory
          </button>
        </form>
      </div>
    </details>

    <div class="coins">
      <div v-for="k in ['gp', 'sp'] as const" :key="k" class="tile coin">
        <input
          :id="`nb-coin-${k}`"
          type="number"
          min="0"
          :max="MAX_COINS"
          :value="sheet.coins[k]"
          :readonly="!canEdit"
          :class="k"
          @change="setCoins(k, $event)"
        />
        <label :for="`nb-coin-${k}`" class="tile__label">{{ k }}</label>
      </div>
    </div>

    <div class="field" style="margin-top: 6px">
      <label for="nb-notes" class="caps">Notes</label>
      <textarea
        id="nb-notes"
        v-model="sheet.notes"
        class="input"
        rows="3"
        style="min-height: 0; font-size: 14px"
        placeholder="Grudges, debts, oaths…"
        :readonly="!canEdit"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.slots {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);

  &.over {
    color: var(--danger-text);
  }
}

.meter--over > span {
  background: var(--danger);
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    border-bottom: 1px solid var(--track);
  }
}

.items__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.items__qty {
  min-width: 20px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--inset);
  color: var(--page-soft);
}

.size {
  min-width: 52px;
  padding: 4px 0;
  border: 0;
  background: none;
  text-align: right;
  font-size: 11px;
  color: var(--page-muted);
  text-decoration: underline dotted;
  text-underline-offset: 3px;

  &:disabled {
    text-decoration: none;
  }
}

.stat {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.equip {
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: none;
  color: var(--page-soft);
  font-size: 11px;
  font-weight: 700;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent-text);
  }
}

.add-menu {
  > summary {
    list-style: none;
    align-self: flex-start;
    width: fit-content;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: ' ▾';
    }
  }

  &[open] > summary::after {
    content: ' ▴';
  }
}

.add-menu__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.pickers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
  gap: 8px;

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
}

.add-custom {
  align-self: flex-start;
}

.custom {
  gap: 10px;
  padding: 12px;
}

.custom__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 90px;
  }

  .grow {
    flex: 1 1 140px;
  }
}

.custom__wide {
  flex: 1 1 100%;
}

.coins {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.coin {
  align-items: center;
  gap: 2px;
  padding: 8px;

  input {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    color: var(--page-text);
    appearance: textfield;

    &.gp {
      color: var(--accent-text);
    }

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
  }
}

@media (pointer: coarse) {
  .size {
    min-height: 44px;
  }
}
</style>
