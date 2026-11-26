<script setup lang="ts">
// The PF2e sheet's Inventory panel: Bulk against the encumbered and overloaded limits, which
// give and take the encumbered condition (Player Core p. 269); worn, held and stowed items;
// investing up to 10 (GM Core p. 219); coins; items added from the data (`ItemPicker`) or by
// name; runes etched on weapons, armor and staves (`RuneEtch`, GM Core pp. 224–225, 278); and using items
// (GM Core p. 220): consumables spend one and do what they do, scrolls and wands cast their
// spell, staves are prepared and spend charges (pp. 262, 278, 282). Rules in
// utils/pf2eInventory.ts and utils/pf2eItemUse.ts; results show under the panel.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import type { InventoryItem, Pf2eSheet } from '~/types/sheets'
import { actionGlyph, actionWords } from '~/utils/pf2eBuild'
import {
  INVEST_LIMIT,
  bulkLabel,
  bulkState,
  investedCount,
  itemState,
  needsInvesting,
  prepareStaff,
  reinforcedStats,
  runedName,
  setInvested,
  syncEncumbered,
} from '~/utils/pf2eInventory'
import {
  bombRank,
  castFromItem,
  itemCastProblem,
  pay,
  priceLabel,
  useConsumable,
} from '~/utils/pf2eItemUse'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultFor } = useResultOwner()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const { targetAc, nextAttack } = usePf2eStrikes()

const bulk = computed(() => bulkState(sheet.value))
const bulkPct = computed(() =>
  bulk.value.max > 0 ? Math.min(100, Math.round((bulk.value.bulk / bulk.value.max) * 100)) : 0,
)
const invested = computed(() => investedCount(sheet.value))

function run(message: string) {
  claim('inv', () => say(message))
}

/** A use's result shows under its row, or under the panel when the item was used up. */
function act(i: number, use: () => string) {
  const before = sheet.value.inventory.length
  const message = use()
  claim(sheet.value.inventory.length === before ? `inv:${i}` : 'inv', () => say(message))
}

// The encumbered condition follows the Bulk (Player Core p. 269).
watch(
  () => bulk.value.encumbered,
  () => {
    if (!canEdit.value) return
    const m = syncEncumbered(sheet.value)
    if (m) run(m)
  },
  { immediate: true },
)

const coinsCp = computed(() => {
  const c = sheet.value.coins
  return (c.pp ?? 0) * 1000 + c.gp * 100 + c.sp * 10 + c.cp
})
const COINS = ['pp', 'gp', 'sp', 'cp'] as const
function setCoin(k: (typeof COINS)[number], v: number) {
  if (!canEdit.value) return
  sheet.value.coins = { ...sheet.value.coins, [k]: Math.max(0, Math.floor(Number(v) || 0)) }
}

const CONSUMABLE = new Set([
  'potion',
  'elixir',
  'talisman',
  'ammunition',
  'oil',
  'bomb',
  'poison',
  'consumable',
])
const rows = computed(() =>
  sheet.value.inventory.map((item, index) => {
    const st = itemState(item)
    const kind = st.kind
    return {
      item,
      index,
      st,
      name: runedName(item),
      bulk: bulkLabel(st.bulk),
      consumable: !!kind && CONSUMABLE.has(kind),
      castable: (kind === 'scroll' || kind === 'wand') && !!st.spell,
      staff: kind === 'staff',
      // Staves are staff weapons and take fundamental runes (GM Core p. 278).
      runes: kind === 'weapon' || kind === 'armor' || kind === 'staff' || kind === 'shield',
      shield: kind === 'shield' ? reinforcedStats(st) : undefined,
      invest: needsInvesting(st),
    }
  }),
)

const picking = ref(false)
function added(item: InventoryItem, cost: number) {
  if (cost && !pay(sheet.value, cost)) return run('Not enough coins.')
  sheet.value.inventory.push(item)
  const n = item.pf2e?.count ?? 1
  run(`Added ${n > 1 ? `${n} × ` : ''}${item.name}${cost ? ` for ${priceLabel(cost)}` : ''}.`)
}

const newName = ref('')
const newBulk = ref('L')
function addByName() {
  const name = newName.value.trim()
  if (!name || !canEdit.value) return
  sheet.value.inventory.push({ name, qty: newBulk.value || '—' })
  newName.value = ''
}

function step(i: number, by: number) {
  const item = sheet.value.inventory[i]
  if (!item || !canEdit.value) return
  item.pf2e ??= itemState(item)
  item.pf2e.count = Math.max(1, item.pf2e.count + by)
}
function remove(i: number) {
  if (!canEdit.value) return
  const [gone] = sheet.value.inventory.splice(i, 1)
  if (gone) run(`Removed ${gone.name}.`)
}
function setCarry(i: number, carry: 'worn' | 'held' | 'stowed') {
  const item = sheet.value.inventory[i]
  if (!item || !canEdit.value) return
  item.pf2e ??= itemState(item)
  item.pf2e.carry = carry
  if (carry !== 'worn' && item.pf2e.invested) item.pf2e.invested = false
}
function toggleInvest(i: number) {
  const st = sheet.value.inventory[i]?.pf2e
  if (canEdit.value && st) claim(`inv:${i}`, () => say(setInvested(sheet.value, i, !st.invested)))
}

// --- Spells for scrolls, wands and staves -----------------------------------------------
const spells = shallowRef<Pf2eSpellDef[]>([])
async function spellData() {
  if (!spells.value.length) spells.value = await loadPf2e('spells')
  return spells.value
}
const spellNamed = (name: string) => {
  const base = name.replace(/\s*\([^)]*\)$/, '').toLowerCase()
  return spells.value.find((s) => s.name.toLowerCase() === base)
}

const castOptions = () => ({
  level: level.value,
  targetAc: targetAc.value,
  attackNumber: nextAttack.value,
})

async function castItem(i: number) {
  const st = sheet.value.inventory[i]?.pf2e
  if (!st?.spell || !canEdit.value) return
  try {
    const list = await spellData()
    const spell = list.find((s) => s.id === st.spell!.id)
    if (!spell) return run(`${st.spell.name} isn't in the spell data.`)
    act(i, () => castFromItem(sheet.value, i, spell, castOptions()))
  } catch {
    run('The spell data couldn’t load.')
  }
}

const openStaff = ref<number | null>(null)
watch(
  () => sheet.value.inventory.length,
  () => (openStaff.value = null),
)
async function toggleStaff(i: number) {
  openStaff.value = openStaff.value === i ? null : i
  if (openStaff.value !== null) await spellData().catch(() => undefined)
}
/** A prepared caster's unspent slots, to expend into the staff (GM Core p. 278). */
const expendSlots = computed(() => {
  const sc = sheet.value.spellcasting
  if (sc?.kind !== 'prepared') return []
  return sc.slots.flatMap((r, ri) =>
    (r.prepared ?? []).flatMap((p, si) =>
      p.cast ? [] : [{ key: `${ri + 1}:${si}`, rank: ri + 1, slot: si }],
    ),
  )
})
const expend = ref('')
function prepare(i: number) {
  if (!canEdit.value) return
  const pick = expendSlots.value.find((x) => x.key === expend.value)
  claim(`inv:${i}`, () => say(prepareStaff(sheet.value, i, pick)))
  expend.value = ''
}
/** A spontaneous caster's slot that pays for a staff spell with 1 charge (by spell rank). */
const staffSlot = ref<Record<string, number>>({})
const spontaneous = computed(() => sheet.value.spellcasting?.kind === 'spontaneous')
const slotRanks = (rank: number) =>
  (sheet.value.spellcasting?.slots ?? [])
    .map((r, i) => ({ rank: i + 1, left: r.max - r.used }))
    .filter((r) => r.rank >= rank && r.left > 0)
function castStaff(i: number, name: string, rank: number) {
  const spell = spellNamed(name)
  if (!spell || !canEdit.value) return run(`${name} isn't in the spell data.`)
  const slotRank = staffSlot.value[`${i}:${rank}`] || undefined
  act(i, () => castFromItem(sheet.value, i, spell, { ...castOptions(), rank, slotRank }))
}
const staffProblem = (name: string, rank: number) => {
  const spell = spellNamed(name)
  if (!spell) return spells.value.length ? 'Not in the spell data' : ''
  return itemCastProblem(sheet.value, spell, rank || 1, true) ?? ''
}

// --- Consumables ----------------------------------------------------------------------
async function use(i: number) {
  const st = sheet.value.inventory[i]?.pf2e
  if (!st || !canEdit.value) return
  let rank: Pf2eSheet['acRank'] | undefined
  if (st.bomb && sheet.value.classSlug) {
    try {
      const [classes, deities] = await Promise.all([loadPf2e('classes'), loadPf2e('deities')])
      rank = bombRank(sheet.value, level.value, {
        classes,
        deities,
        ancestries: [],
        heritages: [],
        backgrounds: [],
        feats: [],
        weapons: [],
        armor: [],
        shields: [],
        spells: [],
      })
    } catch {
      rank = undefined
    }
  }
  act(i, () =>
    useConsumable(sheet.value, i, {
      level: level.value,
      targetAc: targetAc.value,
      ...(rank ? { bombRank: rank } : {}),
    }),
  )
}

const etching = ref<number | null>(null)
const etchOpen = computed({
  get: () => etching.value !== null,
  set: (v) => {
    if (!v) etching.value = null
  },
})
function etched(message: string, cost: number) {
  if (cost && !pay(sheet.value, cost)) return run('Not enough coins for the rune.')
  run(cost ? `${message} Paid ${priceLabel(cost)}.` : message)
}

const activationLine = (a: NonNullable<InventoryItem['pf2e']>['activations']) =>
  (a ?? [])
    .map((x) =>
      [
        x.name,
        x.actions !== undefined ? actionGlyph(x.actions) : '',
        x.as,
        x.traits.length ? `(${x.traits.join(', ')})` : '',
        x.frequency ? `· ${x.frequency}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('; ')
</script>

<template>
  <section class="panel stack" style="gap: 10px" aria-labelledby="inv-h">
    <UiFold name="Inventory" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="inv-h">Inventory</h2>
        <UiHelp
          label="About Bulk"
          text="You can carry up to 10 + STR Bulk and are encumbered over 5 + STR (clumsy 1, −10 feet Speed). 10 light items make 1 Bulk; negligible items don't count. Worn magic items need investing, up to 10 (Player Core p. 269, GM Core p. 219)."
        />
      </div>
      <span class="bulk" :class="{ over: bulk.encumbered }">
        Bulk {{ bulk.bulk }} / {{ bulk.limit }}
      </span>
    </div>
    <div
      class="meter meter--thin"
      :class="bulk.encumbered ? 'meter--over' : 'meter--accent'"
      role="img"
      :aria-label="`Bulk ${bulk.bulk} of ${bulk.max} you can carry; encumbered over ${bulk.limit}`"
    >
      <span :style="{ width: bulkPct + '%' }" />
    </div>
    <p v-if="bulk.overloaded" class="notice notice--error" role="status">
      Overloaded: you can’t carry more than {{ bulk.max }} Bulk (10 + STR).
    </p>
    <p v-else-if="bulk.encumbered" class="notice" role="status">
      Encumbered over {{ bulk.limit }} Bulk (5 + STR): clumsy 1 and −10 feet to your Speeds.
    </p>
    <div class="facts">
      <span
        >Encumbered over <strong>{{ bulk.limit }}</strong
        >, max <strong>{{ bulk.max }}</strong></span
      >
      <span
        >Invested <strong>{{ invested }} / {{ INVEST_LIMIT }}</strong></span
      >
      <span v-if="bulk.light"
        >Light items <strong>{{ bulk.light }}</strong></span
      >
      <span v-if="bulk.backpack" title="A worn backpack: its first 2 Bulk don't count"
        >Backpack <strong>−{{ bulk.backpack }} Bulk</strong></span
      >
      <span v-if="bulk.coins"
        >Coins <strong>{{ bulk.coins }} Bulk</strong></span
      >
    </div>

    <ul class="items" aria-label="Items">
      <li v-for="r in rows" :key="r.index" class="item">
        <div class="item__head">
          <div class="item__text">
            <span class="item__name"
              >{{ r.name }}<span v-if="r.st.kind" class="tag">{{ r.st.kind }}</span></span
            >
            <span class="item__meta">
              Bulk {{ r.bulk
              }}<template v-if="r.st.level !== undefined"> · Item {{ r.st.level }}</template
              ><template v-if="r.st.usage"> · {{ r.st.usage }}</template
              ><template v-if="r.staff"> · {{ r.st.charges ?? 0 }} charges</template
              ><template v-if="r.shield">
                · Hardness {{ r.shield.hardness }}, HP {{ r.shield.hp }}, BT
                {{ r.shield.bt }}</template
              ><template v-if="r.st.poisoned"> · {{ r.st.poisoned.name }} applied</template
              ><template v-if="r.st.wand?.broken"> · broken</template
              ><template v-else-if="r.st.wand?.cast"> · used today</template>
            </span>
          </div>
          <div class="item__tools">
            <button
              type="button"
              class="step step--xs"
              :aria-label="`One fewer ${r.item.name}`"
              :disabled="!canEdit || r.st.count <= 1"
              @click="step(r.index, -1)"
            >
              −
            </button>
            <span class="item__qty" :aria-label="`${r.st.count} carried`">{{ r.st.count }}</span>
            <button
              type="button"
              class="step step--xs"
              :aria-label="`One more ${r.item.name}`"
              :disabled="!canEdit"
              @click="step(r.index, 1)"
            >
              +
            </button>
            <select
              class="input carry"
              :value="r.st.carry"
              :aria-label="`How ${r.item.name} is carried`"
              :disabled="!canEdit"
              @change="setCarry(r.index, ($event.target as HTMLSelectElement).value as 'worn')"
            >
              <option value="worn">Worn</option>
              <option value="held">Held</option>
              <option value="stowed">Stowed</option>
            </select>
            <button
              type="button"
              class="remove"
              :aria-label="`Remove ${r.item.name}`"
              title="Remove"
              :disabled="!canEdit"
              @click="remove(r.index)"
            >
              ×
            </button>
          </div>
        </div>
        <div
          v-if="r.invest || r.consumable || r.castable || r.staff || r.runes"
          class="item__actions"
        >
          <button
            v-if="r.invest"
            type="button"
            class="toggle"
            :aria-pressed="!!r.st.invested"
            :aria-label="`Invested: ${r.item.name}`"
            :disabled="!canEdit"
            @click="toggleInvest(r.index)"
          >
            {{ r.st.invested ? 'Invested' : 'Invest' }}
          </button>
          <button
            v-if="r.consumable"
            type="button"
            class="btn btn--sm"
            :aria-label="`${r.st.bomb ? 'Throw' : 'Use'} ${r.item.name}${r.st.activations?.[0]?.actions ? `, ${actionWords(r.st.activations[0].actions)}` : ''}`"
            :disabled="!canEdit"
            @click="use(r.index)"
          >
            {{ r.st.bomb ? 'Throw' : 'Use' }}
            <span v-if="r.st.activations?.[0]?.actions" class="glyph" aria-hidden="true">{{
              actionGlyph(r.st.activations[0].actions)
            }}</span>
          </button>
          <button
            v-if="r.castable"
            type="button"
            class="btn btn--sm"
            :disabled="!canEdit || !!r.st.wand?.broken"
            @click="castItem(r.index)"
          >
            {{
              r.st.wand?.broken
                ? 'Broken until Repaired:'
                : r.st.kind === 'wand' && r.st.wand?.cast
                  ? 'Overcharge'
                  : 'Cast'
            }}
            {{ r.st.spell?.name }}
          </button>
          <button
            v-if="r.staff"
            type="button"
            class="btn btn--ghost btn--sm"
            :aria-expanded="openStaff === r.index"
            :aria-label="`Spells in ${r.item.name}`"
            @click="toggleStaff(r.index)"
          >
            Spells {{ openStaff === r.index ? '▴' : '▾' }}
          </button>
          <button
            v-if="r.runes"
            type="button"
            class="btn btn--ghost btn--sm"
            :aria-label="`Runes on ${r.item.name}`"
            :disabled="!canEdit"
            @click="etching = r.index"
          >
            Runes
          </button>
        </div>
        <p v-if="r.st.activations?.length" class="item__act">
          Activate {{ activationLine(r.st.activations) }}
        </p>

        <div v-if="r.staff && openStaff === r.index" class="staff">
          <div class="staff__prep">
            <label v-if="expendSlots.length" class="field grow" :for="`pf-staff-x-${r.index}`">
              <span class="caps">Expend a slot for more charges</span>
              <select :id="`pf-staff-x-${r.index}`" v-model="expend" class="input">
                <option value="">None</option>
                <option v-for="x in expendSlots" :key="x.key" :value="x.key">
                  Rank {{ x.rank }} slot (+{{ x.rank }})
                </option>
              </select>
            </label>
            <button
              type="button"
              class="btn btn--sm"
              :disabled="!canEdit"
              @click="prepare(r.index)"
            >
              Prepare staff
            </button>
          </div>
          <div v-for="group in r.st.spells" :key="group.rank" class="staff__rank">
            <span class="caps">{{ group.rank ? `Rank ${group.rank}` : 'Cantrip' }}</span>
            <div class="staff__spells">
              <button
                v-for="n in group.names"
                :key="n"
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="!canEdit || !!staffProblem(n, group.rank)"
                :title="staffProblem(n, group.rank) || undefined"
                :aria-label="`Cast ${n} from ${r.item.name}, ${group.rank ? `${group.rank} charge${group.rank > 1 ? 's' : ''}` : 'no charge'}`"
                @click="castStaff(r.index, n, group.rank)"
              >
                {{ n }}
                <span class="cost">{{
                  group.rank ? `${group.rank} charge${group.rank > 1 ? 's' : ''}` : 'free'
                }}</span>
              </button>
              <select
                v-if="spontaneous && group.rank && slotRanks(group.rank).length"
                v-model.number="staffSlot[`${r.index}:${group.rank}`]"
                class="input"
                :aria-label="`Pay rank ${group.rank} staff spells with a slot`"
              >
                <option :value="0">Pay with charges</option>
                <option v-for="sr in slotRanks(group.rank)" :key="sr.rank" :value="sr.rank">
                  1 charge + rank {{ sr.rank }} slot
                </option>
              </select>
            </div>
          </div>
        </div>
        <p v-if="resultFor(`inv:${r.index}`)" class="roll-status" role="status" aria-live="polite">
          {{ resultFor(`inv:${r.index}`) }}
        </p>
      </li>
    </ul>
    <p v-if="!sheet.inventory.length" class="empty">Nothing carried yet.</p>

    <div v-if="canEdit" class="add">
      <button type="button" class="btn btn--ghost btn--sm" @click="picking = true">
        Add item from the rules
      </button>
      <details class="add__more">
        <summary>Write one in</summary>
        <form class="add__name" @submit.prevent="addByName">
          <label class="field grow" for="pf-inv-name">
            <span class="caps">Or write one in</span>
            <input
              id="pf-inv-name"
              v-model="newName"
              class="input"
              maxlength="80"
              placeholder="Grandfather’s compass"
            />
          </label>
          <label class="field bulk-in" for="pf-inv-bulk">
            <span class="caps">Bulk</span>
            <input id="pf-inv-bulk" v-model="newBulk" class="input" maxlength="4" />
          </label>
          <button type="submit" class="btn btn--ghost btn--sm" :disabled="!newName.trim()">
            Add<span class="sr-only"> {{ newName.trim() || 'item' }}</span>
          </button>
        </form>
      </details>
    </div>

    <div class="coins" role="group" aria-label="Coins">
      <div v-for="k in COINS" :key="k" class="tile coin">
        <input
          :id="`pf-coin-${k}`"
          type="number"
          inputmode="numeric"
          min="0"
          :class="k"
          :value="sheet.coins[k] ?? 0"
          :readonly="!canEdit"
          @change="setCoin(k, Number(($event.target as HTMLInputElement).value))"
        />
        <label :for="`pf-coin-${k}`" class="tile__label">{{ k }}</label>
      </div>
    </div>
    <p v-if="resultFor('inv')" class="roll-status" role="status" aria-live="polite">
      {{ resultFor('inv') }}
    </p>

    <div class="field" style="margin-top: 6px">
      <label for="pf-notes" class="caps">Notes</label>
      <textarea
        id="pf-notes"
        v-model="sheet.notes"
        class="input"
        rows="3"
        style="min-height: 0; font-size: 14px"
        :readonly="!canEdit"
      />
    </div>

    <Pf2eItemPicker
      v-if="canEdit"
      v-model="picking"
      :level="level"
      :coins-cp="coinsCp"
      @add="added"
    />
    <Pf2eRuneEtch
      v-if="etching !== null && sheet.inventory[etching]"
      v-model="etchOpen"
      :item="sheet.inventory[etching]!"
      :level="level"
      :coins-cp="coinsCp"
      @etched="etched"
    />
  </section>
</template>

<style scoped lang="scss">
.bulk {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);
  font-variant-numeric: tabular-nums;

  &.over {
    color: var(--danger-text);
  }
}

.meter--over > span {
  background: var(--danger);
}

.notice {
  margin: 0;
}

.facts {
  display: flex;
  gap: 4px 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-bottom: 1px solid var(--track);
}

.item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 44px;
}

.item__text {
  flex: 1 1 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item__name {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

// The item's kind beside its name, as Nimble's inventory tags weapons and armor.
.tag {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.add__more > summary {
  display: flex;
  align-items: center;
  min-height: 36px;
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);
  cursor: pointer;
}

@media (pointer: coarse) {
  .add__more > summary {
    min-height: 44px;
  }
}

.item__meta,
.item__act {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.item__tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.item__qty {
  min-width: 20px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.carry {
  width: 108px;
  min-height: 36px;
  padding-block: 4px;
  font-size: 13px;
}

.remove {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: min(var(--radius-control), 6px);
  background: none;
  color: var(--page-muted);
  font-size: 20px;
  line-height: 1;

  &:hover:not(:disabled) {
    color: var(--danger-text);
    background: var(--danger-bg);
  }
}

.item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.toggle {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: min(var(--radius-control), 6px);
  background: none;
  color: var(--page-soft);
  font-size: 13px;
  font-weight: 700;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent-text);
  }
}

.glyph {
  margin-left: 2px;
}

.staff {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
}

.staff__prep {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
}

.staff__rank {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.staff__spells {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cost {
  font-size: 12px;
  font-weight: 500;
  color: var(--page-muted);
}

.add {
  display: flex;
  flex-direction: column;
  gap: 10px;

  > .btn {
    align-self: flex-start;
  }
}

.add__name {
  display: flex;
  align-items: flex-end;
  gap: 8px;

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
}

.bulk-in {
  width: 64px;
  flex: none;
}

.coins {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  .carry,
  .toggle {
    min-height: 44px;
  }

  .remove {
    width: 44px;
    height: 44px;
  }
}

@media (pointer: coarse) {
  .coin input {
    min-height: 44px;
  }
}
</style>
