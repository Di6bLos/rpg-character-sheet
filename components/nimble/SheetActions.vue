<script setup lang="ts">
// Attacks, reactions and the abilities with limited uses
// (per turn, encounter or Safe Rest, or a pool), each with its counter. Abilities
// the rules don't limit are listed only under All abilities.
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit, lastRoll } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  attacks,
  reactions,
  toggleReaction,
  abilities,
  inventionAttacks,
  inventions,
  abilityActions,
  attackAbilities,
  attackAbilityKeys,
  readied,
  setReady,
  zealot,
  zealMax,
  setZealot,
  quarry,
  hasMark,
  held,
  resource,
} = useNimbleActions()
const { summonAttacks } = useNimbleSummons()
const { reactionSpells, spellAttacks, cast, pool } = useNimbleSpells()

const mine = computed(() =>
  abilities.value.filter((a) => !a.linked && !a.companion && !attackAbilityKeys.value.has(a.key)),
)
const weaponBadge = computed(() => {
  const r = resource.value
  const res = sheet.value.resource
  const parts: string[] = []
  if (r?.kind === 'power') parts.push(`${r.diceName} Dice ${res.count}/${r.max}`)
  if (r?.kind === 'rage')
    parts.push(res.active ? `Fury +${res.rolls.reduce((a, b) => a + b, 0)}` : 'Not raging')
  if (r?.kind === 'judgment')
    parts.push(held.value ? `Judgment +${held.value}` : 'No Judgment Dice')
  if (r?.kind === 'crit') parts.push(`${r.name} ${res.count ? 'used' : 'ready'}`)
  if (zealMax.value > 0 || zealot.value > 0) {
    const m = sheet.value.mana
    parts.push(`Mana ${m.current + m.temp}/${m.max}`)
  }
  return parts.join(' · ')
})
const abilityBadge = computed(() => {
  const r = resource.value
  if (r?.kind !== 'counter' && r?.kind !== 'dice') return ''
  const count = sheet.value.resource.count
  return `${r.name} ${r.max ? `${count}/${r.max}` : count}`
})
const otherActions = computed(() => abilityActions.value.filter((a) => !a.attack))
const hasAttacks = computed(
  () =>
    attacks.value.length +
      summonAttacks.value.length +
      inventionAttacks.value.length +
      spellAttacks.value.length +
      attackAbilities.value.length >
    0,
)
</script>

<template>
  <div class="stack" style="gap: 24px; min-width: 0">
    <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
      <UiFold name="Attacks" />
      <div class="title-help">
        <h2 id="atk-h">Attacks</h2>
        <UiHelp
          label="About attacks"
          text="No attack roll: a 1 on the first die misses, and its max explodes as a crit. Each attack after the first in a turn is Rushed and rolls with one more disadvantage."
        />
      </div>
      <div v-if="hasMark" class="quarry" role="radiogroup" aria-label="Target">
        <span class="caps">Target</span>
        <button
          v-for="q in [
            { value: '', label: 'Not your quarry' },
            { value: 'damage', label: `Quarry · +${draft.level} damage` },
            { value: 'advantage', label: 'Quarry · advantage' },
          ] as const"
          :key="q.value"
          type="button"
          role="radio"
          class="chip"
          :aria-checked="quarry === q.value"
          :class="{ 'chip--on': quarry === q.value }"
          :disabled="!canEdit"
          @click="quarry = q.value"
        >
          {{ q.label }}
        </button>
      </div>
      <template v-if="hasAttacks">
        <details v-if="attacks.length || inventionAttacks.length" class="atk-group" open>
          <summary>
            <span class="caps">Weapons</span>
            <span v-if="weaponBadge" class="badge badge--outline">{{ weaponBadge }}</span>
          </summary>
          <div class="attacks">
            <div v-for="(w, i) in attacks" :key="i" class="tile attack">
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">{{ w.name }}</strong>
                  <span class="muted" style="font-size: 12px">{{ w.props }}</span>
                  <span v-if="w.boost" class="boost">{{ w.boost }}</span>
                </div>
                <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ w.dmg }}</span>
              </div>
              <NimbleMishap v-if="w.mishap" :name="w.mishap.name" :text="w.mishap.text" />
              <NimbleModifiers :target="w.name" :weapon="w.props" />
              <div v-if="w.poweredBy" class="ready">
                <span>{{ resource?.diceName }} Dice readied</span>
                <button
                  type="button"
                  class="step step--xs"
                  :aria-label="`Ready one fewer ${resource?.diceName} Die`"
                  :disabled="!canEdit || readied === 0"
                  @click="setReady(readied - 1)"
                >
                  −
                </button>
                <strong aria-live="polite">{{ readied }}</strong>
                <button
                  type="button"
                  class="step step--xs"
                  :aria-label="`Ready one more ${resource?.diceName} Die`"
                  :disabled="!canEdit || readied >= sheet.resource.count"
                  @click="setReady(readied + 1)"
                >
                  +
                </button>
                <small class="ready__of">of {{ sheet.resource.count }}</small>
              </div>
              <div v-if="w.zealot" class="ready">
                <span>Zealot mana</span>
                <button
                  type="button"
                  class="step step--xs"
                  aria-label="Spend 1 less mana on Zealot"
                  :disabled="!canEdit || zealot === 0"
                  @click="setZealot(zealot - 1)"
                >
                  −
                </button>
                <strong aria-live="polite">{{ zealot }}</strong>
                <button
                  type="button"
                  class="step step--xs"
                  aria-label="Spend 1 more mana on Zealot"
                  :disabled="!canEdit || zealot >= zealMax"
                  @click="setZealot(zealot + 1)"
                >
                  +
                </button>
                <small class="ready__of">+5 radiant each · up to {{ zealMax }}</small>
              </div>
              <button
                type="button"
                class="btn"
                :disabled="!canEdit || w.blocked"
                :title="w.blocked ? 'No actions left' : undefined"
                @click="w.roll"
              >
                {{ sheet.ownDice ? 'Attack' : 'Roll'
                }}<template v-if="w.rushed"> · {{ w.rushed }}× disadvantage</template>
              </button>
            </div>
            <div
              v-for="inv in inventionAttacks"
              :key="inv.name"
              class="tile attack"
              :class="{ 'attack--broken': inv.inoperable }"
            >
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">
                    <NimbleBrokenIcon v-if="inv.inoperable" />
                    {{ inv.name }}
                  </strong>
                  <span class="muted" style="font-size: 12px">{{ inv.props }}</span>
                  <span class="boost">{{ inv.cost }}</span>
                </div>
                <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ inv.dmg }}</span>
              </div>
              <NimbleMishap v-if="inv.mishap" :name="inv.mishap.name" :text="inv.mishap.text" />
              <NimbleModifiers :target="inv.name" />
              <div class="ready">
                <span>{{ resource?.diceName }} Dice readied</span>
                <button
                  type="button"
                  class="step step--xs"
                  :aria-label="`Ready one fewer ${resource?.diceName} Die`"
                  :disabled="!canEdit || readied === 0"
                  @click="setReady(readied - 1)"
                >
                  −
                </button>
                <strong aria-live="polite">{{ readied }}</strong>
                <button
                  type="button"
                  class="step step--xs"
                  :aria-label="`Ready one more ${resource?.diceName} Die`"
                  :disabled="!canEdit || readied >= sheet.resource.count"
                  @click="setReady(readied + 1)"
                >
                  +
                </button>
                <small class="ready__of">of {{ sheet.resource.count }}</small>
              </div>
              <button
                type="button"
                class="btn btn--wrap"
                :disabled="!canEdit || !!inv.why"
                :title="inv.why || undefined"
                @click="inv.run"
              >
                {{ inv.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
              </button>
            </div>
          </div>
        </details>
        <details v-if="spellAttacks.length" class="atk-group" open>
          <summary>
            <span class="caps">Spells</span>
            <span v-if="pool" class="badge badge--outline" :class="{ 'badge--low': pool.low }"
              >{{ pool.label }} {{ pool.value }}</span
            >
          </summary>
          <div class="attacks">
            <div v-for="a in spellAttacks" :key="a.key" class="tile attack attack--spell">
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">{{ a.name }}</strong>
                  <span class="muted" style="font-size: 12px">{{ a.props }}</span>
                  <span class="boost">{{ a.cost }}</span>
                </div>
                <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ a.dmg }}</span>
              </div>
              <NimbleModifiers :target="a.name" />
              <button
                type="button"
                class="btn btn--wrap"
                :disabled="!canEdit || !!a.why"
                :title="a.why || undefined"
                @click="a.run"
              >
                {{ a.why || (sheet.ownDice ? 'Cast' : 'Cast · Roll') }}
              </button>
            </div>
          </div>
        </details>
        <details v-if="attackAbilities.length || summonAttacks.length" class="atk-group" open>
          <summary>
            <span class="caps">Abilities</span>
            <span v-if="abilityBadge" class="badge badge--outline">{{ abilityBadge }}</span>
          </summary>
          <div class="attacks">
            <div v-for="a in summonAttacks" :key="a.key" class="tile attack attack--summon">
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">{{ a.name }}</strong>
                  <span v-if="a.who" class="attack__who">{{ a.who }}</span>
                  <span class="muted" style="font-size: 12px">{{ a.props }}</span>
                  <span class="boost">{{ a.cost }}</span>
                </div>
                <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ a.dmg }}</span>
              </div>
              <NimbleModifiers :summon="a.summon" />
              <button
                type="button"
                class="btn btn--wrap"
                :disabled="!canEdit || !!a.why"
                :title="a.why || undefined"
                @click="a.run"
              >
                {{ a.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
              </button>
            </div>
            <div v-for="a in attackAbilities" :key="a.key" class="tile attack attack--ability">
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">{{ a.name }}</strong>
                  <span class="muted attack__desc">{{ a.desc }}</span>
                  <span class="boost">{{ a.costText }}</span>
                </div>
              </div>
              <NimbleModifiers :target="a.name" />
              <button
                type="button"
                class="btn btn--wrap"
                :disabled="!canEdit || !!a.why"
                :title="a.why || 'Pays the cost; roll a weapon attack next, it costs no more'"
                @click="a.use"
              >
                {{ a.why || 'Use · then roll a weapon' }}
              </button>
            </div>
          </div>
        </details>
      </template>
      <p v-else class="empty">No attacks yet. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
    </section>

    <section class="panel stack" style="gap: 18px" aria-labelledby="act-h">
      <UiFold name="Actions" />
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
          <div v-for="r in reactions" :key="r.name" class="reaction-wrap">
            <button
              type="button"
              class="tile card reaction"
              :aria-pressed="r.used"
              :disabled="!canEdit || r.blocked"
              @click="toggleReaction(r.name)"
            >
              <span class="reaction__head">
                <strong>{{ r.name }}</strong>
                <em>{{ r.used ? 'Used · tap to undo' : r.costText }}</em>
              </span>
              <span>{{ r.desc }}</span>
            </button>
            <NimbleModifiers :target="r.name" />
          </div>
          <button
            v-for="s in reactionSpells"
            :key="s.name"
            type="button"
            class="tile card reaction"
            :disabled="!canEdit || !!s.blocked"
            :title="s.blocked || `${s.cast}. ${s.desc}`"
            @click="cast(s)"
          >
            <span class="reaction__head">
              <strong>{{ s.name }}</strong>
              <em>{{ s.blocked || `Spell · ${s.cost}` }}</em>
            </span>
            <span>{{ s.trigger }}</span>
          </button>
        </div>
      </div>

      <div
        v-if="otherActions.length || inventions.some((i) => !i.attack)"
        class="stack"
        style="gap: 8px"
      >
        <div class="caps">Ability actions</div>
        <NimbleInventionCard
          v-for="inv in inventions.filter((i) => !i.attack)"
          :key="inv.name"
          :name="inv.name"
        />
        <details v-for="a in otherActions" :key="a.key" class="tile act">
          <summary>
            <strong>{{ a.name }}</strong>
            <small>{{ a.costText }}</small>
          </summary>
          <div class="act__body">
            <p>{{ a.desc }}</p>
            <NimbleModifiers :target="a.name" />
            <button
              type="button"
              class="btn btn--sm btn--wrap"
              :disabled="!canEdit || a.short"
              :title="a.why || undefined"
              @click="a.use"
            >
              {{ a.why || 'Use' }}
            </button>
          </div>
        </details>
      </div>

      <div v-if="mine.length" class="stack" style="gap: 8px">
        <div class="caps">Limited-use abilities</div>
        <NimbleAbilityCounters :items="mine" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.atk-group {
  display: flex;
  flex-direction: column;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      color: var(--accent-text);
    }
  }

  &[open] > summary {
    margin-bottom: 10px;

    &::after {
      content: '▴';
    }
  }

  .badge--low {
    color: var(--danger);
  }
}

.attack__desc {
  font-size: 12px;
  line-height: 1.45;
}

.quarry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

.act {
  padding: 0;
  gap: 0;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    strong {
      font-size: 14px;
    }

    small {
      font-size: 11px;
      color: var(--accent-text);
      font-weight: 700;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      color: var(--accent-text);
    }
  }

  &[open] {
    border-color: var(--accent);

    > summary::after {
      content: '▴';
    }
  }
}

.act__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 14px 12px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}

.ready {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--page-soft);

  span {
    margin-right: auto;
  }

  strong {
    min-width: 18px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
}

.ready__of {
  min-width: 34px;
  font-size: 12px;
  color: var(--page-muted);
}

.attack--broken {
  border: 1px dashed var(--danger);
}

.attack__who {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.boost {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}

.attacks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 12px;
}

.attack {
  gap: 12px;
  padding: 16px;

  > .btn {
    margin-top: auto;
  }
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

.reaction-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;

  > .reaction {
    flex: 1;
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
</style>
