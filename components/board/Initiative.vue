<script setup lang="ts">
// Turn order the whole party sees: portraits in initiative order, the current
// turn highlighted. Enemy HP shows as a band for players; the GM gets numbers,
// Previous / Next and a list to adjust HP, initiative and remove combatants.
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'
import { summonById } from '~/data/nimble/summons'
import { isSlainSummon, summonKey, summonOwner } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
}>()
const emit = defineEmits<{ add: [] }>()

const auth = useAuthStore()
const snackbar = useSnackbarStore()
const board = useCampaignBoard()
const manage = ref(false)
const syncing = ref(false)
const openSummons = ref<string | null>(null)

const KIND_LABEL = { pc: 'PC', npc: 'NPC', monster: 'Monster', summon: 'Summon' } as const

function heroDead(c: TurnRow) {
  const summary = c.kind === 'pc' ? rosterFor(c)?.summary : undefined
  const max = summary?.woundsMax ?? 0
  return !!summary && max > 0 && (summary.wounds ?? 0) >= max
}

function rosterFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function summonFor(c: TurnRow) {
  if (c.kind !== 'summon' || !c.summon_key) return undefined
  const owner = summonOwner(c.summon_key)
  const r = props.roster.find((x) => x.character_id === owner)
  const id = c.summon_key.slice(owner.length + 1)
  const member = r?.summary?.summons?.find((s) => s.id === id)
  return member && r ? { member, owner: r.character_name ?? r.display_name } : undefined
}

/** A hero's summons from their sheet, with the initiative row of each one that is seated. */
function heroSummons(c: TurnRow) {
  const characterId = c.kind === 'pc' ? c.character_id : null
  if (!characterId) return []
  return (rosterFor(c)?.summary?.summons ?? [])
    .map((member) => ({
      member,
      row: props.init.rows.value.find((r) => r.summon_key === summonKey(characterId, member.id)),
    }))
    .filter(({ row }) => !row || !isSlainSummon(row))
}

const opened = computed(() => {
  const c = props.init.order.value.find((x) => x.id === openSummons.value)
  if (!c) return null
  const kinds = new Map<string, ReturnType<typeof heroSummons>>()
  for (const s of heroSummons(c)) kinds.set(s.member.def, [...(kinds.get(s.member.def) ?? []), s])
  return {
    hero: c,
    kinds: [...kinds].map(([defId, list]) => {
      const def = summonById(defId)
      const first = list[0]?.member
      const attack = def?.attack
      return {
        id: defId || 'custom',
        name: def?.name ?? 'Other summons',
        title:
          list.length > 1
            ? (first?.name.replace(/ [A-Z]$/, '') ?? def?.name ?? 'Summons')
            : (first?.name ?? def?.name ?? 'Summon'),
        hp:
          def?.permanent && !def.hp
            ? 'HP abstracted'
            : (first?.hpMax ?? 0) > 0
              ? `${first?.hpMax} HP`
              : 'Dies to any damage',
        attack: attack
          ? `${attack.label ?? 'Attack'}: ${attack.dice.replace(/LVL/g, ' LVL')}${attack.reach ? ` · Reach ${attack.reach}` : ''}${attack.actions ? ` · ${plural(attack.actions, 'action')}` : ''}`
          : '',
        desc: def?.desc ?? '',
        duration: def?.duration ?? '',
        list,
      }
    }),
  }
})

/** The GM's list: each hero followed by their summons in initiative. */
const manageRows = computed(() =>
  props.init.order.value.flatMap((c) =>
    c.kind === 'pc' ? [c, ...props.init.summonsOf(c.character_id)] : [c],
  ),
)

function toggleSummons(c: TurnRow) {
  openSummons.value = openSummons.value === c.id ? null : c.id
}

function rowName(c: TurnRow) {
  const s = summonFor(c)
  return s ? `${s.member.name} (${s.owner})` : c.name
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
  if (c.id === props.init.activeId.value)
    return props.init.turnId.value
      ? 'Acting now'
      : props.gm
        ? 'Up first · Next turn starts'
        : 'Up first'
  if (isDown(c)) return c.kind === 'summon' ? 'Slain' : 'Down'
  if (c.kind === 'summon') return 'Summon'
  if (props.gm && c.kind !== 'pc' && c.hp !== null && (c.hp_max ?? 0) > 0)
    return `${c.hp} / ${c.hp_max} HP`
  if (c.hp_band && c.hp_band !== 'Unhurt') return c.hp_band
  return c.kind === 'pc' ? 'Ready' : KIND_LABEL[c.kind]
}

const statusLine = computed(() => {
  const order = props.init.order.value
  if (!order.length) return ''
  const now = order.find((c) => c.id === props.init.activeId.value)
  return `Round ${props.init.round.value}${now ? ` · ${now.name}’s turn` : ''}`
})

watch(
  () => props.roster,
  (roster) => {
    if (props.gm) void props.init.pruneSummons(roster)
  },
)

async function syncSummons() {
  syncing.value = true
  try {
    await board.reloadRoster()
    const result = await props.init.syncSummons(board.roster.value)
    if (!result) return
    const parts: string[] = []
    if (result.added) parts.push(`${plural(result.added, 'summon')} added`)
    if (result.removed) {
      parts.push(
        result.added ? `${result.removed} removed` : `${plural(result.removed, 'summon')} removed`,
      )
    }
    snackbar.show(parts.length ? parts.join(', ') : 'Summons are up to date')
  } catch (err) {
    snackbar.error(err, 'Could not sync the summons')
  } finally {
    syncing.value = false
  }
}

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
          :disabled="syncing || !init.order.value.length"
          @click="syncSummons"
        >
          Sync summons
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
          'is-foe': c.kind !== 'pc' && c.kind !== 'summon',
        }"
      >
        <component
          :is="heroSummons(c).length ? 'button' : 'div'"
          class="ini__who-btn"
          v-bind="
            heroSummons(c).length
              ? {
                  type: 'button',
                  'aria-expanded': openSummons === c.id,
                  'aria-label': `${rowName(c)}: ${plural(heroSummons(c).length, 'summon')}`,
                }
              : {}
          "
          @click="heroSummons(c).length && toggleSummons(c)"
        >
          <span class="ini__portrait">
            <UiAvatar
              :name="rowName(c)"
              :portrait-path="
                c.kind === 'pc'
                  ? rosterFor(c)?.summary?.portraitOverride ||
                    (rosterFor(c)?.portrait_path ?? c.portrait_path)
                  : (summonFor(c)?.member.portrait ?? null)
              "
              :beast="summonFor(c)?.member.beast ?? null"
              :src="c.kind === 'pc' ? null : npcImageUrl(c.portrait_path)"
              :class-slug="rosterFor(c)?.summary?.classSlug ?? null"
              :square="c.kind === 'monster'"
              :faded="isDown(c)"
              :dead="heroDead(c)"
              :size="60"
            />
            <span
              class="ini__score"
              :aria-label="`Initiative ${c.initiative}`"
              :title="`Initiative ${c.initiative}`"
              >{{ c.initiative }}</span
            >
            <span v-if="heroSummons(c).length" class="ini__count" aria-hidden="true">{{
              heroSummons(c).length
            }}</span>
          </span>
          <span class="ini__name"
            >{{ rowName(c) }}<span v-if="heroDead(c)" class="dead-tag"> (dead)</span></span
          >
        </component>
        <span class="ini__state" :class="{ 'is-low': isDown(c) || c.hp_band === 'Bloodied' }">{{
          status(c)
        }}</span>
      </li>
    </ol>
    <div v-else class="ini__empty">
      No encounter running. Portraits appear here when the GM rolls initiative.
    </div>
    <div
      v-if="opened"
      class="ini__summons"
      role="region"
      :aria-label="`${opened.hero.name}’s summons`"
    >
      <div class="ini__summons-head">
        <strong>{{ opened.hero.name }}’s summons</strong>
        <button type="button" class="btn btn--quiet btn--sm" @click="openSummons = null">
          Close
        </button>
      </div>
      <details v-for="k in opened.kinds" :key="k.id" class="ini__kind">
        <summary>
          <span class="ini__stack">
            <UiAvatar
              :name="k.list[0]?.member.name ?? k.name"
              :portrait-path="k.list[0]?.member.portrait ?? null"
              :beast="k.list[0]?.member.beast ?? null"
              :size="40"
            />
            <span v-if="k.list.length > 1" class="ini__stack-count">×{{ k.list.length }}</span>
          </span>
          <span class="ini__kind-name">
            <strong>{{ k.title }}</strong>
            <small
              >{{ k.hp }}<template v-if="k.attack"> · {{ k.attack }}</template></small
            >
          </span>
        </summary>
        <div class="ini__kind-body">
          <p v-if="k.desc">{{ k.desc }}</p>
          <p v-if="k.duration">
            <em>{{ k.duration }}</em>
          </p>
        </div>
      </details>
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
        <li v-for="c in manageRows" :key="c.id" :class="{ 'is-summon': c.kind === 'summon' }">
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
          <template v-if="c.kind === 'summon'">
            <span class="ini__hp">{{
              (c.hp_max ?? 0) > 0 && (c.hp ?? 0) <= 0 ? 'Slain' : 'Dies to any damage'
            }}</span>
            <span v-if="(c.hp_max ?? 0) > 0 && (c.hp ?? 0) > 0" class="ini__btns">
              <button
                type="button"
                :aria-label="`${c.name} is slain`"
                @click="init.adjustHp(c, -(c.hp ?? 0))"
              >
                Slain
              </button>
            </span>
          </template>
          <template v-else-if="c.kind !== 'pc'">
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
.dead-tag {
  color: var(--danger);
}

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

.ini__who-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: center;

  &:is(button) {
    cursor: pointer;
  }

  &[aria-expanded='true'] .ini__portrait {
    box-shadow: 0 0 0 3px var(--secondary);
  }
}

.ini__count {
  position: absolute;
  left: -8px;
  bottom: -6px;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 22px;
}

.ini__summons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-panel), 12px);
  background: var(--field);

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

.ini__kind {
  border-top: 1px solid var(--track);

  > summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      color: var(--page-muted);
    }
  }

  &[open] > summary::after {
    content: '▴';
  }
}

.ini__stack {
  position: relative;
  display: inline-flex;
}

.ini__stack-count {
  position: absolute;
  right: -10px;
  bottom: -4px;
  min-width: 22px;
  height: 20px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}

.ini__kind-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  small {
    font-size: 12px;
    color: var(--accent-text);
  }
}

.ini__kind-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 0 10px 52px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--page-soft);
  }

  em {
    font-size: 12px;
    color: var(--page-muted);
  }
}

.ini__summons-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ini__summon-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.ini__summon-state {
  font-size: 13px;
  color: var(--page-muted);
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

.ini__list li.is-summon {
  padding-left: 28px;
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
