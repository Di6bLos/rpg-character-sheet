<script setup lang="ts">
// Inventory with Nimble's slot limit (10 + STR), coins and notes.
import { weaponByName } from '~/data/nimble/core'
import type { InventoryItem, NimbleSheet } from '~/types/sheets'
import { inventorySlots, itemSlots } from '~/utils/nimblePlay'

const MAX_COINS = 999_999

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const slots = computed(() => inventorySlots(sheet.value))
const over = computed(() => slots.value.used > slots.value.max)
const pct = computed(() =>
  slots.value.max > 0 ? Math.min(100, Math.round((slots.value.used / slots.value.max) * 100)) : 100,
)

const SLOT_LABELS: Record<number, string> = { 0: 'small', 1: '1 slot', 2: '2 slots' }

const items = computed(() =>
  sheet.value.inventory.map((item) => {
    const size = itemSlots(item)
    return {
      item,
      qty: Number.parseInt(item.qty, 10) || 0,
      tag: item.tag ?? (weaponByName(item.name) ? 'Weapon' : ''),
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

const newItem = ref('')

function addItem() {
  const name = newItem.value.trim()
  if (!canEdit.value || !name) return
  sheet.value.inventory.push({ name, qty: '1' })
  newItem.value = ''
}

function setCoins(kind: 'gp' | 'sp', event: Event) {
  if (!canEdit.value) return
  const value = Math.floor(Number((event.target as HTMLInputElement).value)) || 0
  sheet.value.coins[kind] = Math.max(0, Math.min(MAX_COINS, value))
}
</script>

<template>
  <section class="panel stack" style="gap: 10px" aria-labelledby="inv-h">
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
        <span class="items__name">{{ row.item.name }}</span>
        <span v-if="row.tag" class="tag">{{ row.tag }}</span>
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

    <form v-if="canEdit" class="row add" @submit.prevent="addItem">
      <label for="nb-inv-new" class="sr-only">New item</label>
      <input
        id="nb-inv-new"
        v-model="newItem"
        class="input"
        placeholder="Add an item"
        maxlength="80"
      />
      <button type="submit" class="btn btn--ghost" :disabled="!newItem.trim()">Add</button>
    </form>

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

.add {
  gap: 8px;
  flex-wrap: nowrap;

  .input {
    flex: 1 1 auto;
    min-width: 0;
  }
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
