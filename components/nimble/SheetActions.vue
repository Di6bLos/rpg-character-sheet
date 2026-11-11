<script setup lang="ts">
// Attacks, reactions and the abilities with limited uses
// (per turn, encounter or Safe Rest, or a pool), each with its counter. Abilities
// the rules don't limit are listed only under All abilities.
import { REACTIONS } from '~/data/nimble/core'
import type { NimbleSheet } from '~/types/sheets'
import { parseDice, rollNimble } from '~/utils/dice'
import { abilityBaseName, keyStatValue, sheetResource } from '~/utils/nimbleBuild'
import { abilityCounters, actionsLeft, dyingAttackSave, spendActions } from '~/utils/nimblePlay'

/** Up to this many uses show as pips; larger pools (Lay on Hands) show a bar. */
const MAX_PIPS = 10
const MAX_USES = 200

const { draft, canEdit, lastRoll, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const resource = computed(() => sheetResource(sheet.value, draft.value.level))

// --- Attacks --------------------------------------------------------------
const attacks = computed(() =>
  sheet.value.attacks.map((w) => {
    const res = sheet.value.resource
    const raging = resource.value?.kind === 'rage' && res.active && w.melee
    const bonus = raging ? res.dice : 0
    const die = resource.value?.die ?? res.die
    // Swift Fists and the like say so in the weapon's properties.
    const rushed = /no rushed/i.test(w.props) ? 0 : sheet.value.rushed
    return {
      name: w.name,
      props: w.props,
      dmg: w.dmg + (bonus ? ` +${bonus}d${die}` : ''),
      rushed,
      roll: () => {
        if (!canEdit.value) return
        const expr = parseDice(w.dmg)
        if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d12+3`)
        const result = rollNimble(
          expr,
          bonus ? { count: bonus, sides: die } : null,
          Math.random,
          rushed,
        )
        // Still rolled with no actions left, for reactions (Opportunity Attack), but said so.
        const spent =
          actionsLeft(sheet.value) === 0 ? ' No actions left this turn: a reaction only.' : ''
        const dying =
          (dyingAttackSave(sheet.value) ? ' Dying: DC 10 STR save or take 1 Wound.' : '') + spent
        if (result.miss) say(`${w.name}: miss (first die rolled a 1).${dying}`)
        else
          say(
            `${w.name}: ${result.total} damage${result.crit ? ' · critical!' : ''}${
              result.bonus
                ? ` (incl. ${result.bonus} ${resource.value?.diceName.toLowerCase() || 'bonus'})`
                : ''
            }.${dying}`,
          )
        spendActions(sheet.value)
        sheet.value.rushed += 1
      },
    }
  }),
)

const reactions = computed(() =>
  REACTIONS.map((r) => ({
    ...r,
    desc: r.name === 'Defend' ? `${r.desc} Your Armor is ${sheet.value.ac}.` : r.desc,
    used: sheet.value.reactionsUsed.includes(r.name),
  })),
)

function toggleReaction(name: string) {
  if (!canEdit.value) return
  const used = sheet.value.reactionsUsed
  if (used.includes(name)) {
    sheet.value.reactionsUsed = used.filter((n) => n !== name)
    sheet.value.actionsSpent = Math.max(0, sheet.value.actionsSpent - 1)
    return
  }
  used.push(name)
  spendActions(sheet.value)
  say(`${name}: spent 1 action.`)
}

// --- Abilities --------------------------------------------------------------
const abilities = computed(() =>
  abilityCounters(sheet.value, draft.value.level)
    // The class resource panel already counts this one.
    .filter(({ ability }) => abilityBaseName(ability.name) !== resource.value?.ability)
    .map(({ ability, counters }) => ({
      ...ability,
      key: abilityBaseName(ability.name),
      counters: counters.map((c) => {
        const left = c.max - c.used
        return {
          ...c,
          left,
          pips: c.max <= MAX_PIPS,
          pct: Math.round((left / c.max) * 100),
        }
      }),
    })),
)

const editing = ref('')
/** Amount typed into a pool's Spend field, by counter. */
const amounts = reactive<Record<string, number>>({})
const uid = useId()
const domId = (prefix: string, id: string) => `${uid}-${prefix}-${id.replace(/[^\w-]/g, '_')}`

/** Opening or closing the max editor swaps the controls; keep keyboard focus with them. */
async function focusOn(id: string) {
  await nextTick()
  document.getElementById(id)?.focus()
}

function toggleEdit(id: string) {
  editing.value = editing.value === id ? '' : id
  focusOn(domId(editing.value ? 'max' : 'link', id))
}

function setMax(id: string, event: Event) {
  if (!canEdit.value) return
  const value = Number((event.target as HTMLInputElement).value)
  const max = Math.max(1, Math.min(MAX_USES, Math.floor(value) || 1))
  const used = Math.min(sheet.value.uses[id]?.used ?? 0, max)
  sheet.value.uses[id] = { max, used }
}

function resetMax(id: string, rule: number) {
  if (!canEdit.value) return
  sheet.value.uses[id] = { used: Math.min(sheet.value.uses[id]?.used ?? 0, rule) }
  toggleEdit(id)
}

function spend(counter: { id: string; max: number; used: number }, name: string, amount: number) {
  if (!canEdit.value) return
  const used = Math.max(0, Math.min(counter.max, counter.used + Math.floor(amount || 0)))
  sheet.value.uses[counter.id] = { ...sheet.value.uses[counter.id], used }
  if (amount > 0) say(`${name}: ${counter.max - used} of ${counter.max} left.`)
}
</script>

<template>
  <div class="stack" style="gap: 24px; min-width: 0">
    <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
      <div class="title-help">
        <h2 id="atk-h">Attacks</h2>
        <UiHelp
          label="About attacks"
          text="No attack roll: a 1 on the first die misses, and its max explodes as a crit. Each attack after the first in a turn is Rushed and rolls with one more disadvantage."
        />
      </div>
      <div v-if="attacks.length" class="attacks">
        <div v-for="(w, i) in attacks" :key="i" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">{{ w.name }}</strong>
              <span class="muted" style="font-size: 12px">{{ w.props }}</span>
            </div>
            <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ w.dmg }}</span>
          </div>
          <button type="button" class="btn" :disabled="!canEdit" @click="w.roll">
            Roll<template v-if="w.rushed"> · {{ w.rushed }}× disadvantage</template>
          </button>
        </div>
      </div>
      <p v-else class="empty">No attacks yet. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
    </section>

    <section class="panel stack" style="gap: 18px" aria-labelledby="act-h">
      <div class="title-help">
        <h2 id="act-h">Actions</h2>
        <UiHelp
          label="About actions"
          text="Tap a reaction to use it: each costs 1 action and can be used once per round. Limited-use abilities count their uses per turn, encounter or Safe Rest; tap one for its details."
        />
      </div>

      <div class="stack" style="gap: 8px">
        <div class="caps">Reactions</div>
        <div class="cards">
          <button
            v-for="r in reactions"
            :key="r.name"
            type="button"
            class="tile card reaction"
            :aria-pressed="r.used"
            :disabled="!canEdit"
            @click="toggleReaction(r.name)"
          >
            <span class="reaction__head">
              <strong>{{ r.name }}</strong>
              <em>{{ r.used ? 'Used · tap to undo' : 'Costs 1 action' }}</em>
            </span>
            <span>{{ r.desc }}</span>
          </button>
        </div>
      </div>

      <div class="stack" style="gap: 8px">
        <div class="caps">Limited-use abilities</div>
        <details
          v-for="a in abilities"
          :key="`${a.key}-${a.level ?? 0}`"
          name="nimble-action"
          class="tile ability"
        >
          <summary>
            <strong>{{ a.name }}</strong>
            <small>{{ a.src }}</small>
            <span class="ability__left">
              {{ a.counters.map((c) => `${c.left} / ${c.max}`).join(' · ') }}
            </span>
          </summary>
          <div class="ability__body">
            <p><NimbleRulesText :text="a.desc" :key-value="keyValue" /></p>
            <div v-for="c in a.counters" :key="c.id" class="counter">
              <div class="uses">
                <div v-if="c.pips" class="row" style="gap: 6px" aria-hidden="true">
                  <i v-for="n in c.max" :key="n" :class="{ on: n <= c.left }" />
                </div>
                <div v-else class="meter uses__bar"><span :style="{ width: c.pct + '%' }" /></div>
                <span class="uses__left" aria-live="polite">
                  {{ c.left }} of {{ c.max }} left {{ c.label }}
                </span>
                <div class="row" style="gap: 6px; margin-left: auto">
                  <template v-if="!c.pips">
                    <label class="sr-only" :for="domId('amt', c.id)">Amount of {{ a.name }}</label>
                    <input
                      :id="domId('amt', c.id)"
                      v-model.number="amounts[c.id]"
                      class="input"
                      type="number"
                      min="1"
                      :max="c.max"
                      placeholder="1"
                      :disabled="!canEdit"
                    />
                  </template>
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :disabled="!canEdit || c.used === 0"
                    :aria-label="`Regain ${a.name} (${c.label})`"
                    @click="spend(c, a.name, -(c.pips ? 1 : amounts[c.id] || 1))"
                  >
                    {{ c.pips ? 'Undo' : 'Restore' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :disabled="!canEdit || c.left === 0"
                    :aria-label="`Use ${a.name} (${c.label})`"
                    @click="spend(c, a.name, c.pips ? 1 : amounts[c.id] || 1)"
                  >
                    {{ c.pips ? 'Use' : 'Spend' }}
                  </button>
                </div>
              </div>
              <span v-if="c.hint && a.counters.length > 1" class="counter__hint">{{ c.hint }}</span>
              <div v-if="editing === c.id" class="uses uses--edit">
                <label :for="domId('max', c.id)">Uses {{ c.label }}</label>
                <input
                  :id="domId('max', c.id)"
                  class="input"
                  type="number"
                  min="1"
                  :max="MAX_USES"
                  :value="c.max"
                  @change="setMax(c.id, $event)"
                />
                <button
                  v-if="c.max !== c.rule"
                  type="button"
                  class="btn btn--quiet btn--sm"
                  style="margin-left: auto"
                  @click="resetMax(c.id, c.rule)"
                >
                  Reset to {{ c.rule }}
                </button>
              </div>
              <button
                v-if="canEdit"
                :id="domId('link', c.id)"
                type="button"
                class="link"
                :aria-expanded="editing === c.id"
                @click="toggleEdit(c.id)"
              >
                {{ editing === c.id ? 'Done' : 'Change max' }}
              </button>
            </div>
          </div>
        </details>
        <p v-if="!abilities.length" class="empty">
          Nothing to count yet. Abilities with limited uses per turn, encounter or Safe Rest appear
          here; the rest are under All abilities.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.attacks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 12px;
}

.attack {
  gap: 12px;
  padding: 16px;
}

.attack__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 8px;
}

.card {
  padding: 12px;
  text-align: left;
  color: var(--page-text);

  strong {
    font-size: 14px;
  }

  span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}

.reaction {
  justify-content: flex-start;

  &[aria-pressed='true'] {
    border-style: dashed;

    > span:last-child {
      opacity: 0.6;
    }
  }
}

.reaction__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  em {
    margin-left: auto;
    font-style: normal;
    font-size: 11px;
    font-weight: 700;
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
  }
}

.reaction[aria-pressed='true'] em {
  color: var(--page-soft);
}

.ability {
  padding: 0;
  gap: 0;

  summary {
    display: flex;
    align-items: baseline;
    gap: 4px 8px;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 12px 14px;
    cursor: pointer;

    strong {
      font-size: 14px;
    }

    small {
      font-size: 11px;
      color: var(--page-muted);
    }
  }

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
    // Upgrades append "Level N: …" on new lines.
    white-space: pre-line;
  }

  &[open] {
    border-color: var(--accent);
  }
}

.ability__left {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
}

.ability__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 14px 12px;

  .uses {
    width: 100%;
  }
}

.counter {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
}

.counter__hint {
  font-size: 12px;
  color: var(--page-muted);
}

.link {
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.uses {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);

    &.on {
      background: var(--accent);
      box-shadow: none;
    }
  }

  label {
    font-size: 13px;
    color: var(--page-soft);
  }

  .input {
    width: 84px;
    min-height: 36px;
  }
}

.uses__bar {
  flex: 1 1 120px;
}

.uses__left {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@media (pointer: coarse) {
  .link {
    min-height: 44px;
  }
}
</style>
