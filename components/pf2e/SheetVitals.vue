<script setup lang="ts">
// Vitals panel of the PF2e sheet, laid out like Nimble's: HP with Crit and Shield Block for the
// next damage, the draggable bar (temp HP first, a raised shield's Hardness while blocking) and
// a temp HP stepper; the AC badge with the raised shield; Dying (to death, doomed bringing it
// sooner), Wounded and Doomed, beside Hero Points with the recovery check and Heroic Recovery;
// Speed, Initiative and Class DC; conditions; typed damage and persistent damage folded; rests.
// Damage and healing go through utils/pf2ePlay.ts (Player Core pp. 406–412).
import type { Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome, sign, typedCheck } from '~/utils/dice'
import { PF2E_DAMAGE_TYPES, defensesOf } from '~/utils/pf2eDamage'
import { baseDeathAt, speedNow } from '~/utils/pf2eEffects'
import { PF2E_RANK_NAME } from '~/utils/heroCardStats'
import { timePasses } from '~/utils/pf2eActions'
import {
  acNow,
  adjusted,
  deathAt,
  degreeOf,
  heal,
  heroicRecovery,
  initiativeCheck,
  isDead,
  nightsRest,
  recoveryCheck,
  recoveryDc,
  resurrect,
  shieldAc,
  shieldBlockProblem,
  shieldBroken,
  takeDamage,
} from '~/utils/pf2ePlay'
import { dailyPreparations } from '~/utils/pf2eSpells'
import { hpTone as toneFor } from '~/utils/roster'
import type { HpTakes } from '~/utils/hpPreview'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultIn } = useResultOwner()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)

const dead = computed(() => isDead(sheet.value))
const dying = computed(() => sheet.value.dying > 0 && !dead.value)
const hpTone = computed(() => toneFor(sheet.value.hp, sheet.value.hpMax))

/** The next damage is from a critical hit, or blocked by the raised shield; both reset after it. */
const crit = ref(false)
const block = ref(false)
const shieldUp = computed(() => !!sheet.value.shield.name.trim() && sheet.value.shield.raised)
const blockProblem = computed(() => shieldBlockProblem(sheet.value, []))
watch(blockProblem, (why) => why && (block.value = false))

/** Shield Block on the bar's preview: the shield takes its Hardness off the hit (p. 262). */
const takes = computed<HpTakes | undefined>(() => {
  if (!block.value || blockProblem.value) return undefined
  const hardness = sheet.value.shield.hardness
  return (d: number) => {
    const taken = Math.max(0, d - hardness)
    return { taken, note: `Shield Block: you take ${taken}` }
  }
})

const hpState = computed(() => {
  const s = sheet.value
  if (dead.value) return 'Dead'
  if (s.hp === 0) return `Unconscious · dying ${s.dying}`
  return `At 0 HP: dying ${1 + s.wounded}`
})

function hurt(amount: number, extra: { type?: string; spell?: boolean; tradition?: string } = {}) {
  if (!canEdit.value || amount <= 0) return
  const line = takeDamage(sheet.value, amount, {
    crit: crit.value,
    shieldBlock: block.value && !blockProblem.value,
    ...extra,
  })
  crit.value = false
  block.value = false
  claim('vit:hp', () => say(line))
}

function mend(amount: number) {
  if (!canEdit.value || amount <= 0) return
  const line = heal(sheet.value, amount)
  claim('vit:hp', () => say(line))
}

function changeHp(delta: number) {
  if (delta < 0) hurt(-delta)
  else mend(delta)
}

/** The +1 step only speaks when it changes more than HP (waking up from 0). */
function healOne() {
  if (!canEdit.value) return
  const dyingBefore = sheet.value.dying
  const line = heal(sheet.value, 1)
  if (sheet.value.dying !== dyingBefore) claim('vit:hp', () => say(line))
}

function adjustTemp(delta: number) {
  if (canEdit.value) sheet.value.tempHp = Math.max(0, sheet.value.tempHp + delta)
}

const ac = computed(() => acNow(sheet.value))
const acTitle = computed(() =>
  [
    `AC ${sheet.value.ac} on the sheet: 10 + DEX up to the armor's cap + proficiency (${PF2E_RANK_NAME[sheet.value.acRank]}) + armor`,
    ...(ac.value.changed ? ac.value.note.split(', ') : []),
  ].join('\n'),
)
const hasShield = computed(() => sheet.value.shield.name.trim() !== '')
const broken = computed(() => shieldBroken(sheet.value))
const shieldPct = computed(() => {
  const { hp, hpMax } = sheet.value.shield
  return hpMax > 0 ? Math.round((hp / hpMax) * 100) : 0
})

function toggleShield() {
  if (canEdit.value && !broken.value) sheet.value.shield.raised = !sheet.value.shield.raised
}

// Dying to death (4, 5 with Diehard, p. 254), the last `doomed` pips taken by doomed (p. 443).
const dyingMax = computed(() => baseDeathAt(sheet.value))
const death = computed(() => deathAt(sheet.value))
const TRACK_MAX = 4

function setTrack(key: 'dying' | 'wounded' | 'doomed', n: number) {
  if (!canEdit.value) return
  const now = sheet.value[key] ?? 0
  sheet.value[key] = now === n ? n - 1 : n
}

function setHero(n: number) {
  if (!canEdit.value) return
  sheet.value.heroPoints = sheet.value.heroPoints === n ? n - 1 : n
}

/**
 * The recovery check is a flat check (p. 411): the tray shows the die and its degree. With
 * Manual dice it asks for the d20 first.
 */
const auth = useAuthStore()
const typingRecovery = ref(false)
function recover(values?: number[]) {
  if (!canEdit.value) return
  if (auth.profile?.own_dice && !values?.length) {
    typingRecovery.value = true
    return
  }
  typingRecovery.value = false
  claim('vit:hp', () => {
    const dc = recoveryDc(sheet.value)
    const r = values?.[0] !== undefined ? typedCheck(values[0], 0) : rollCheck(0)
    const line = recoveryCheck(sheet.value, r.d20)
    showOutcome({
      label: 'Recovery check',
      total: r.d20,
      detail: line,
      degree: degreeOf(r.d20, r.d20, dc),
    })
    say(line)
  })
}

function heroic() {
  if (canEdit.value) claim('vit:hp', () => say(heroicRecovery(sheet.value)))
}

function revive() {
  if (canEdit.value) claim('vit:hp', () => say(resurrect(sheet.value)))
}

const speed = computed(() => speedNow(sheet.value, level.value))
const initiative = computed(() => initiativeCheck(sheet.value))
const classDc = computed(() => {
  const row = sheet.value.saves.find((x) => x.label === 'Class DC')
  return row
    ? adjusted(sheet.value, row.value, { kind: 'classDc', attr: sheet.value.keyAttr })
    : null
})
const tiles = computed(() => [
  {
    label: 'Speed',
    value: speed.value.text,
    sub: speed.value.note || 'feet',
    changed: speed.value.changed,
    why: [
      `${sheet.value.speed} on the sheet`,
      ...(speed.value.note ? speed.value.note.split(', ') : []),
    ].join('\n'),
  },
  {
    label: 'Initiative',
    value: sign(initiative.value.value),
    sub: initiative.value.note || 'Perception',
    changed: initiative.value.changed,
    why: [
      'Perception, rolled for initiative (Player Core p. 436)',
      ...(initiative.value.note ? initiative.value.note.split(', ') : []),
    ].join('\n'),
  },
  {
    label: 'Class DC',
    value: classDc.value ? String(classDc.value.value) : '—',
    sub: classDc.value?.note || '10 + key + prof.',
    changed: !!classDc.value?.changed,
    why: [
      '10 + your key attribute + proficiency (Player Core p. 27)',
      ...(classDc.value?.note ? classDc.value.note.split(', ') : []),
    ].join('\n'),
  },
])

// Typed damage and healing: the type meets immunities, weaknesses and resistances (p. 408).
const amount = ref<number | null>(null)
const dmgType = ref('')
const fromSpell = ref(false)
const tradition = ref('')
const defenses = computed(() => defensesOf(sheet.value, level.value))
const spellMatters = computed(() => defenses.value.resistances.some((r) => /spell/i.test(r.type)))
const traditionMatters = computed(() =>
  defenses.value.resistances.some((r) =>
    /\b(?:arcane|divine|occult|primal) spells?\b/i.test(r.type),
  ),
)

function typedHurt() {
  if (!amount.value) return
  hurt(amount.value, {
    type: dmgType.value,
    spell: fromSpell.value,
    ...(fromSpell.value && tradition.value ? { tradition: tradition.value } : {}),
  })
  amount.value = null
  fromSpell.value = false
}

function typedHeal() {
  if (!amount.value || dead.value) return
  mend(amount.value)
  amount.value = null
}

function rest(period: 'minute' | '10min' | 'hour') {
  if (canEdit.value) claim('vit:rest', () => say(timePasses(sheet.value, period)))
}

const restOpen = ref(false)
function confirmRest() {
  restOpen.value = false
  if (!canEdit.value) return
  claim('vit:rest', () =>
    say(`${nightsRest(sheet.value, level.value)} ${dailyPreparations(sheet.value)}`),
  )
}
</script>

<template>
  <section class="panel stack" aria-labelledby="vit-h">
    <UiFold name="Vitals" />
    <div class="title-help">
      <h2 id="vit-h">Vitals</h2>
      <UiHelp
        label="About HP and dying"
        text="Damage takes temporary HP first. At 0 HP you're unconscious and dying 1 (2 on a crit) plus your wounded value; you die at dying 4, sooner while doomed. Each time you lose dying you become wounded 1 more (Player Core pp. 410–412). Drag the bar or use the arrow keys to preview a change; let go or press Enter to apply it."
      />
    </div>

    <div v-if="dead" class="notice notice--error dead-notice" role="alert">
      <strong>Dying {{ sheet.dying }}: your hero has died.</strong>
      <button
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="The Resurrect ritual's success (Player Core p. 394): 1 HP, clumsy 1, drained 1 and enfeebled 1 for a week"
        @click="revive"
      >
        Resurrect
      </button>
    </div>
    <div v-else-if="dying" class="notice notice--error" role="alert">
      <strong>Dying {{ sheet.dying }}.</strong> Unconscious; you die at dying {{ death }}. Roll a
      recovery check (DC {{ recoveryDc(sheet) }}) at the start of your turn.
    </div>

    <div class="vit-top">
      <div class="tile vit-block">
        <div class="vit-row">
          <div class="row" style="gap: 10px">
            <div class="caps">Hit points</div>
            <label class="crit" title="Your next damage is from a critical hit">
              <input v-model="crit" type="checkbox" :disabled="!canEdit" />
              Crit
            </label>
            <label
              v-if="shieldUp"
              class="crit crit--block"
              :title="
                blockProblem ||
                'Your reaction: the raised shield takes up to its Hardness, then you both take the rest'
              "
            >
              <input v-model="block" type="checkbox" :disabled="!canEdit || !!blockProblem" />
              Shield Block
            </label>
          </div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="step"
              aria-label="Take 1 damage"
              :disabled="!canEdit"
              @click="hurt(1)"
            >
              −
            </button>
            <div class="hp-value" aria-live="polite">
              {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
            </div>
            <button
              type="button"
              class="step"
              aria-label="Heal 1"
              :disabled="!canEdit || dead"
              @click="healOne"
            >
              +
            </button>
          </div>
        </div>
        <SheetHpBar
          :hp="sheet.hp"
          :max="sheet.hpMax"
          :temp="sheet.tempHp"
          :tone="hpTone"
          :disabled="!canEdit || dead"
          :takes="takes"
          @change="changeHp"
        />
        <div class="vit-row">
          <span
            class="hint"
            :title="sheet.hp ? `On a crit: dying ${2 + sheet.wounded}` : undefined"
            >{{ hpState }}</span
          >
          <div class="row" style="gap: 6px">
            <span class="temp-label">Temp HP</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Lower temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(-1)"
            >
              −
            </button>
            <span class="temp-value" aria-live="polite">{{ sheet.tempHp }}</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Raise temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(1)"
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div class="tile armor">
        <UiTooltip :title="`AC ${ac.value}`" :text="acTitle">
          <span class="armor__badge" tabindex="0">
            <svg class="armor__shield" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6Z" />
            </svg>
            <span class="armor__value" :class="{ 'is-changed': ac.changed }">{{ ac.value }}</span>
          </span>
        </UiTooltip>
        <span class="armor__label">AC</span>
        <template v-if="hasShield">
          <button
            type="button"
            class="chip shield-chip"
            :aria-pressed="sheet.shield.raised && !broken"
            :disabled="!canEdit || broken"
            :title="
              broken
                ? 'Broken (HP at or below its Broken Threshold): it can’t be raised until Repaired'
                : `${sheet.shield.name}: Raise a Shield (1 action) for its bonus until your next turn`
            "
            @click="toggleShield"
          >
            {{
              broken
                ? 'Broken'
                : sheet.shield.raised
                  ? `Raised +${shieldAc(sheet)}`
                  : 'Raise shield'
            }}
          </button>
          <span
            class="shield-hp"
            :title="`${sheet.shield.name}: Hardness ${sheet.shield.hardness}, HP ${sheet.shield.hp} / ${sheet.shield.hpMax}, Broken Threshold ${sheet.shield.bt}`"
          >
            <span class="meter meter--thin"><span :style="{ width: shieldPct + '%' }" /></span>
            <small
              >{{ sheet.shield.hp }}/{{ sheet.shield.hpMax }} · H{{ sheet.shield.hardness }}</small
            >
          </span>
        </template>
      </div>
    </div>

    <div class="tile vit-pair">
      <div class="vit-col vit-col--wounds">
        <div class="vit-head">
          <span class="caps">Dying</span>
          <span class="hint">{{ sheet.dying }} / {{ death }}</span>
        </div>
        <div class="row" style="gap: 6px">
          <button
            v-for="n in dyingMax"
            :key="n"
            type="button"
            class="wound"
            :class="{ 'is-doomed': n > death }"
            :aria-label="n > death ? `Dying ${n}: doomed brings death sooner` : `Dying ${n}`"
            :aria-pressed="sheet.dying >= n"
            :disabled="!canEdit || (n > death && sheet.dying < n)"
            @click="setTrack('dying', n)"
          >
            <svg
              width="14"
              height="14"
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
        <template
          v-for="t in [
            { key: 'wounded' as const, label: 'Wounded' },
            { key: 'doomed' as const, label: 'Doomed' },
          ]"
          :key="t.key"
        >
          <div class="vit-head">
            <span class="caps">{{ t.label }}</span>
            <span class="hint">{{ sheet[t.key] ?? 0 }}</span>
          </div>
          <div
            class="row"
            style="gap: 6px"
            role="group"
            :aria-label="`${t.label} ${sheet[t.key] ?? 0}`"
          >
            <button
              v-for="n in TRACK_MAX"
              :key="n"
              type="button"
              class="wound"
              :aria-label="`${t.label} ${n}`"
              :aria-pressed="(sheet[t.key] ?? 0) >= n"
              :disabled="!canEdit"
              @click="setTrack(t.key, n)"
            >
              <svg
                width="14"
                height="14"
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
        </template>
      </div>
      <div class="vit-col">
        <div class="vit-head">
          <span class="caps">Hero Points</span>
          <span class="hint">{{ sheet.heroPoints }} / 3</span>
        </div>
        <div class="row" style="gap: 6px">
          <button
            v-for="n in 3"
            :key="n"
            type="button"
            class="hd track__pip track__pip--hero"
            :class="{ on: sheet.heroPoints >= n }"
            :aria-label="`Hero Point ${n}`"
            :aria-pressed="sheet.heroPoints >= n"
            :disabled="!canEdit"
            @click="setHero(n)"
          />
        </div>
        <template v-if="dying">
          <button
            type="button"
            class="btn btn--sm"
            :disabled="!canEdit"
            :title="`A flat check against DC ${recoveryDc(sheet)} (p. 411)`"
            @click="recover()"
          >
            Recovery check
          </button>
          <NimbleDiceEntry
            v-if="typingRecovery"
            label="d20 you rolled"
            action="Recovery check"
            :disabled="!canEdit"
            @submit="recover"
          />
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || sheet.heroPoints < 1"
            :title="
              sheet.heroPoints < 1
                ? 'No Hero Points left'
                : 'Spend all your Hero Points to stabilize at 0 HP (p. 413)'
            "
            @click="heroic"
          >
            Heroic recovery
          </button>
        </template>
        <span v-else class="hint"
          >Spend 1 to reroll a check, or all of them to avoid death (p. 413).</span
        >
      </div>
    </div>

    <p v-if="resultIn('vit:hp')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('vit:hp') }}
    </p>

    <div class="vitals">
      <div v-for="v in tiles" :key="v.label" class="tile">
        <div class="tile__label">{{ v.label }}</div>
        <UiTooltip :title="`${v.label} ${v.value}`" :text="v.why">
          <div class="tile__value" :class="{ 'is-changed': v.changed }" tabindex="0">
            {{ v.value }}
          </div>
        </UiTooltip>
        <div class="hint" style="font-size: 11px">{{ v.sub }}</div>
      </div>
    </div>

    <Pf2eSheetConditions />

    <details class="vit-more">
      <summary>Typed damage &amp; healing</summary>
      <form class="hurt" @submit.prevent="typedHurt">
        <label class="sr-only" for="pf-amount">Damage or healing</label>
        <input
          id="pf-amount"
          v-model.number="amount"
          class="input hurt__n"
          type="number"
          inputmode="numeric"
          min="1"
          placeholder="HP"
          :disabled="!canEdit"
        />
        <label class="sr-only" for="pf-dmg-type">Damage type</label>
        <select
          id="pf-dmg-type"
          v-model="dmgType"
          class="input hurt__type"
          :disabled="!canEdit"
          title="Damage type, for your immunities, weaknesses and resistances"
        >
          <option value="">Untyped</option>
          <option v-for="t in PF2E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <button type="submit" class="btn btn--sm" :disabled="!canEdit || !amount">Damage</button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit || !amount || dead"
          :title="dead ? 'Your hero has died' : undefined"
          @click="typedHeal"
        >
          Heal
        </button>
        <label v-if="spellMatters" class="check" title="A resistance of yours is to spells">
          <input v-model="fromSpell" type="checkbox" :disabled="!canEdit" />
          From a spell
        </label>
        <template v-if="fromSpell && traditionMatters">
          <label class="sr-only" for="pf-dmg-tradition">The spell's tradition</label>
          <select id="pf-dmg-tradition" v-model="tradition" class="input hurt__type">
            <option value="">Tradition?</option>
            <option v-for="t in ['Arcane', 'Divine', 'Occult', 'Primal']" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </template>
      </form>
      <p class="hint">Crit and Shield Block beside Hit points apply here too.</p>
    </details>

    <details class="vit-more" :open="!!sheet.persistent?.length">
      <summary>
        Persistent damage &amp; resistances<template v-if="sheet.persistent?.length">
          · {{ sheet.persistent.length }} on</template
        >
      </summary>
      <Pf2eSheetDefenses />
    </details>

    <div class="rest">
      <span class="caps">Time passes</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('minute')"
      >
        1 minute
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('10min')"
      >
        10 minutes
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('hour')"
      >
        1 hour
      </button>
    </div>
    <button type="button" class="btn btn--ghost" :disabled="!canEdit" @click="restOpen = true">
      Rest for the night
    </button>
    <p v-if="resultIn('vit:rest')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('vit:rest') }}
    </p>

    <UiDialog v-model="restOpen" title="Rest for the night?" width="460px">
      <p>
        8 hours of rest: you regain {{ Math.max(1, sheet.attrs.CON) * level }} HP (Constitution
        modifier × level), doomed and drained drop by 1 and fatigue ends (Player Core p. 439). Then
        your daily preparations: spell slots, Focus Points and daily abilities come back.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="restOpen = false">Not yet</button>
        <button type="button" class="btn" @click="confirmRest">Rest</button>
      </template>
    </UiDialog>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/sheet-vitals';

.crit--block input {
  accent-color: var(--secondary);
}

.shield-chip {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--secondary);
    border-color: var(--secondary);
    color: var(--on-secondary);
  }
}

.shield-hp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 100%;

  .meter {
    width: 100%;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
    font-variant-numeric: tabular-nums;
  }
}

.wound.is-doomed {
  border-style: dashed;
  opacity: 0.55;
}

.tracks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.track {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.track__label {
  min-width: 64px;
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.track__pip {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &.on {
    background: var(--warn-text);
  }

  &--hero.on {
    background: var(--accent);
  }

  &:disabled {
    cursor: default;
  }
}

.vit-more {
  border-top: 1px solid var(--track);
  padding-top: 8px;

  > summary {
    min-height: 36px;
    display: flex;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--page-soft);
    cursor: pointer;
  }

  > .hint {
    margin: 6px 0 0;
  }
}

.hurt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.hurt__n {
  width: 96px;
}

.hurt__type {
  width: auto;
  min-width: 120px;
  text-transform: capitalize;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  min-height: 36px;

  input {
    accent-color: var(--accent);
  }
}

.rest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

@media (pointer: coarse) {
  .track__pip {
    width: 44px;
    height: 44px;
  }

  .vit-more > summary,
  .check {
    min-height: 44px;
  }
}
</style>
