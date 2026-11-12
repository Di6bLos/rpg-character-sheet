<script setup lang="ts">
// Turn order the whole party sees: portraits in initiative order, the current
// turn highlighted. Enemy HP shows as a band for players; the GM gets numbers,
// Previous / Next and a list to adjust HP, initiative and remove combatants.
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
}>()
const emit = defineEmits<{ add: [] }>()

const auth = useAuthStore()
const manage = ref(false)

const KIND_LABEL = { pc: 'PC', npc: 'NPC', monster: 'Monster' } as const

function rosterFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function isMine(c: TurnRow) {
  return !!c.character_id && rosterFor(c)?.user_id === auth.userId
}

function pcDown(c: TurnRow) {
  const r = rosterFor(c)
  return c.kind === 'pc' && r?.summary?.hp !== undefined && r.summary.hp <= 0
}

function isDown(c: TurnRow) {
  return c.hp_band === 'Down' || pcDown(c)
}

function status(c: TurnRow) {
  if (c.id === props.init.activeId.value) return 'Acting now'
  if (isDown(c)) return 'Down'
  if (props.gm && c.kind !== 'pc' && c.hp !== null) return `${c.hp} / ${c.hp_max} HP`
  if (c.hp_band && c.hp_band !== 'Unhurt') return c.hp_band
  return c.kind === 'pc' ? 'Ready' : KIND_LABEL[c.kind]
}

const statusLine = computed(() => {
  const order = props.init.order.value
  if (!order.length) return ''
  const now = order.find((c) => c.id === props.init.activeId.value)
  return `Round ${props.init.round.value}${now ? ` · ${now.name}’s turn` : ''}`
})

function onInit(c: TurnRow, event: Event) {
  const v = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(v) && v !== c.initiative) void props.init.setInitiative(c, v)
}
</script>

<template>
  <section class="panel ini" aria-labelledby="ini-h">
    <div class="ini__head">
      <h2 id="ini-h">Initiative</h2>
      <span role="status" class="ini__status">{{ statusLine }}</span>
      <div v-if="gm" class="ini__tools">
        <button type="button" class="btn btn--ghost btn--sm" @click="emit('add')">
          Add combatants
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!init.order.value.length"
          @click="init.prevTurn"
        >
          Previous
        </button>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!init.order.value.length"
          @click="init.nextTurn"
        >
          Next turn
        </button>
      </div>
      <span v-else class="ini__note">The GM runs turn order</span>
    </div>

    <ol v-if="init.order.value.length" class="ini__strip" aria-label="Turn order">
      <li
        v-for="c in init.order.value"
        :key="c.id"
        :aria-current="c.id === init.activeId.value ? 'step' : undefined"
        :class="{
          'is-now': c.id === init.activeId.value,
          'is-mine': isMine(c),
          'is-foe': c.kind !== 'pc',
        }"
      >
        <span class="ini__portrait">
          <UiAvatar
            :name="c.name"
            :portrait-path="
              c.kind === 'pc' ? (rosterFor(c)?.portrait_path ?? c.portrait_path) : null
            "
            :src="c.kind === 'pc' ? null : npcImageUrl(c.portrait_path)"
            :class-slug="rosterFor(c)?.summary?.classSlug ?? null"
            :square="c.kind === 'monster'"
            :faded="isDown(c)"
            :size="60"
          />
          <span class="ini__score" :aria-label="`Initiative ${c.initiative}`">{{
            c.initiative
          }}</span>
        </span>
        <span class="ini__name">{{ c.name }}</span>
        <span class="ini__state" :class="{ 'is-low': isDown(c) || c.hp_band === 'Bloodied' }">{{
          status(c)
        }}</span>
      </li>
    </ol>
    <div v-else class="ini__empty">
      No encounter running. Portraits appear here when the GM rolls initiative.
    </div>

    <template v-if="gm && init.order.value.length">
      <div class="ini__manage-bar">
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          :aria-expanded="manage"
          @click="manage = !manage"
        >
          {{ manage ? 'Hide combatant list' : 'Adjust HP and initiative' }}
        </button>
        <button type="button" class="btn btn--quiet btn--sm" @click="init.rollForNpcs">
          Reroll NPC initiative
        </button>
        <button type="button" class="btn btn--quiet btn--sm" @click="init.endEncounter">
          End encounter
        </button>
      </div>
      <ul v-if="manage" class="ini__list">
        <li v-for="c in init.order.value" :key="c.id">
          <label class="ini__init">
            <span class="sr-only">Initiative for {{ c.name }}</span>
            <input
              class="input"
              type="number"
              :value="c.initiative"
              inputmode="numeric"
              @change="onInit(c, $event)"
            />
          </label>
          <span class="ini__who">
            <strong>{{ c.name }}</strong>
            <span class="kind">{{ KIND_LABEL[c.kind] }}</span>
          </span>
          <template v-if="c.kind !== 'pc'">
            <span class="ini__hp">{{ c.hp }} / {{ c.hp_max }} HP · AC {{ c.ac }}</span>
            <span class="ini__btns">
              <button
                type="button"
                :aria-label="`${c.name}: lose 5 hit points`"
                @click="init.adjustHp(c, -5)"
              >
                −5
              </button>
              <button
                type="button"
                :aria-label="`${c.name}: lose 1 hit point`"
                @click="init.adjustHp(c, -1)"
              >
                −1
              </button>
              <button
                type="button"
                :aria-label="`${c.name}: gain 1 hit point`"
                @click="init.adjustHp(c, 1)"
              >
                +1
              </button>
            </span>
          </template>
          <span v-else class="ini__hp muted">HP on their sheet</span>
          <button
            type="button"
            class="ini__remove"
            :aria-label="`Remove ${c.name} from initiative`"
            @click="init.remove(c)"
          >
            ×
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped lang="scss">
.ini {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ini__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
  }
}

.ini__status {
  font-size: 15px;
  color: var(--page-muted);
}

.ini__tools {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ini__note {
  margin-left: auto;
  font-size: 14px;
  font-style: italic;
  color: var(--page-muted);
}

.ini__strip {
  list-style: none;
  margin: 0;
  padding: 4px 2px 6px;
  display: flex;
  gap: 14px;
  overflow-x: auto;

  li {
    flex: 0 0 auto;
    width: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border-radius: min(var(--radius-panel), 12px);
    text-align: center;

    &.is-now {
      background: var(--accent-tint);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
  }
}

.ini__portrait {
  position: relative;
  display: inline-flex;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--line-strong);

  .is-foe & {
    border-radius: min(var(--radius-control), 10px);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 55%, var(--line));
  }

  .is-mine & {
    box-shadow: 0 0 0 3px var(--accent);
  }

  .is-now & {
    box-shadow: 0 0 0 3px var(--accent);
  }
}

.ini__score {
  position: absolute;
  right: -8px;
  bottom: -6px;
  min-width: 26px;
  height: 26px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--inset);
  border: 1px solid var(--line-strong);
  color: var(--page-text);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;

  .is-now & {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
}

.ini__name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ini__state {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-muted);

  &.is-low {
    color: var(--danger-text);
  }

  .is-now & {
    color: var(--accent-text);
  }
}

.ini__empty {
  padding: 18px;
  border: 1px dashed var(--line-strong);
  border-radius: min(var(--radius-panel), 12px);
  text-align: center;
  font-size: 15px;
  color: var(--page-muted);
}

.ini__manage-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.ini__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);

    &:last-child {
      border-bottom: 0;
    }
  }
}

.ini__init .input {
  width: 72px;
  min-height: 38px;
  text-align: center;
}

.ini__who {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.ini__hp {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.ini__btns {
  display: flex;
  gap: 4px;

  button {
    min-width: 40px;
    min-height: 36px;
    border-radius: min(var(--radius-control), 8px);
    border: 1px solid var(--line-strong);
    background: var(--field);
    color: var(--page-text);
    font-weight: 600;
  }
}

.ini__remove {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--page-muted);
  font-size: 18px;
}
</style>
