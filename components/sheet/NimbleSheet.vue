<script setup lang="ts">
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { parseDice, rollNimble, sign } from '~/utils/dice'
import { NIMBLE_REACTIONS } from '~/utils/sheetDefaults'

const { draft, canEdit, campaignName, hpPct, adjustHp, lastRoll, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
const MAX_WOUNDS = 6
const MAX_DICE = 6

const stats = computed(() =>
  STATS.map((k) => {
    const mode = sheet.value.saveAdv === k ? 'adv' : sheet.value.saveDis === k ? 'dis' : ''
    return {
      k,
      v: sign(sheet.value.stats[k]),
      mode,
      save: mode === 'adv' ? 'Save · advantage' : mode === 'dis' ? 'Save · disadvantage' : 'Save',
    }
  }),
)

const identityBits = computed(() =>
  [sheet.value.lineage, sheet.value.class, sheet.value.subclass, sheet.value.background].filter(
    Boolean,
  ),
)

const bloodied = computed(() => sheet.value.hp <= sheet.value.hpMax / 2)
const bloodiedLabel = computed(() =>
  bloodied.value
    ? 'Bloodied — at or below half HP'
    : `Bloodied at ${Math.floor(sheet.value.hpMax / 2)} HP`,
)

const vitals = computed(() => [
  { label: 'Armor', value: String(sheet.value.ac) },
  { label: 'Speed', value: sheet.value.speed },
  { label: 'Initiative', value: sign(sheet.value.initMod) },
  { label: 'Hit dice', value: `${sheet.value.hitDice} d${sheet.value.hitDie}` },
])

const actionsLeft = computed(() => 3 - sheet.value.actionsSpent)
const hasResource = computed(() => sheet.value.resource.name.trim() !== '')

function setWounds(n: number) {
  if (!canEdit.value) return
  sheet.value.wounds = sheet.value.wounds === n ? n - 1 : n
}

function setSpent(n: number) {
  if (!canEdit.value) return
  sheet.value.actionsSpent = n <= sheet.value.actionsSpent ? n - 1 : n
}

function spendOne() {
  if (!canEdit.value) return
  sheet.value.actionsSpent = Math.min(3, sheet.value.actionsSpent + 1)
}

function newTurn() {
  if (!canEdit.value) return
  sheet.value.actionsSpent = 0
  const res = sheet.value.resource
  // A sustained resource (e.g. Rage) grows by one die each round.
  if (res.active) res.dice = Math.min(MAX_DICE, res.dice + 1)
}

function adjustDice(delta: number) {
  if (!canEdit.value) return
  const res = sheet.value.resource
  res.dice = Math.max(0, Math.min(MAX_DICE, res.dice + delta))
}

const attacks = computed(() =>
  sheet.value.attacks.map((w) => {
    const res = sheet.value.resource
    const bonus = hasResource.value && res.active && w.melee ? res.dice : 0
    return {
      name: w.name,
      props: w.props,
      dmg: w.dmg + (bonus ? ` +${bonus}d${res.die}` : ''),
      roll: () => {
        const expr = parseDice(w.dmg)
        if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d12+3`)
        const result = rollNimble(expr, bonus ? { count: bonus, sides: res.die } : null)
        if (result.miss) say(`${w.name}: miss (first die rolled a 1)`)
        else
          say(
            `${w.name}: ${result.total} damage${result.crit ? ' · critical!' : ''}${
              result.bonus
                ? ` (incl. ${result.bonus} ${res.diceName.toLowerCase() || 'bonus'})`
                : ''
            }`,
          )
        spendOne()
      },
    }
  }),
)

const skills = computed(() =>
  sheet.value.skills.map((s) => ({
    ...s,
    v: sign(sheet.value.stats[s.stat] + s.points),
  })),
)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="nb-portrait" />
    <div class="identity__body">
      <div class="stack" style="gap: 8px">
        <div class="row" style="gap: 10px">
          <span class="badge badge--nimble">Nimble</span>
          <span class="small muted">{{ campaignName }}</span>
        </div>
        <h1>{{ draft.name }}</h1>
        <div class="identity__line">
          <span
            >Level <strong>{{ draft.level }}</strong></span
          >
          <template v-for="bit in identityBits" :key="bit">
            <span aria-hidden="true">·</span><span>{{ bit }}</span>
          </template>
        </div>
      </div>
      <div class="stats">
        <div v-for="s in stats" :key="s.k" class="stat" :class="s.mode && `stat--${s.mode}`">
          <div class="stat__k">{{ s.k }}</div>
          <div class="stat__v">{{ s.v }}</div>
          <div class="stat__save">{{ s.save }}</div>
        </div>
      </div>
    </div>
  </section>

  <div class="two-col">
    <section class="panel stack" aria-labelledby="vit-h">
      <h2 id="vit-h">Vitals</h2>
      <div class="tile" style="gap: 10px; padding: 14px">
        <div class="hp">
          <div class="caps">Hit points</div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="step"
              aria-label="Lose 1 hit point"
              :disabled="!canEdit"
              @click="adjustHp(-1)"
            >
              −
            </button>
            <div class="hp__value" aria-live="polite">
              {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
            </div>
            <button
              type="button"
              class="step"
              aria-label="Gain 1 hit point"
              :disabled="!canEdit"
              @click="adjustHp(1)"
            >
              +
            </button>
          </div>
        </div>
        <div class="meter" :class="{ 'meter--accent': bloodied }">
          <span :style="{ width: hpPct + '%' }" />
        </div>
        <div class="small muted" style="font-size: 12px">{{ bloodiedLabel }}</div>
      </div>

      <div class="tile" style="gap: 8px; padding: 14px">
        <div class="row" style="justify-content: space-between; align-items: baseline">
          <div class="caps">Wounds</div>
          <div class="small" style="font-size: 13px">
            {{ sheet.wounds }} / {{ MAX_WOUNDS }} · tap to mark
          </div>
        </div>
        <div class="row" style="gap: 8px">
          <button
            v-for="n in MAX_WOUNDS"
            :key="n"
            type="button"
            class="wound"
            :aria-label="`Wound ${n}`"
            :aria-pressed="sheet.wounds >= n"
            :disabled="!canEdit"
            @click="setWounds(n)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div class="vitals">
        <div v-for="v in vitals" :key="v.label" class="tile">
          <div class="tile__label">{{ v.label }}</div>
          <div class="tile__value">{{ v.value }}</div>
        </div>
      </div>
    </section>

    <section class="panel stack" aria-labelledby="turn-h">
      <div class="row" style="justify-content: space-between">
        <h2 id="turn-h">This turn</h2>
        <button type="button" class="btn btn--ghost btn--sm" :disabled="!canEdit" @click="newTurn">
          New turn
        </button>
      </div>
      <div class="row" style="gap: 14px">
        <div class="row" style="gap: 8px">
          <button
            v-for="n in 3"
            :key="n"
            type="button"
            class="action"
            :aria-label="`Action ${n}`"
            :aria-pressed="n <= sheet.actionsSpent"
            :disabled="!canEdit"
            @click="setSpent(n)"
          >
            {{ n }}
          </button>
        </div>
        <div class="small" style="color: var(--page-soft)">{{ actionsLeft }} of 3 actions left</div>
      </div>

      <div v-if="hasResource" class="tile resource" :class="{ 'is-active': sheet.resource.active }">
        <div class="row" style="justify-content: space-between">
          <div class="stack" style="gap: 2px">
            <strong style="font-size: 15px">{{ sheet.resource.name }}</strong>
            <span class="muted" style="font-size: 12px">
              {{ sheet.resource.diceName || 'Bonus' }} dice add to melee damage
            </span>
          </div>
          <button
            type="button"
            class="btn btn--sm"
            :class="{ 'btn--ghost': !sheet.resource.active }"
            :aria-pressed="sheet.resource.active"
            :disabled="!canEdit"
            @click="sheet.resource.active = !sheet.resource.active"
          >
            {{ sheet.resource.active ? 'Active' : `Enter ${sheet.resource.name.toLowerCase()}` }}
          </button>
        </div>
        <div class="row" style="gap: 10px">
          <span class="small" style="font-size: 13px"
            >{{ sheet.resource.diceName || 'Bonus' }} dice</span
          >
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Remove a ${sheet.resource.diceName.toLowerCase() || 'bonus'} die`"
            :disabled="!canEdit"
            @click="adjustDice(-1)"
          >
            −
          </button>
          <span class="resource__dice">{{ sheet.resource.dice }}d{{ sheet.resource.die }}</span>
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Add a ${sheet.resource.diceName.toLowerCase() || 'bonus'} die`"
            :disabled="!canEdit"
            @click="adjustDice(1)"
          >
            +
          </button>
        </div>
      </div>

      <div class="stack" style="gap: 8px">
        <div class="caps">Heroic reactions</div>
        <div class="reactions">
          <button
            v-for="r in NIMBLE_REACTIONS"
            :key="r.name"
            type="button"
            :disabled="!canEdit"
            @click="spendOne"
          >
            <strong>{{ r.name }}</strong>
            <span>{{ r.desc }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>

  <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
    <div class="panel-title" style="margin: 0">
      <h2 id="atk-h">Attacks</h2>
      <span class="small muted" style="font-size: 12px">
        No attack roll: roll damage. A 1 on the first die misses; its max rolls again as a crit.
      </span>
    </div>
    <div v-if="attacks.length" class="attacks">
      <div v-for="(w, i) in attacks" :key="i" class="tile attack">
        <div class="attack__head">
          <div class="stack" style="gap: 2px">
            <strong style="font-size: 16px">{{ w.name }}</strong>
            <span class="muted" style="font-size: 12px">{{ w.props }}</span>
          </div>
          <span class="dmg" style="font-size: 15px">{{ w.dmg }}</span>
        </div>
        <button type="button" class="btn" :disabled="!canEdit" @click="w.roll">
          Roll {{ w.name.toLowerCase() }}
        </button>
      </div>
    </div>
    <p v-else class="empty">No attacks yet. Use “Edit sheet” to add one.</p>
    <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
  </section>

  <div class="three-col">
    <section class="panel stack" style="gap: 8px" aria-labelledby="sk-h">
      <h2 id="sk-h" style="margin-bottom: 6px">Skills</h2>
      <div v-for="s in skills" :key="s.name" class="skill">
        <span class="grow"
          >{{ s.name }} <small>{{ s.stat }}</small></span
        >
        <span class="skill__pts" :aria-label="`${s.points} skill points`">
          <i v-for="p in 2" :key="p" :class="{ on: p <= s.points }" />
        </span>
        <strong>{{ s.v }}</strong>
      </div>
    </section>

    <section class="panel stack" style="gap: 8px" aria-labelledby="ab-h">
      <h2 id="ab-h" style="margin-bottom: 6px">Class abilities</h2>
      <div v-for="(a, i) in sheet.abilities" :key="i" class="ability">
        <div class="row" style="justify-content: space-between; gap: 8px; flex-wrap: nowrap">
          <strong>{{ a.name }}</strong>
          <small>{{ a.src }}</small>
        </div>
        <span>{{ a.desc }}</span>
      </div>
      <p v-if="!sheet.abilities.length" class="empty">No abilities recorded yet.</p>
    </section>

    <section class="panel stack" style="gap: 8px" aria-labelledby="inv-h">
      <div class="panel-title" style="margin: 0 0 6px">
        <h2 id="inv-h">Inventory</h2>
        <span class="small" style="font-size: 13px">{{ sheet.gold }}</span>
      </div>
      <div
        v-for="(item, i) in sheet.inventory"
        :key="i"
        class="list-row"
        style="padding: 9px 0; font-size: 14px"
      >
        <span>{{ item.name }}</span>
        <span class="muted">{{ item.qty }}</span>
      </div>
      <div class="field" style="margin-top: 10px">
        <label
          for="nb-notes"
          style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.12em"
          >Notes</label
        >
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
  </div>
</template>

<style scoped lang="scss">
.identity {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: stretch;
}

.nb-portrait {
  flex: 0 0 180px;
  --portrait-w: 180px;
  --portrait-h: 220px;
  --portrait-radius: min(var(--radius-panel), 12px);
}

.identity__body {
  flex: 999 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;

  h1 {
    font-size: clamp(32px, 4.2vw, 52px);
    font-weight: 700;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
}

.identity__line {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 15px;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 10px 12px;
  border-radius: var(--radius-panel);
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  box-shadow: var(--panel-shadow);

  &--adv {
    border: 1.5px solid var(--accent);

    .stat__save {
      background: var(--warn-bg);
      color: var(--warn-text);
    }
  }

  &--dis .stat__save {
    background: var(--track);
  }
}

.stat__k {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--panel-muted);
}

.stat__v {
  font-family: var(--font-heading);
  font-size: 40px;
  font-weight: 700;
  line-height: 1.05;
}

.stat__save {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--panel-muted);
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.three-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.hp {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hp__value {
  font-family: var(--font-heading);
  font-size: 26px;
  font-weight: 700;
  min-width: 90px;
  text-align: center;

  span {
    font-size: 16px;
    color: var(--page-muted);
  }
}

.wound {
  width: 44px;
  height: 44px;
  border-radius: min(var(--radius-control), 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  color: var(--line);
  border: 1px solid var(--line);

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border: 1.5px solid var(--accent);
  }
}

.vitals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 10px;
}

.action {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 15px;
  background: var(--secondary);
  color: var(--on-secondary);
  border: 1.5px solid var(--secondary);

  &[aria-pressed='true'] {
    background: var(--field);
    color: var(--page-muted);
    border: 1.5px dashed var(--line-strong);
  }
}

.resource {
  gap: 12px;
  padding: 14px;

  &.is-active {
    border: 1.5px solid var(--accent);
  }
}

.resource__dice {
  min-width: 48px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-text);
}

.step--sm {
  width: 40px;
  height: 40px;
  font-size: 18px;
}

.reactions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 56px;
    padding: 8px 12px;
    border-radius: min(var(--radius-panel), 10px);
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--page-text);
    text-align: left;

    strong {
      font-size: 14px;
      font-weight: 600;
    }

    span {
      font-size: 12px;
      color: var(--page-muted);
    }
  }
}

.attacks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
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

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  border-bottom: 1px solid var(--track);
  font-size: 14px;

  small {
    font-size: 11px;
    color: var(--page-muted);
  }

  strong {
    min-width: 32px;
    text-align: right;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
}

.skill__pts {
  display: flex;
  gap: 3px;

  i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--track);

    &.on {
      background: var(--accent);
    }
  }
}

.ability {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-bottom: 1px solid var(--track);

  strong {
    font-size: 14px;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
    white-space: nowrap;
  }

  > span {
    font-size: 13px;
    color: var(--page-soft);
    line-height: 1.45;
  }
}
</style>
