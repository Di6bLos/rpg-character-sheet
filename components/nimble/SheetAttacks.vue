<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  attacks,
  inventionAttacks,
  attackAbilities,
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
const { spellAttacks, spellAttackTiers: spellTiers, pool, maxTier, setUpcast } = useNimbleSpells()
const { claim, resultFor } = useResultOwner()

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
  <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
    <UiFold name="Attacks" :open="sheet.turnActive" />
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
    <NimbleAttackSituation />
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
                <NimbleOdds :rushed="w.rushed" :advantage="w.advantage" :why="w.oddsWhy" />
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
              :title="w.why || w.oddsWhy || undefined"
              @click="claim(`w:${i}`, w.roll)"
            >
              <template v-if="w.blocked">{{ w.why }}</template>
              <template v-else
                >{{ sheet.ownDice ? 'Attack' : 'Roll'
                }}<template v-if="w.rushed"> · {{ w.rushed }}× disadvantage</template
                ><template v-if="w.advantage"> · {{ w.advantage }}× advantage</template></template
              >
            </button>
            <p v-if="resultFor(`w:${i}`)" class="roll-status attack__result" role="status">
              {{ resultFor(`w:${i}`) }}
            </p>
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
              @click="claim(`inv:${inv.name}`, inv.run)"
            >
              {{ inv.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
            </button>
            <p v-if="resultFor(`inv:${inv.name}`)" class="roll-status attack__result" role="status">
              {{ resultFor(`inv:${inv.name}`) }}
            </p>
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
        <details v-for="g in spellTiers" :key="g.tier" class="atk-tier" open>
          <summary class="caps">{{ g.label }}</summary>
          <div class="attacks">
            <div v-for="a in g.spells" :key="a.key" class="tile attack attack--spell">
              <div class="attack__head">
                <div class="stack" style="gap: 2px">
                  <strong style="font-size: 16px">{{ a.name }}</strong>
                  <span class="muted" style="font-size: 12px">{{ a.props }}</span>
                  <span class="boost">{{ a.cost }}</span>
                  <NimbleOdds
                    v-if="!a.why"
                    :rushed="a.rushed"
                    :advantage="a.advantage"
                    :why="a.oddsWhy"
                  />
                </div>
                <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ a.dmg }}</span>
              </div>
              <NimbleModifiers :target="a.name" />
              <NimbleUpcast
                v-if="a.spell.canUpcast"
                :name="a.name"
                :tier="a.spell.tier"
                :at="a.spell.at"
                :max="maxTier"
                :price="a.price"
                :disabled="!canEdit"
                @set="setUpcast(a.spell, $event)"
              />
              <button
                type="button"
                class="btn btn--wrap"
                :disabled="!canEdit || !!a.why"
                :title="a.why || a.oddsWhy || undefined"
                @click="claim(a.key, a.run)"
              >
                {{ a.why || (sheet.ownDice ? 'Cast' : 'Cast · Roll')
                }}<template v-if="!a.why && a.rushed"> · {{ a.rushed }}× disadvantage</template
                ><template v-if="!a.why && a.advantage"> · {{ a.advantage }}× advantage</template>
              </button>
              <p v-if="resultFor(a.key)" class="roll-status attack__result" role="status">
                {{ resultFor(a.key) }}
              </p>
            </div>
          </div>
        </details>
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
            <NimbleModifiers v-if="a.summon" :summon="a.summon" />
            <button
              type="button"
              class="btn btn--wrap"
              :disabled="!canEdit || !!a.why"
              :title="a.why || undefined"
              @click="claim(a.key, a.run)"
            >
              {{ a.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
            </button>
            <p v-if="resultFor(a.key)" class="roll-status attack__result" role="status">
              {{ resultFor(a.key) }}
            </p>
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
              @click="claim(a.key, a.use)"
            >
              {{ a.why || 'Use · then roll a weapon' }}
            </button>
            <p v-if="resultFor(a.key)" class="roll-status attack__result" role="status">
              {{ resultFor(a.key) }}
            </p>
          </div>
        </div>
      </details>
    </template>
    <p v-else class="empty">No attacks yet. Use “Edit sheet” to add one.</p>
  </section>
</template>

<style scoped lang="scss">
.attack__result {
  margin: 0;
  font-size: 13px;
}

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

.atk-tier {
  margin-left: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--line);

  & + & {
    margin-top: 8px;
  }

  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    color: var(--page-muted);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: '▸';
      font-size: 10px;
      letter-spacing: normal;
      color: var(--accent-text);
      transition: transform 0.15s ease;
    }

    &::after {
      content: none;
    }
  }

  &[open] {
    border-left-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }

  &[open] > summary {
    margin-bottom: 8px;

    &::before {
      transform: rotate(90deg);
    }
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
</style>
