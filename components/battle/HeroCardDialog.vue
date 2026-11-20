<script setup lang="ts">
// A hero's stats modal, opened from a party card or a hero initiative token. Loads the
// public subset (campaign_hero_card) and shows only what it returns. Side: portrait,
// identity, HP, Wounds, Armor / Speed / Init, conditions. Main: HeroCardStats.
// HP controls: the GM's go to the hero's initiative row (init.adjustHp); for the
// viewer's own hero the page passes the hero column's HP (`own-hp`, inside its sheet
// editor). Footer: Whisper and Open full sheet.
import type { HeroCard, RosterEntry } from '~/types'
import type { useInitiative } from '~/composables/useInitiative'
import { sign } from '~/utils/dice'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
}>()
const characterId = defineModel<string | null>('characterId', { required: true })
const slots = defineSlots<{ 'own-hp'?: () => unknown }>()

const auth = useAuthStore()
const campaigns = useCampaignStore()
const chat = useBoardChat()
const commsTab = useCommsTab()
const { campaignId, isGm } = useCampaignBoard()

const open = computed({
  get: () => characterId.value !== null,
  set: (on: boolean) => {
    if (!on) characterId.value = null
  },
})

const card = ref<HeroCard | null>(null)
const loading = ref(false)
const error = ref('')
let request = 0

async function load(id: string) {
  const n = ++request
  loading.value = true
  error.value = ''
  card.value = null
  try {
    const found = await campaigns.heroCard(campaignId.value, id)
    if (n === request) card.value = found
  } catch {
    if (n === request) error.value = "Could not load this hero's stats."
  } finally {
    if (n === request) loading.value = false
  }
}

watch(
  characterId,
  (id) => {
    if (id) void load(id)
  },
  { immediate: true },
)

const entry = computed(() => props.roster.find((r) => r.character_id === characterId.value))
const own = computed(() => !!entry.value && entry.value.user_id === auth.userId)
/** The viewer's own hero, with the hero column's HP (it has Wounds too). Slots aren't reactive, so not a computed. */
function ownHp(): boolean {
  return own.value && !!slots['own-hp']
}
const title = computed(() => card.value?.name ?? entry.value?.character_name ?? 'Hero')

/** The roster refreshes with the turn; prefer its live numbers over the card's snapshot. */
const live = computed(() => {
  const c = card.value
  const s = entry.value?.summary
  if (!c) return null
  return {
    hp: s?.hp ?? c.hp,
    hpMax: s?.hpMax ?? c.hpMax,
    tempHp: s?.tempHp ?? c.tempHp,
    wounds: s?.wounds ?? c.wounds,
    woundsMax: s?.woundsMax ?? c.woundsMax,
    conditions: s?.conditions ?? c.conditions,
  }
})
const dead = computed(
  () => !!live.value && live.value.woundsMax > 0 && live.value.wounds >= live.value.woundsMax,
)

const identity = computed(() => {
  const c = card.value
  if (!c) return ''
  return [[c.lineage, c.class].filter(Boolean).join(' '), c.subclass, `Lvl ${c.level}`]
    .filter(Boolean)
    .join(' · ')
})

function pct(n: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (n / max) * 100)) : 0
}

// --- GM: HP on the hero's initiative row --------------------------------------------
const combatant = computed(() =>
  props.init.order.value.find((c) => c.kind === 'pc' && c.character_id === characterId.value),
)
const amount = ref<number | null>(null)
const uid = useId()

function adjust(sign: 1 | -1) {
  const c = combatant.value
  if (!c) return
  const n = Math.max(1, Math.floor(Number(amount.value) || 1))
  void props.init.adjustHp(c, sign * n)
  amount.value = null
}

// --- Footer ---------------------------------------------------------------------------
const canWhisper = computed(() => !!entry.value && entry.value.user_id !== auth.userId)

async function whisper() {
  const to = entry.value?.user_id
  if (!to) return
  chat.open(to)
  commsTab.value = 'chat'
  characterId.value = null
  // After the dialog closes (and hands focus back), put the cursor in the message box.
  await nextTick()
  await nextTick()
  document.getElementById('chat-in')?.focus()
}
</script>

<template>
  <UiDialog v-model="open" :title="title" width="820px">
    <p v-if="loading" class="hc__state" role="status">Loading stats…</p>
    <div v-else-if="error" class="notice notice--error hc__state" role="alert">
      <span>{{ error }}</span>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        @click="characterId && load(characterId)"
      >
        Try again
      </button>
    </div>
    <div v-else-if="card && live" class="hc">
      <aside class="hc__side">
        <div class="hc__id">
          <UiAvatar
            :name="card.name"
            :portrait-path="entry?.summary?.portraitOverride || card.portrait_path"
            :class-slug="entry?.summary?.classSlug ?? null"
            :dead="dead"
            :size="56"
          />
          <p class="hc__sub">{{ identity }}</p>
        </div>

        <slot v-if="ownHp()" name="own-hp" />
        <div v-else class="hc__hp">
          <div class="hc__hp-head">
            <span class="hc__sect">Hit points</span>
            <span class="hc__hp-num"
              >{{ live.hp }} / {{ live.hpMax
              }}<b v-if="live.tempHp" class="hc__temp"> +{{ live.tempHp }} temp</b></span
            >
          </div>
          <div class="hc__bar" aria-hidden="true">
            <span class="hc__fill" :style="{ width: `${pct(live.hp, live.hpMax)}%` }" />
            <span
              v-if="live.tempHp"
              class="hc__fill hc__fill--temp"
              :style="{ width: `${pct(live.tempHp, live.hpMax)}%` }"
            />
          </div>
          <p v-if="own" class="hc__hint">Change your HP in the hero column on the left.</p>
        </div>

        <div v-if="gm" class="hc__gm">
          <template v-if="combatant">
            <span class="hc__sect"
              >Initiative HP · {{ combatant.hp ?? 0 }} / {{ combatant.hp_max ?? 0 }}</span
            >
            <div class="hc__ctl">
              <button
                type="button"
                class="step step--xs"
                :aria-label="`${card.name}: lose ${amount || 1} hit points`"
                @click="adjust(-1)"
              >
                −
              </button>
              <label class="sr-only" :for="`${uid}-amt`">HP amount</label>
              <input
                :id="`${uid}-amt`"
                v-model.number="amount"
                class="input hc__amt"
                type="number"
                min="1"
                inputmode="numeric"
                placeholder="amount"
                @keydown.enter.prevent="adjust(-1)"
              />
              <button
                type="button"
                class="step step--xs"
                :aria-label="`${card.name}: gain ${amount || 1} hit points`"
                @click="adjust(1)"
              >
                +
              </button>
            </div>
          </template>
          <p v-else class="hc__hint">Add {{ card.name }} to initiative to adjust HP here.</p>
        </div>

        <div v-if="live.woundsMax && !ownHp()" class="hc__wounds">
          <span class="hc__sect">Wounds</span>
          <span
            class="hc__pips"
            role="img"
            :aria-label="`${live.wounds} of ${live.woundsMax} Wounds`"
          >
            <i v-for="n in live.woundsMax" :key="n" :class="{ 'is-on': n <= live.wounds }" />
          </span>
        </div>

        <div class="hc__tiles">
          <div class="hc__tile">
            <b>{{ card.ac }}</b>
            <span>Armor</span>
          </div>
          <div class="hc__tile">
            <b>{{ card.speed || '—' }}</b>
            <span>Speed</span>
          </div>
          <div class="hc__tile">
            <b>{{ sign(card.initMod) }}</b>
            <span>Init</span>
          </div>
        </div>

        <div>
          <span class="hc__sect">Conditions</span>
          <ul v-if="live.conditions.length" class="hc__chips">
            <li v-for="c in live.conditions" :key="c">{{ c }}</li>
          </ul>
          <p v-else class="hc__none">None</p>
        </div>
      </aside>

      <BattleHeroCardStats :card="card" class="hc__main" />
    </div>

    <template #actions>
      <span class="hc__note">{{ gm ? 'GM view' : own ? 'Your hero' : 'Read only' }}</span>
      <button v-if="canWhisper" type="button" class="btn btn--ghost btn--sm" @click="whisper">
        Whisper
      </button>
      <NuxtLink
        v-if="characterId && (isGm || own)"
        :to="`/character/${characterId}`"
        class="btn btn--sm"
      >
        Open full sheet
      </NuxtLink>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.hc__state {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--page-muted);
}

.hc {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.hc__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  min-width: 0;

  // The own hero's HP block (HeroHp) uses the hero column's section label.
  :deep(.sect) {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hc__id {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hc__sub {
  margin: 0;
  font-size: 13px;
  color: var(--page-soft);
}

.hc__sect {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.hc__hp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hc__hp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.hc__hp-num {
  font-family: var(--font-heading);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.hc__temp {
  font-family: var(--font-body);
  font-size: 12px;
  color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
}

.hc__bar {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--track);
  overflow: hidden;
}

.hc__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);

  &--temp {
    background: var(--secondary);
    opacity: 0.75;
    left: auto;
    right: 0;
  }
}

.hc__hint,
.hc__none {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.hc__gm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hc__ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hc__amt {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 32px;
  padding: 4px 8px;
  text-align: center;
}

.hc__wounds {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hc__pips {
  display: inline-flex;
  gap: 4px;

  i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--page-muted);

    &.is-on {
      background: var(--danger);
      box-shadow: none;
    }
  }
}

.hc__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.hc__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--field);
  border: 1px solid var(--line);
  min-width: 0;

  b {
    font-family: var(--font-heading);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hc__chips {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  li {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--field);
    border: 1px solid var(--line);
    color: var(--page-soft);
  }
}

.hc__note {
  margin-right: auto;
  align-self: center;
  font-size: 12px;
  color: var(--page-muted);
}
</style>
