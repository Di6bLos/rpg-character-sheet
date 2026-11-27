<script setup lang="ts">
// The 5e sheet's Inventory, laid out like Nimble's: what the hero carries against Strength × 15
// lb (SRD 5.2.1 p. 190), each item with its rules on hover, quantity, Equip for armor and
// shields (one of each; the worn gear sets AC, utils/dnd5eItems.ts), a weapon's mastery,
// attunement for magic items that need it (at most 3, p. 204, more for an Artificer), an item's
// charges, adding from the data or a write-in (a weapon added also joins the Attacks), the
// Artificer's replicated items and stored spell (Dnd5eArtificer), and coins (cp, sp, ep, gp, pp).
import { loadDnd5e } from '~/data/dnd5e'
import type { Dnd5eMagicItemDef } from '~/data/dnd5e/types'
import type { Dnd5eCoins, Dnd5eSheet } from '~/types/sheets'
import { MASTERY_TEXT, WEAPON_PROPERTY_TEXT } from '~/utils/dnd5eAttacks'
import { attunementLimit } from '~/utils/dnd5eArtificer'
import { armorOf, carried, toggleAttune, wearItem } from '~/utils/dnd5eItems'
import { chargesOf } from '~/utils/dnd5eMagicItems'
import { dnd5eHero, norm5e } from '~/utils/dnd5ePlay'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultIn } = useResultOwner()
const { data, build } = useDnd5eSheet()
const sheet = computed(() => draft.value.sheet)

const magic = shallowRef<Dnd5eMagicItemDef[]>([])
async function loadMagic() {
  if (magic.value.length) return
  try {
    magic.value = await loadDnd5e('magicItems')
  } catch {
    // Magic items stay write-ins until the data loads.
  }
}
onMounted(loadMagic)

const find = <T extends { name: string }>(list: T[] | undefined, name: string) =>
  list?.find((x) => norm5e(x.name) === norm5e(name.replace(/\s*\(.*\)$/, '')))

const rows = computed(() =>
  sheet.value.inventory.map((item, i) => {
    const d = data.value
    const armor = d ? armorOf(d.armor, item.name) : undefined
    const weapon = find(d?.weapons, item.name)
    const gear = find(d?.gear, item.name)
    const mi = find(magic.value, item.name)
    const info = weapon
      ? `${weapon.category} ${weapon.type.toLowerCase()} weapon, ${weapon.damage} ${weapon.damageType}. ${weapon.propertyText.map((p) => `${p}: ${WEAPON_PROPERTY_TEXT[p.replace(/\s*\(.*$/, '')] ?? ''}`).join(' ')}`
      : armor
        ? `${armor.category}${armor.category === 'Shield' ? '' : ' armor'}: AC ${armor.category === 'Shield' ? `+${armor.ac}` : armor.ac}${armor.dex === 'full' ? ' + DEX' : armor.dex === 'max2' ? ' + DEX (max 2)' : ''}${armor.strength ? `, Strength ${armor.strength}` : ''}${armor.stealthDisadvantage ? ', Stealth Disadvantage' : ''}.`
        : (mi?.summary ?? mi?.text ?? gear?.summary ?? gear?.text ?? '')
    return {
      i,
      item,
      info: info.trim(),
      armor,
      mastery:
        weapon && (sheet.value.masteries ?? []).includes(weapon.slug) ? weapon.mastery : null,
      attune: !!mi?.attunement || (!!item.replicated && /attunement/i.test(planText(item.name))),
      rarity: mi?.rarity ?? (item.replicated ? 'Replicated' : ''),
      charges: chargesOf(mi?.text),
    }
  }),
)

const load = computed(() => (data.value ? carried(sheet.value, data.value) : null))
const over = computed(() => !!load.value && load.value.weight > load.value.capacity)
const pct = computed(() =>
  load.value
    ? Math.min(100, Math.round((load.value.weight / Math.max(1, load.value.capacity)) * 100))
    : 0,
)
const attuned = computed(() => sheet.value.inventory.filter((i) => i.attuned).length)
const attuneMax = computed(() => attunementLimit(sheet.value, draft.value.level))
const artificer = computed(() =>
  dnd5eHero(sheet.value, draft.value.level).has('Replicate Magic Item'),
)

/** A replicated item's plan summary (for whether it needs Attunement). */
function planText(name: string) {
  const plans = data.value?.options.find((g) => g.slug === 'plans')?.entries ?? []
  return plans.find((p) => name.includes(p.name))?.summary ?? ''
}

function charge(i: number, by: number, max: number) {
  if (!canEdit.value) return
  const item = sheet.value.inventory[i]
  if (!item) return
  item.chargesUsed = Math.max(0, Math.min(max, (item.chargesUsed ?? 0) - by))
}

function equip(i: number) {
  if (!canEdit.value || !data.value) return
  const line = wearItem(sheet.value, i, data.value.armor, build.value)
  if (line) claim('inv:', () => say(line))
}

function attune(i: number) {
  if (canEdit.value) claim('inv:', () => say(toggleAttune(sheet.value, i, attuneMax.value)))
}

function setQty(i: number, by: number) {
  if (!canEdit.value) return
  const item = sheet.value.inventory[i]
  if (!item) return
  const n = Math.max(0, (Number.parseInt(item.qty, 10) || 1) + by)
  if (n === 0) return remove(i)
  item.qty = String(n)
}

function remove(i: number) {
  if (!canEdit.value) return
  const item = sheet.value.inventory[i]
  if (!item) return
  if (item.worn && data.value && armorOf(data.value.armor, item.name))
    wearItem(sheet.value, i, data.value.armor, build.value)
  sheet.value.inventory = sheet.value.inventory.filter((_, k) => k !== i)
}

const adding = ref('')
const catalog = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    ...d.weapons.map((x) => x.name),
    ...d.armor.map((x) => x.name),
    ...d.gear.map((x) => x.name),
    ...magic.value.map((x) => x.name),
  ]
})

function add() {
  const name = adding.value.trim()
  if (!canEdit.value || !name) return
  const d = data.value
  const weapon = find(d?.weapons, name)
  const armor = d ? armorOf(d.armor, name) : undefined
  sheet.value.inventory = [
    ...sheet.value.inventory,
    {
      name: weapon?.name ?? armor?.name ?? name,
      qty: '1',
      ...(weapon
        ? { tag: 'Weapon' }
        : armor
          ? { tag: armor.category === 'Shield' ? 'Shield' : 'Armor' }
          : {}),
    },
  ]
  if (weapon && !sheet.value.weapons.some((w) => w.slug === weapon.slug))
    sheet.value.weapons = [
      ...sheet.value.weapons,
      {
        name: weapon.name,
        atk: 0,
        dmg: weapon.damage,
        type: weapon.damageType,
        range: weapon.range ? `${weapon.range.normal}/${weapon.range.long} ft` : '5 ft',
        slug: weapon.slug,
      },
    ]
  adding.value = ''
}

const COINS: (keyof Dnd5eCoins)[] = ['cp', 'sp', 'ep', 'gp', 'pp']
function setCoin(k: keyof Dnd5eCoins, v: string) {
  if (!canEdit.value) return
  const n = Math.max(0, Math.floor(Number(v) || 0))
  sheet.value.coins = { gp: 0, ...sheet.value.coins, [k]: n }
}
</script>

<template>
  <section class="panel stack" style="gap: 10px" aria-labelledby="inv-h">
    <UiFold name="Inventory" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="inv-h">Inventory</h2>
        <UiHelp
          label="About inventory"
          :text="`Equip armor and a shield to wear them: what you wear sets your AC (SRD 5.2.1 p. 92). Attune to up to ${attuneMax} magic items that need it (p. 204). You can carry Strength × 15 lb (p. 190).`"
        />
      </div>
      <span v-if="load" class="small" :class="{ over }"
        >{{ load.weight }} / {{ load.capacity }} lb</span
      >
    </div>
    <div v-if="load" class="meter meter--thin" :class="over ? 'meter--over' : 'meter--accent'">
      <span :style="{ width: pct + '%' }" />
    </div>
    <p v-if="over" class="notice notice--error" role="status">
      Carrying more than {{ load?.capacity }} lb.
    </p>

    <ul class="items">
      <li v-for="r in rows" :key="r.i">
        <span class="items__name">
          <UiHelp v-if="r.info" :label="`About ${r.item.name}`" :text="r.info">{{
            r.item.name
          }}</UiHelp>
          <template v-else>{{ r.item.name }}</template>
          <small v-if="r.item.tag" class="tag">{{ r.item.tag }}</small>
          <SheetRuleTip v-if="r.mastery" :title="r.mastery" :text="MASTERY_TEXT[r.mastery]" chip
            ><span class="tag tag--mastery">{{ r.mastery }}</span></SheetRuleTip
          >
          <small v-if="r.rarity" class="tag">{{ r.rarity }}</small>
        </span>
        <span class="items__actions">
          <button
            v-if="r.armor"
            type="button"
            class="chip equip"
            :aria-pressed="!!r.item.worn"
            :disabled="!canEdit"
            @click="equip(r.i)"
          >
            {{ r.item.worn ? 'Worn' : 'Equip' }}
          </button>
          <button
            v-if="r.attune"
            type="button"
            class="chip equip"
            :aria-pressed="!!r.item.attuned"
            :disabled="!canEdit || (!r.item.attuned && attuned >= attuneMax)"
            :title="`Attune (${attuned} / ${attuneMax})`"
            @click="attune(r.i)"
          >
            {{ r.item.attuned ? 'Attuned' : 'Attune' }}
          </button>
          <span v-if="r.charges" class="charges">
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Spend a charge of ${r.item.name}`"
              :disabled="!canEdit || (r.item.chargesUsed ?? 0) >= r.charges.max"
              @click="charge(r.i, -1, r.charges.max)"
            >
              −
            </button>
            <span
              class="small"
              :title="r.charges.regain ? `Regains ${r.charges.regain} charges at dawn` : ''"
              >{{ r.charges.max - (r.item.chargesUsed ?? 0) }} / {{ r.charges.max }} charges</span
            >
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Get a charge of ${r.item.name} back`"
              :disabled="!canEdit || !(r.item.chargesUsed ?? 0)"
              @click="charge(r.i, 1, r.charges.max)"
            >
              +
            </button>
          </span>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`One fewer ${r.item.name}`"
            :disabled="!canEdit"
            @click="setQty(r.i, -1)"
          >
            −
          </button>
          <span class="items__qty">{{ r.item.qty || 1 }}</span>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`One more ${r.item.name}`"
            :disabled="!canEdit"
            @click="setQty(r.i, 1)"
          >
            +
          </button>
          <button
            type="button"
            class="x"
            :aria-label="`Remove ${r.item.name}`"
            :disabled="!canEdit"
            @click="remove(r.i)"
          >
            ×
          </button>
        </span>
      </li>
    </ul>
    <p v-if="!rows.length" class="empty">Nothing carried yet.</p>
    <Dnd5eArtificer v-if="artificer" />
    <p v-if="resultIn('inv:')" class="roll-status" role="status">{{ resultIn('inv:') }}</p>

    <form class="add" @submit.prevent="add">
      <label class="sr-only" for="d5-add">Add an item</label>
      <input
        id="d5-add"
        v-model="adding"
        class="input"
        list="d5-catalog"
        placeholder="Add an item (from the rules, or write one in)"
        :disabled="!canEdit"
        @focus="loadMagic"
      />
      <datalist id="d5-catalog">
        <option v-for="n in catalog" :key="n" :value="n" />
      </datalist>
      <button type="submit" class="btn btn--ghost btn--sm" :disabled="!canEdit || !adding.trim()">
        Add
      </button>
    </form>

    <div class="coins" role="group" aria-label="Coins">
      <label v-for="k in COINS" :key="k" class="coin">
        <span class="caps">{{ k }}</span>
        <input
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          :value="sheet.coins?.[k] ?? 0"
          :disabled="!canEdit"
          @change="setCoin(k, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </section>
</template>

<style scoped lang="scss">
.over {
  color: var(--danger);
  font-weight: 700;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
    min-height: 44px;
    border-bottom: 1px solid var(--track);
  }
}

.items__name {
  flex: 1 1 8rem;
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;

  // A wrapped row keeps the name's 44px touch target off the buttons under it.
  @media (pointer: coarse) {
    min-height: 44px;
  }
}

.items__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.items__qty {
  min-width: 20px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--page-soft);

  &--mastery {
    color: var(--secondary);
  }
}

.equip {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--secondary);
    border-color: var(--secondary);
    color: var(--on-secondary);
  }
}

.x {
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: var(--page-muted);
  font-size: 18px;
  cursor: pointer;
}

.add {
  display: flex;
  gap: 8px;

  .input {
    flex: 1;
    min-width: 0;
  }
}

.charges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.coins {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.coin {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .input {
    min-height: 36px;
    padding: 4px 6px;
    font-variant-numeric: tabular-nums;
  }
}

@media (pointer: coarse) {
  .equip,
  .x,
  .coin .input {
    min-height: 44px;
  }

  .x {
    width: 44px;
  }
}
</style>
