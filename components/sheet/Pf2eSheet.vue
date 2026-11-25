<script setup lang="ts">
import type { Pf2eAttr, Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import {
  type Pf2eStatContext,
  SAVE_ATTR,
  acNow as acAfter,
  adjusted,
  degreeOf,
  heal,
  isDead,
  shieldAc,
  shieldBroken,
  takeDamage,
} from '~/utils/pf2ePlay'
import { shiftedDegree, speedNow } from '~/utils/pf2eEffects'
import { PF2E_RANK_NAME } from '~/utils/heroCardStats'

const { draft, canEdit, hpPct, xpPct, xpLabel, say } = useSheet<Pf2eSheet>()
// The GM's HP and condition changes from the battle board.
useHeroHpChanges()
useHeroConditionChanges()
/** Results show in the panel that made them; anything else in Defenses, beside HP. */
const { claim, resultIn, unclaimed } = useResultOwner()
const sheet = computed(() => draft.value.sheet)

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
// A raised shield's bonus is a circumstance bonus the engine stacks (it doesn't add to Shield's +1).
const ac = computed(() => sheet.value.ac)
const broken = computed(() => shieldBroken(sheet.value))
const dead = computed(() => isDead(sheet.value))
/** The ±1 HP steppers go through the damage rules, so 0 HP still knocks the hero out. */
function stepHp(by: number) {
  if (!canEdit.value) return
  const dyingBefore = sheet.value.dying
  const message = by < 0 ? takeDamage(sheet.value, 1) : heal(sheet.value, 1)
  if (sheet.value.dying !== dyingBefore) say(message)
}

/** AC after conditions (off-guard, clumsy, frightened…), a raised shield; petrified is 9. */
const acNow = computed(() => acAfter(sheet.value))

const saveContext = (label: string): Pf2eStatContext =>
  label === 'Perception'
    ? { kind: 'perception', attr: 'WIS' }
    : label === 'Class DC'
      ? { kind: 'classDc', attr: sheet.value.keyAttr }
      : { kind: 'save', attr: SAVE_ATTR[label], save: label as 'Fortitude' | 'Reflex' | 'Will' }
const saves = computed(() =>
  sheet.value.saves.map((x) => ({
    ...x,
    now: adjusted(sheet.value, x.value, saveContext(x.label)),
  })),
)
const skills = computed(() =>
  sheet.value.skills.map((x) => ({
    ...x,
    now: adjusted(sheet.value, x.value, { kind: 'skill', attr: x.attr, skill: x.name }),
  })),
)

const natNote = (n: number | null) => (n === 20 ? ', natural 20' : n === 1 ? ', natural 1' : '')

/** A check with this modifier; the dice tray shows the die, modifier and total. */
function check(name: string, bonus: number) {
  const r = rollCheck(bonus)
  const line = `${name}: ${r.total} (${r.d20} ${sign(bonus)}${natNote(r.natural)})`
  showOutcome({ label: name, total: r.total, detail: line })
  say(line)
}

/** The DC of the effect the hero is saving against, for the save's degree. */
const saveDc = ref<number | null>(null)

/**
 * A saving throw: with a DC it says the degree of success (p. 401) after the hero's
 * upgrades (Juggernaut: a success is a critical success), and notes the ones that hold only
 * against some effects (Bravery against fear).
 */
function rollSave(label: string, bonus: number) {
  if (label !== 'Fortitude' && label !== 'Reflex' && label !== 'Will') return check(label, bonus)
  const r = rollCheck(bonus)
  const head = `${label}: ${r.total} (${r.d20} ${sign(bonus)}${natNote(r.natural)})`
  const dc = saveDc.value
  if (!dc) {
    showOutcome({ label, total: r.total, detail: head })
    return say(head)
  }
  const rolled = degreeOf(r.total, r.d20, dc)
  const shift = shiftedDegree(sheet.value, label, rolled)
  const by = shift.by ? ` → ${shift.degree} (${shift.by})` : ''
  const notes = shift.notes.length ? ` ${shift.notes.join('; ')}.` : ''
  const line = `${head} vs DC ${dc}: ${rolled}${by}.${notes}`
  const degree = shift.degree.replace(/^\w/, (c) => c.toUpperCase())
  showOutcome({ label: `${label} save`, total: r.total, detail: line, degree })
  say(line)
}

watch(
  () => draft.value.level,
  (level) => {
    if (canEdit.value && sheet.value.level !== level) sheet.value.level = level
  },
  { immediate: true },
)

const strikesApi = providePf2eStrikes()
const { targetAc, damageFlags, conditionsOffered, strikes, nextAttack } = strikesApi
const turnActive = computed(() => !!sheet.value.turn?.active)

/** A Strike from the table: one action while the turn tracker runs (Player Core p. 418). */
function strikeFromTable(index: number, step: number) {
  if (!canEdit.value) return
  const t = sheet.value.turn
  if (t?.active) {
    if (t.finisher) return say('You used a finisher this turn: no more attacks.')
    if (t.actions < 1) return say('No actions left this turn.')
    t.actions -= 1
  }
  strikesApi.attack(index, { map: step })
}

const speed = computed(() => speedNow(sheet.value, draft.value.level))

const shieldPct = computed(() => {
  const { hp, hpMax } = sheet.value.shield
  return hpMax > 0 ? Math.round((hp / hpMax) * 100) : 0
})

function setHero(n: number) {
  if (!canEdit.value) return
  sheet.value.heroPoints = sheet.value.heroPoints === n ? n - 1 : n
}

function setFocus(n: number) {
  if (!canEdit.value) return
  sheet.value.focus.current = sheet.value.focus.current === n ? n - 1 : n
}
</script>

<template>
  <section class="panel identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="pf-portrait" />
    <div class="identity__body">
      <div class="identity__top">
        <div class="stack" style="gap: 6px">
          <div class="row" style="gap: 10px">
            <span class="badge badge--pf2e">Pathfinder 2e</span>
            <span class="small muted"><SheetCampaignLink /></span>
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
          <div
            class="ac__v"
            :class="{ 'is-changed': acNow.changed }"
            :title="acNow.changed ? `${ac} ${acNow.note}` : undefined"
          >
            {{ acNow.value }}
          </div>
          <div class="caps" style="font-size: 11px">AC · {{ PF2E_RANK_NAME[sheet.acRank] }}</div>
        </div>
        <div v-if="hasShield" class="tile shield">
          <div class="shield__head">
            <div class="caps">{{ sheet.shield.name }}</div>
            <button
              type="button"
              class="chip shield__btn"
              :aria-pressed="sheet.shield.raised && !broken"
              :disabled="!canEdit || broken"
              :title="
                broken
                  ? 'Broken (HP at or below its Broken Threshold): it can’t be raised until Repaired'
                  : undefined
              "
              @click="sheet.shield.raised = !sheet.shield.raised"
            >
              {{
                broken
                  ? 'Broken'
                  : sheet.shield.raised
                    ? `Raised · +${shieldAc(sheet)} AC`
                    : 'Raise shield'
              }}
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

      <label class="target">
        Save DC
        <input
          v-model.number="saveDc"
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
          aria-describedby="save-dc-help"
        />
        <span id="save-dc-help" class="small muted">for the degree of success</span>
      </label>
      <div class="saves">
        <div v-for="x in saves" :key="x.label" class="tile" style="gap: 6px; padding: 12px">
          <div class="save__head">
            <span class="tile__label">{{ x.label }}</span>
            <span class="rank" :class="`rank--${x.rank}`" :title="PF2E_RANK_NAME[x.rank]">{{
              x.rank
            }}</span>
          </div>
          <div
            v-if="x.label === 'Class DC'"
            class="tile__value"
            :class="{ 'is-changed': x.now.changed }"
            :title="x.now.changed ? `${x.value} ${x.now.note}` : undefined"
            style="font-size: 24px"
          >
            {{ x.now.value }}
          </div>
          <button
            v-else
            type="button"
            class="tile__value roll-value"
            :class="{ 'is-changed': x.now.changed }"
            :title="x.now.changed ? `${sign(x.value)} ${x.now.note}` : `Roll ${x.label}`"
            :aria-label="`Roll ${x.label} ${sign(x.now.value)}`"
            @click="claim('defense:save', () => rollSave(x.label, x.now.value))"
          >
            {{ sign(x.now.value) }}
          </button>
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
              @click="stepHp(-1)"
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
              :disabled="!canEdit || dead"
              @click="stepHp(1)"
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
            >Speed
            <strong
              :class="{ 'is-changed': speed.changed }"
              :title="speed.changed ? speed.note : undefined"
              >{{ speed.text }}</strong
            ></span
          >
        </div>
        <Pf2eSheetHealth />
      </div>

      <Pf2eSheetDefenses />

      <Pf2eSheetConditions />
      <p
        v-if="resultIn('defense:') || unclaimed"
        class="roll-status"
        role="status"
        aria-live="polite"
      >
        {{ resultIn('defense:') || unclaimed }}
      </p>
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
        <button
          v-for="x in skills"
          :key="x.name"
          type="button"
          class="skill"
          :class="{ 'is-trained': x.rank !== 'U' }"
          :title="x.now.changed ? `${sign(x.value)} ${x.now.note}` : `Roll ${x.name}`"
          :aria-label="`Roll ${x.name} ${sign(x.now.value)}`"
          @click="claim('skills:check', () => check(x.name, x.now.value))"
        >
          <span class="rank" :class="`rank--${x.rank}`" :title="PF2E_RANK_NAME[x.rank]">{{
            x.rank
          }}</span>
          <span class="skill__name"
            >{{ x.name }} <small>{{ x.attr }}</small></span
          >
          <strong :class="{ 'is-changed': x.now.changed }">{{ sign(x.now.value) }}</strong>
        </button>
      </div>
      <p v-if="resultIn('skills:')" class="roll-status" role="status" aria-live="polite">
        {{ resultIn('skills:') }}
      </p>
    </section>
  </div>

  <Pf2eSheetEffects />

  <Pf2eSheetTurn />

  <section class="panel stack" style="gap: 14px" aria-labelledby="st-h">
    <div class="panel-title" style="margin: 0">
      <h2 id="st-h">Strikes</h2>
      <span class="small muted">
        Each button rolls that attack · 1st / 2nd / 3rd with multiple attack penalty
      </span>
      <label class="target">
        Target AC
        <input
          v-model.number="targetAc"
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
        />
      </label>
      <label v-if="conditionsOffered.includes('offGuard')" class="target">
        <input v-model="damageFlags.offGuard" type="checkbox" />
        Target off-guard
      </label>
      <label v-if="conditionsOffered.includes('huntedPrey')" class="target">
        <input v-model="damageFlags.huntedPrey" type="checkbox" />
        First hit on your prey this round
      </label>
      <label v-if="conditionsOffered.includes('stratagem')" class="target">
        <input v-model="damageFlags.stratagem" type="checkbox" />
        Devise a Stratagem (next Strike: INT to the attack)
      </label>
    </div>
    <div
      v-if="strikes.length"
      class="table-wrap"
      tabindex="0"
      role="region"
      aria-label="Table, scroll sideways for more"
    >
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
                <span class="action-glyph" aria-hidden="true">◆</span
                ><span class="sr-only">One action</span>
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
                  :class="{
                    'atk--first': n === (turnActive ? nextAttack : 0),
                    'is-changed': w.changed,
                  }"
                  :title="w.changed ? w.note : undefined"
                  :aria-label="a.label"
                  :disabled="!canEdit"
                  @click="claim(`strike:${w.index}`, () => strikeFromTable(w.index, n))"
                >
                  {{ a.text }}
                </button>
              </div>
            </td>
            <td>
              <div class="row" style="gap: 6px; flex-wrap: nowrap">
                <button
                  type="button"
                  class="dmg dmg-btn"
                  :class="{ 'is-changed': w.dmgChanged }"
                  :title="w.dmgChanged ? w.dmgNote : undefined"
                  :aria-label="`Roll damage for ${w.name}`"
                  @click="claim(`strike:${w.index}`, () => strikesApi.damage(w.index, false))"
                >
                  {{ w.dmg }}
                </button>
                <button
                  type="button"
                  class="atk crit-btn"
                  :aria-label="`Roll critical damage for ${w.name}`"
                  :title="`Critical hit: double damage${w.critNote ? `, then ${w.critNote}` : ''}`"
                  @click="claim(`strike:${w.index}`, () => strikesApi.damage(w.index, true))"
                >
                  ×2
                </button>
              </div>
            </td>
            <td>
              <div class="row" style="gap: 6px">
                <span v-for="t in w.traits" :key="t" class="trait">{{ t }}</span>
                <button
                  v-if="w.twoHandDie"
                  type="button"
                  class="chip grip"
                  :aria-pressed="w.twoHands"
                  :title="`Two-hand: d${w.twoHandDie} damage dice while held in two hands`"
                  @click="strikesApi.toggleTwoHands(w.index)"
                >
                  Two hands
                </button>
                <button
                  v-if="w.versatile"
                  type="button"
                  class="chip grip"
                  :aria-pressed="w.versatileOn"
                  :title="`Versatile: deal ${w.versatile.toLowerCase()} damage instead`"
                  @click="strikesApi.toggleVersatile(w.index)"
                >
                  {{ w.versatile }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">No strikes yet. Use “Edit sheet” to add one.</p>
    <p v-if="resultIn('strike:')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('strike:') }}
    </p>
  </section>

  <Pf2eSheetActions />

  <Pf2eSheetSpells v-if="sheet.spellcasting || sheet.focusSpells?.length" />
  <Pf2eSheetSpells
    v-for="c in sheet.archetypeCasting ?? []"
    :key="c.archetype"
    :archetype="c.archetype"
  />

  <div class="two-col">
    <section class="panel stack" style="gap: 12px" aria-labelledby="ft-h">
      <h2 id="ft-h">Feats &amp; features</h2>
      <div v-if="sheet.focus.max > 0 && !sheet.focusSpells?.length" class="tile focus">
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
      <Pf2eSheetFeats />
    </section>

    <Pf2eSheetInventory />
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

.is-changed {
  color: var(--warn-text);
}

.roll-value {
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
  color: inherit;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.target {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;

  .input {
    width: 80px;
  }
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
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--page-text);
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
  width: 100%;
  min-height: 40px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--track);
  background: none;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: var(--page-soft);
  cursor: pointer;

  &:hover .skill__name {
    text-decoration: underline;
  }

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

.grip {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
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
</style>
