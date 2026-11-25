<script setup lang="ts">
// Etches runes on a PF2e weapon or armor (GM Core pp. 224–225): the runes for that item
// (fetched when the dialog opens), each with the reason it can't go on (`runeProblem`: the
// wrong item, a melee-only rune on a ranged weapon, more property runes than the potency
// holds, an equal or stronger rune already there), the runes on it with a Remove, and the
// price paid from the coins when asked: an upgrade costs the difference (GM Core p. 223).
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eItemDef } from '~/data/pf2e/types'
import type { InventoryItem } from '~/types/sheets'
import {
  FUNDAMENTAL_WORDS,
  activeProperty,
  etchRune,
  removeRune,
  runeCost,
  runeProblem,
  runedName,
} from '~/utils/pf2eInventory'
import { priceLabel } from '~/utils/pf2eItemUse'

const props = defineProps<{ item: InventoryItem; level: number; coinsCp: number }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ etched: [message: string, cost: number] }>()

const runes = shallowRef<Pf2eItemDef[]>([])
const failed = ref('')
watch(
  open,
  async (o) => {
    if (!o || runes.value.length) return
    try {
      runes.value = await loadPf2e('runes')
    } catch {
      failed.value = 'The rune data couldn’t load. Check the connection and open this again.'
    }
  },
  { immediate: true },
)

const higherLevel = ref(false)
const payFor = ref(true)
const st = computed(() => props.item.pf2e)
const onto = computed(() => (st.value?.kind === 'armor' ? 'armor' : 'weapon'))
const options = computed(() =>
  runes.value
    .filter((r) => r.rune?.onto === onto.value && r.rarity === 'common')
    .filter((r) => higherLevel.value || r.level <= props.level)
    .map((r) => {
      const problem = st.value ? runeProblem(st.value, r) : 'Not a rune item.'
      const cost = st.value ? runeCost(st.value, r, runes.value) : r.price
      const short = payFor.value && cost > props.coinsCp ? 'Not enough coins.' : ''
      return { r, cost, problem: problem ?? short }
    })
    .sort((a, b) => Number(!!a.problem) - Number(!!b.problem) || a.r.level - b.r.level),
)
const current = computed(() => {
  const r = st.value?.runes
  if (!r) return []
  const working = new Set(activeProperty(st.value!).map((p) => p.id))
  return [
    ...(r.potency ? [{ key: 'potency', label: `+${r.potency} ${onto.value} potency` }] : []),
    ...(r.striking
      ? [
          {
            key: 'striking',
            label: capital(FUNDAMENTAL_WORDS.striking![r.striking] ?? ''),
          },
        ]
      : []),
    ...(r.resilient
      ? [
          {
            key: 'resilient',
            label: capital(FUNDAMENTAL_WORDS.resilient![r.resilient] ?? ''),
          },
        ]
      : []),
    ...r.property.map((p) => ({
      key: p.id,
      label: working.has(p.id) ? p.name : `${p.name} (dormant: no potency for it)`,
    })),
  ]
})

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** Upgrading a rune costs the difference in Price (GM Core p. 223). */
function etch(r: Pf2eItemDef, cost: number) {
  const message = etchRune(props.item, r)
  emit('etched', message, message.startsWith('Etched') && payFor.value ? cost : 0)
}
function remove(key: string) {
  removeRune(props.item, key)
  emit('etched', `${props.item.name}: now ${runedName(props.item)}.`, 0)
}
</script>

<template>
  <UiDialog v-model="open" :title="`Runes on ${item.name}`" width="640px" sheet>
    <div class="stack" style="gap: 12px">
      <p class="small muted">
        {{ runedName(item) }}. A weapon or armor holds one of each fundamental rune and as many
        property runes as its potency (GM Core p. 224).
      </p>
      <ul v-if="current.length" class="runes" aria-label="Etched runes">
        <li v-for="c in current" :key="c.key" class="rune">
          <span>{{ c.label }}</span>
          <button type="button" class="btn btn--ghost btn--sm" @click="remove(c.key)">
            Remove<span class="sr-only"> {{ c.label }}</span>
          </button>
        </li>
      </ul>
      <UiSwitch v-model="higherLevel" :label="`Show runes above level ${level}`" small />
      <label class="check">
        <input v-model="payFor" type="checkbox" />
        Pay for the rune from your coins
      </label>
      <p v-if="failed" class="small" role="alert">{{ failed }}</p>
      <ul class="runes" aria-label="Runes to etch">
        <li v-for="o in options" :key="o.r.id" class="rune">
          <span class="stack" style="gap: 2px">
            <strong>{{ o.r.name }}</strong>
            <span class="small muted">
              Item {{ o.r.level }} · {{ priceLabel(o.r.price) }}
              <template v-if="o.cost !== o.r.price">(upgrade {{ priceLabel(o.cost) }})</template>
              · {{ o.r.rune?.usage }}
              <template v-if="o.r.rune?.damage">
                · +{{ o.r.rune.damage.dice }} {{ o.r.rune.damage.type }}
              </template>
              <template v-if="o.r.rune?.persistent">
                · +{{ o.r.rune.persistent.dice }} persistent {{ o.r.rune.persistent.type }}
              </template>
            </span>
            <span v-if="o.problem" class="small muted">{{ o.problem }}</span>
          </span>
          <button
            type="button"
            class="btn btn--sm"
            :disabled="!!o.problem"
            :aria-label="`Etch ${o.r.name}`"
            @click="etch(o.r, o.cost)"
          >
            Etch
          </button>
        </li>
      </ul>
    </div>
  </UiDialog>
</template>

<style scoped lang="scss">
.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 15px;
  cursor: pointer;

  input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
}

.runes {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rune {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--track);
  font-size: 14px;
}
</style>
