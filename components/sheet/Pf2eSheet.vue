<script setup lang="ts">
import type { Pf2eAttr, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { mapPenalties, parseDice, rollAttack, rollDice, sign } from '~/utils/dice'
import { PF2E_CONDITIONS } from '~/utils/sheetDefaults'

const { draft, canEdit, campaignName, hpPct, xpPct, xpLabel, adjustHp, lastRoll, say } =
  useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const RANK_NAME: Record<Pf2eRank, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}
const ATTR_NAME: Record<Pf2eAttr, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

const fields = [
  { key: 'lineage', label: 'Ancestry' },
  { key: 'heritage', label: 'Heritage' },
  { key: 'background', label: 'Background' },
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'deity', label: 'Deity' },
] as const

const attrs = computed(() =>
  (Object.keys(ATTR_NAME) as Pf2eAttr[]).map((k) => ({
    k,
    v: sign(sheet.value.attrs[k]),
    name: ATTR_NAME[k],
    key: sheet.value.keyAttr === k,
  })),
)

const hasShield = computed(() => sheet.value.shield.name.trim() !== '')
const ac = computed(() => sheet.value.ac + (hasShield.value && sheet.value.shield.raised ? 2 : 0))
const shieldPct = computed(() => {
  const { hp, hpMax } = sheet.value.shield
  return hpMax > 0 ? Math.round((hp / hpMax) * 100) : 0
})

function setHero(n: number) {
  if (!canEdit.value) return
  sheet.value.heroPoints = sheet.value.heroPoints === n ? n - 1 : n
}

function toggleCondition(name: string) {
  if (!canEdit.value) return
  const list = sheet.value.conditions
  const idx = list.indexOf(name)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(name)
}

function setFocus(n: number) {
  if (!canEdit.value) return
  sheet.value.focus.current = sheet.value.focus.current === n ? n - 1 : n
}

const strikes = computed(() =>
  sheet.value.strikes.map((w) => {
    const typeInitial = w.type ? ` ${w.type.charAt(0).toUpperCase()}` : ''
    return {
      name: w.name,
      traits: w.traits
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      dmg: `${w.dmg}${typeInitial}`,
      atks: mapPenalties(w.agile).map((penalty, i) => ({
        text: sign(w.bonus - penalty),
        label: `${w.name} attack ${i + 1}`,
        roll: () => {
          const r = rollAttack(w.bonus - penalty)
          const note = r.natural === 20 ? ' · natural 20' : r.natural === 1 ? ' · natural 1' : ''
          say(`${w.name} (attack ${i + 1}): ${r.total}${note}`)
        },
      })),
      dmgRoll: () => {
        const expr = parseDice(w.dmg)
        if (!expr) return say(`${w.name}: “${w.dmg}” isn’t a dice expression like 1d8+4`)
        say(`${w.name} damage: ${rollDice(expr).total} ${w.type.toLowerCase()}`.trim())
      },
    }
  }),
)

function bulkOf(qty: string): number {
  const v = qty.trim().toUpperCase()
  if (v === 'L') return 0.1
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const bulk = computed(() => {
  const total = sheet.value.inventory.reduce((sum, item) => sum + bulkOf(item.qty), 0)
  return Math.round(total * 10) / 10
})
const bulkPct = computed(() =>
  sheet.value.bulkLimit > 0
    ? Math.min(100, Math.round((bulk.value / sheet.value.bulkLimit) * 100))
    : 0,
)
</script>

<template>
  <section class="panel identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="pf-portrait" />
    <div class="identity__body">
      <div class="identity__top">
        <div class="stack" style="gap: 6px">
          <div class="row" style="gap: 10px">
            <span class="badge badge--pf2e">Pathfinder 2e</span>
            <span class="small muted">{{ campaignName }}</span>
          </div>
          <h1>{{ draft.name }}</h1>
        </div>
        <div class="row" style="gap: 18px">
          <div class="stack" style="gap: 6px">
            <div class="caps" style="font-size: 11px">Hero points</div>
            <div class="row" style="gap: 6px">
              <button
                v-for="n in 3"
                :key="n"
                type="button"
                class="pip"
                :aria-label="`Hero point ${n}`"
                :aria-pressed="sheet.heroPoints >= n"
                :disabled="!canEdit"
                @click="setHero(n)"
              />
            </div>
          </div>
          <div class="level-ring">
            <strong>{{ draft.level }}</strong>
            <span>Level</span>
          </div>
          <div class="xp">
            <div>{{ xpLabel }}</div>
            <div class="meter meter--thin"><span :style="{ width: xpPct + '%' }" /></div>
          </div>
        </div>
      </div>
      <div class="identity__fields">
        <div class="field">
          <label for="pf-name">Character name</label>
          <input
            id="pf-name"
            v-model="draft.name"
            class="input"
            maxlength="80"
            :readonly="!canEdit"
          />
        </div>
        <div v-for="f in fields" :key="f.key" class="field">
          <label :for="`pf-${f.key}`">{{ f.label }}</label>
          <input :id="`pf-${f.key}`" v-model="sheet[f.key]" class="input" :readonly="!canEdit" />
        </div>
      </div>
    </div>
  </section>

  <section class="stack" style="gap: 12px" aria-labelledby="attr-h">
    <div class="section-head">
      <h2 id="attr-h" style="font-size: 20px">Attribute modifiers</h2>
      <span class="small muted">Key attribute: {{ ATTR_NAME[sheet.keyAttr] }}</span>
    </div>
    <div class="attrs">
      <div v-for="a in attrs" :key="a.k" class="attr" :class="{ 'is-key': a.key }">
        <div class="caps">{{ a.k }}</div>
        <div class="attr__v">{{ a.v }}</div>
        <div class="attr__name">{{ a.name }}</div>
      </div>
    </div>
  </section>

  <div class="two-col">
    <section class="panel stack" aria-labelledby="def-h">
      <h2 id="def-h">Defenses</h2>
      <div class="row" style="align-items: stretch">
        <div class="ac">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--secondary)"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          </svg>
          <div class="ac__v">{{ ac }}</div>
          <div class="caps" style="font-size: 11px">AC · {{ RANK_NAME[sheet.acRank] }}</div>
        </div>
        <div v-if="hasShield" class="tile shield">
          <div class="shield__head">
            <div class="caps">{{ sheet.shield.name }}</div>
            <button
              type="button"
              class="chip shield__btn"
              :aria-pressed="sheet.shield.raised"
              :disabled="!canEdit"
              @click="sheet.shield.raised = !sheet.shield.raised"
            >
              {{ sheet.shield.raised ? 'Raised · +2 AC' : 'Raise shield' }}
            </button>
          </div>
          <div class="facts">
            <span
              >Hardness <strong>{{ sheet.shield.hardness }}</strong></span
            >
            <span
              >HP <strong>{{ sheet.shield.hp }} / {{ sheet.shield.hpMax }}</strong></span
            >
            <span
              >BT <strong>{{ sheet.shield.bt }}</strong></span
            >
          </div>
          <div class="meter meter--thin"><span :style="{ width: shieldPct + '%' }" /></div>
        </div>
      </div>

      <div class="saves">
        <div v-for="s in sheet.saves" :key="s.label" class="tile" style="gap: 6px; padding: 12px">
          <div class="save__head">
            <span class="tile__label">{{ s.label }}</span>
            <span class="rank" :class="`rank--${s.rank}`" :title="RANK_NAME[s.rank]">{{
              s.rank
            }}</span>
          </div>
          <div class="tile__value" style="font-size: 24px">
            {{ s.label === 'Class DC' ? s.value : sign(s.value) }}
          </div>
        </div>
      </div>

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
        <div class="meter"><span :style="{ width: hpPct + '%' }" /></div>
        <div class="facts">
          <span
            >Temp HP <strong>{{ sheet.tempHp }}</strong></span
          >
          <span
            >Dying <strong>{{ sheet.dying }} / 4</strong></span
          >
          <span
            >Wounded <strong>{{ sheet.wounded }}</strong></span
          >
          <span
            >Speed <strong>{{ sheet.speed }}</strong></span
          >
        </div>
      </div>

      <div class="stack" style="gap: 8px">
        <div class="caps">Conditions</div>
        <div class="chips">
          <button
            v-for="c in PF2E_CONDITIONS"
            :key="c"
            type="button"
            class="chip cond"
            :aria-pressed="sheet.conditions.includes(c)"
            :disabled="!canEdit"
            @click="toggleCondition(c)"
          >
            {{ c }}
          </button>
        </div>
      </div>
    </section>

    <section class="panel stack" style="gap: 12px" aria-labelledby="sk-h">
      <div class="panel-title" style="margin: 0">
        <h2 id="sk-h">Skills</h2>
        <div class="rank-legend">
          <span>U untrained</span><span>T trained</span><span>E expert</span><span>M master</span
          ><span>L legendary</span>
        </div>
      </div>
      <div class="skills">
        <div
          v-for="s in sheet.skills"
          :key="s.name"
          class="skill"
          :class="{ 'is-trained': s.rank !== 'U' }"
        >
          <span class="rank" :class="`rank--${s.rank}`" :title="RANK_NAME[s.rank]">{{
            s.rank
          }}</span>
          <span class="skill__name"
            >{{ s.name }} <small>{{ s.attr }}</small></span
          >
          <strong>{{ sign(s.value) }}</strong>
        </div>
      </div>
    </section>
  </div>

  <section class="panel stack" style="gap: 14px" aria-labelledby="st-h">
    <div class="panel-title" style="margin: 0">
      <h2 id="st-h">Strikes</h2>
      <span class="small muted">
        Each button rolls that attack · 1st / 2nd / 3rd with multiple attack penalty
      </span>
    </div>
    <div v-if="strikes.length" class="table-wrap">
      <table class="table" style="min-width: 760px">
        <thead>
          <tr>
            <th scope="col">Strike</th>
            <th scope="col">Attack (MAP)</th>
            <th scope="col">Damage</th>
            <th scope="col">Traits</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(w, i) in strikes" :key="i">
            <td>
              <div class="row" style="gap: 8px; flex-wrap: nowrap">
                <span aria-label="One action" class="action-glyph">◆</span>
                <strong>{{ w.name }}</strong>
              </div>
            </td>
            <td>
              <div class="row" style="gap: 6px; flex-wrap: nowrap">
                <button
                  v-for="(a, n) in w.atks"
                  :key="n"
                  type="button"
                  class="atk"
                  :class="{ 'atk--first': n === 0 }"
                  :aria-label="a.label"
                  @click="a.roll"
                >
                  {{ a.text }}
                </button>
              </div>
            </td>
            <td>
              <button
                type="button"
                class="dmg dmg-btn"
                :aria-label="`Roll damage for ${w.name}`"
                @click="w.dmgRoll"
              >
                {{ w.dmg }}
              </button>
            </td>
            <td>
              <div class="row" style="gap: 6px">
                <span v-for="t in w.traits" :key="t" class="trait">{{ t }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">No strikes yet. Use “Edit sheet” to add one.</p>
    <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
  </section>

  <div class="two-col">
    <section class="panel stack" style="gap: 12px" aria-labelledby="ft-h">
      <h2 id="ft-h">Feats &amp; actions</h2>
      <div v-if="sheet.focus.max > 0" class="tile focus">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 14px">Focus points</strong>
          <span class="small muted" style="font-size: 12px">{{ sheet.focus.note }}</span>
        </div>
        <div class="row" style="gap: 6px">
          <button
            v-for="n in sheet.focus.max"
            :key="n"
            type="button"
            class="pip pip--secondary"
            :aria-label="`Focus point ${n}`"
            :aria-pressed="sheet.focus.current >= n"
            :disabled="!canEdit"
            @click="setFocus(n)"
          />
        </div>
      </div>
      <div v-for="(f, i) in sheet.feats" :key="i" class="feat">
        <div class="feat__meta">
          <span>{{ f.type }}</span>
          <small>{{ f.level }}</small>
        </div>
        <div class="feat__body">
          <strong>{{ f.action }} {{ f.name }}</strong>
          <span>{{ f.desc }}</span>
        </div>
      </div>
      <p v-if="!sheet.feats.length" class="empty">No feats recorded yet.</p>
    </section>

    <section class="panel stack" style="gap: 12px" aria-labelledby="inv-h">
      <div class="panel-title" style="margin: 0">
        <h2 id="inv-h">Inventory</h2>
        <span class="small">
          Bulk <strong>{{ bulk }}</strong> / {{ sheet.bulkLimit }} before encumbered
        </span>
      </div>
      <div class="meter meter--accent meter--thin"><span :style="{ width: bulkPct + '%' }" /></div>
      <div>
        <div
          v-for="(item, i) in sheet.inventory"
          :key="i"
          class="list-row"
          style="padding: 10px 0; font-size: 14px"
        >
          <span>{{ item.name }}</span>
          <span class="muted">{{ item.qty }}</span>
        </div>
      </div>
      <div class="facts">
        <span
          >gp <strong>{{ sheet.coins.gp }}</strong></span
        >
        <span
          >sp <strong>{{ sheet.coins.sp }}</strong></span
        >
        <span
          >cp <strong>{{ sheet.coins.cp }}</strong></span
        >
      </div>
      <div class="field">
        <label for="pf-notes">Notes</label>
        <textarea id="pf-notes" v-model="sheet.notes" class="input" rows="4" :readonly="!canEdit" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.identity {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.pf-portrait {
  flex: 0 0 168px;
  --portrait-w: 168px;
  --portrait-h: 200px;
}

.identity__body {
  flex: 999 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  h1 {
    font-size: clamp(28px, 3.4vw, 40px);
  }
}

.identity__top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.identity__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: 12px;

  label {
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.12em;
  }
}

.level-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid var(--secondary);
  background: var(--field);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  strong {
    font-family: var(--font-heading);
    font-size: 28px;
    line-height: 1;
  }

  span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.xp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 130px;
  font-size: 12px;
  color: var(--page-soft);
}

.attrs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.attr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 14px 8px;
  border-radius: min(var(--radius-panel), 12px);
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  box-shadow: var(--panel-shadow);
  --page-muted: var(--panel-muted);

  &.is-key {
    border: 1.5px solid var(--accent);
  }
}

.attr__v {
  font-family: var(--font-heading);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.15;
}

.attr__name {
  font-size: 11px;
  color: var(--page-muted);
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.ac {
  flex: 0 0 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 14px 8px;
  border-radius: min(var(--radius-panel), 12px);
  background: var(--field);
  border: 1.5px solid var(--secondary);
}

.ac__v {
  font-family: var(--font-heading);
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
}

.shield {
  flex: 1 1 200px;
  gap: 10px;
  padding: 14px;
}

.shield__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.shield__btn {
  border-radius: min(var(--radius-control), 8px);
  font-size: 12px;
  font-weight: 600;
  border-color: var(--line-strong);
  color: var(--page-text);

  &[aria-pressed='true'] {
    background: var(--secondary);
    border-color: var(--secondary);
    color: var(--on-secondary);
  }
}

.facts {
  display: flex;
  gap: 8px 20px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.saves {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 10px;
}

.save__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.rank {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  background: var(--track);
  color: var(--page-muted);
  font-family: Inter, system-ui, sans-serif;

  &--T {
    background: var(--line);
    color: var(--page-text);
  }

  &--E {
    background: var(--secondary);
    color: var(--on-secondary);
  }

  &--M,
  &--L {
    background: var(--accent);
    color: var(--on-accent);
  }
}

.rank-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11px;
  color: var(--page-muted);
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

.cond {
  font-size: 12px;
  font-weight: 600;
  background: var(--field);
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  column-gap: 20px;
}

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  border-bottom: 1px solid var(--track);
  font-size: 14px;
  color: var(--page-soft);

  &.is-trained {
    color: var(--page-text);

    .skill__name {
      font-weight: 600;
    }
  }

  strong {
    font-size: 15px;
    color: var(--page-text);
    font-variant-numeric: tabular-nums;
  }
}

.skill__name {
  flex: 1 1 auto;

  small {
    font-size: 11px;
    font-weight: 400;
    color: var(--page-muted);
  }
}

.action-glyph {
  color: var(--secondary);
  font-size: 13px;
}

.atk {
  min-height: 40px;
  min-width: 52px;
  padding: 0 10px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-soft);
  font-weight: 700;
  font-size: 14px;
  font-variant-numeric: tabular-nums;

  &--first {
    border-color: var(--secondary);
    background: color-mix(in srgb, var(--secondary) 14%, var(--field));
    color: var(--page-text);
  }
}

.dmg-btn {
  min-height: 40px;
  padding: 0 12px;
  border-radius: min(var(--radius-control), 8px);
  font-size: 14px;
}

.trait {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--track);
  border: 1px solid var(--line);
  color: var(--page-soft);
}

.focus {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.feat {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--track);
}

.feat__meta {
  flex: 0 0 72px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  small {
    font-size: 12px;
    color: var(--page-soft);
  }
}

.feat__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 14px;
  }

  span {
    font-size: 13px;
    color: var(--page-soft);
    line-height: 1.45;
  }
}
</style>
