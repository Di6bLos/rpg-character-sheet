<script setup lang="ts">
defineEmits<{ levelUp: [] }>()

const {
  draft,
  sheet,
  stats,
  weapons,
  successes,
  failures,
  canEdit,
  campaignName,
  hpPct,
  adjustHp,
  lastRoll,
  sign,
} = useDnd5e(ref('cursed'))

const inCampaign = computed(() => campaignName.value !== 'Not in a campaign')

const tab = ref<'feat' | 'inv' | 'notes'>('feat')
const tabs = [
  { id: 'feat', label: 'Gifts & spells' },
  { id: 'inv', label: 'Possessions' },
  { id: 'notes', label: 'Notes' },
] as const

const quick = computed(() => [
  { k: 'Armour', v: String(sheet.value.ac) },
  { k: 'Initiative', v: sign(sheet.value.initMod) },
  { k: 'Speed', v: sheet.value.speed },
  { k: 'Proficiency', v: sign(sheet.value.profBonus) },
])

const byline = computed(() => {
  const who = [sheet.value.lineage, sheet.value.class].filter(Boolean).join(' ')
  const parts = [who, sheet.value.background].filter(Boolean)
  if (sheet.value.alignment) parts.push(`of ${sheet.value.alignment} temper`)
  return parts.join(', ')
})
</script>

<template>
  <div class="cursed">
    <aside class="leaf leaf--side" aria-label="Portrait and vitals">
      <SheetPortrait placeholder="Likeness" upload-label="Upload a likeness" class="c-portrait">
        <template #overlay>
          <div class="wax">
            <strong>{{ draft.level }}</strong>
            <span>level</span>
          </div>
        </template>
      </SheetPortrait>

      <div class="block">
        <div class="hp-head">
          <h2>Hit points</h2>
          <span class="hp-value" aria-live="polite"
            >{{ sheet.hp }}<small> / {{ sheet.hpMax }}</small></span
          >
        </div>
        <div class="hp-bar"><span :style="{ width: hpPct + '%' }" /></div>
        <div class="hp-btns">
          <button type="button" class="ink-btn" :disabled="!canEdit" @click="adjustHp(-1)">
            Wound
          </button>
          <button type="button" class="ink-btn" :disabled="!canEdit" @click="adjustHp(1)">
            Mend
          </button>
        </div>
      </div>

      <div class="quick">
        <div v-for="q in quick" :key="q.k">
          <strong>{{ q.v }}</strong>
          <span>{{ q.k }}</span>
        </div>
      </div>

      <div class="block" style="gap: 8px">
        <div class="death-title">Against death</div>
        <div class="death-row">
          <span>Spared</span>
          <button
            v-for="d in successes"
            :key="d.label"
            type="button"
            class="ink-dot"
            :aria-label="d.label"
            :aria-pressed="d.pressed"
            :disabled="!canEdit"
            @click="d.set"
          />
        </div>
        <div class="death-row">
          <span>Taken</span>
          <button
            v-for="d in failures"
            :key="d.label"
            type="button"
            class="ink-dot ink-dot--fail"
            :aria-label="d.label"
            :aria-pressed="d.pressed"
            :disabled="!canEdit"
            @click="d.set"
          />
        </div>
      </div>
    </aside>

    <section class="leaf leaf--main" aria-label="Character record">
      <div class="head">
        <div class="head__text">
          <div class="head__kicker">
            D&amp;D 5e ·
            {{
              inCampaign
                ? `being a record kept in ${campaignName}`
                : 'being a record kept by its bearer'
            }}
          </div>
          <h1>{{ draft.name }}</h1>
          <div class="head__byline">{{ byline || 'Of whom little is yet written' }}</div>
        </div>
        <button v-if="canEdit" type="button" class="level-btn" @click="$emit('levelUp')">
          Level up
        </button>
      </div>

      <div class="stats">
        <div v-for="s in stats" :key="s.k">
          <span class="stats__name">{{ s.name }}</span>
          <span class="stats__mod">{{ s.mod }}</span>
          <span class="stats__score">{{ s.score }}{{ s.prof ? ' · save' : '' }}</span>
        </div>
      </div>

      <div class="block" style="gap: 6px">
        <h2 class="arms-title">Arms</h2>
        <div v-for="(w, i) in weapons" :key="i" class="weapon">
          <span class="weapon__name">
            {{ w.name }} <em v-if="w.range">— {{ w.range }}</em>
          </span>
          <span class="weapon__atk">{{ w.atkLabel }}</span>
          <span class="weapon__dmg">{{ w.dmg }}</span>
          <button
            type="button"
            class="ink-btn ink-btn--sm"
            :aria-label="`Cast the die for ${w.name}`"
            @click="w.roll"
          >
            Cast the die
          </button>
        </div>
        <p v-if="!weapons.length" class="c-empty">
          No arms are recorded. Use “Edit sheet” to add one.
        </p>
        <div v-if="lastRoll" class="c-roll" role="status">{{ lastRoll }}</div>
      </div>

      <div class="block" style="gap: 10px">
        <div class="c-tabs" role="tablist" aria-label="Record sections">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>
        <div v-if="tab === 'feat'">
          <p v-for="(f, i) in sheet.features" :key="i" class="gift">
            <span>{{ f.name }}.</span> {{ f.desc }}
          </p>
          <p v-if="!sheet.features.length" class="c-empty">Nothing is yet set down.</p>
        </div>
        <div v-else-if="tab === 'inv'" class="inv">
          <div v-for="(item, i) in sheet.inventory" :key="i">
            <span>{{ item.name }}</span
            ><span>{{ item.qty }}</span>
          </div>
          <p v-if="!sheet.inventory.length" class="c-empty">No possessions.</p>
        </div>
        <div v-else class="block" style="gap: 6px">
          <label for="c-notes" class="notes-label">Private notes</label>
          <textarea
            id="c-notes"
            v-model="sheet.notes"
            rows="6"
            class="c-notes"
            :readonly="!canEdit"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
$ink: #1e1209;
$ink-soft: #2b1a0e;
$brown: #5c4330;
$brown-soft: #4a3322;
$vellum: #dcc9a3;
$vellum-dark: #cdb78e;

.cursed {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  align-items: flex-start;
  font-family: var(--font-body);
}

.leaf {
  display: flex;
  flex-direction: column;
  color: $ink-soft;

  h1,
  h2 {
    font-family: var(--font-display);
    font-weight: 400;
  }

  &--side {
    flex: 1 1 300px;
    gap: 22px;
    padding: 28px 24px;
    transform: rotate(-0.6deg);
    background:
      radial-gradient(circle at 20% 12%, rgba(120, 70, 20, 0.2), transparent 40%),
      radial-gradient(circle at 80% 88%, rgba(90, 45, 12, 0.28), transparent 45%), $vellum;
    box-shadow:
      inset 0 0 50px rgba(70, 35, 10, 0.6),
      inset 0 0 6px rgba(40, 20, 5, 0.9),
      0 14px 40px rgba(0, 0, 0, 0.75);
    clip-path: polygon(
      0 2%,
      6% 0,
      40% 1.2%,
      72% 0,
      100% 1.5%,
      99% 30%,
      100% 62%,
      98.5% 100%,
      60% 98.8%,
      24% 100%,
      1% 98.6%,
      0 70%,
      1.2% 36%
    );
  }

  &--main {
    flex: 999 1 560px;
    min-width: 0;
    gap: 26px;
    padding: 36px clamp(20px, 3vw, 44px);
    transform: rotate(0.3deg);
    background:
      radial-gradient(circle at 85% 8%, rgba(120, 70, 20, 0.22), transparent 35%),
      radial-gradient(circle at 10% 90%, rgba(90, 45, 12, 0.3), transparent 40%),
      radial-gradient(circle at 60% 50%, rgba(255, 240, 210, 0.25), transparent 60%), $vellum;
    box-shadow:
      inset 0 0 70px rgba(70, 35, 10, 0.6),
      inset 0 0 8px rgba(40, 20, 5, 0.9),
      0 14px 40px rgba(0, 0, 0, 0.75);
    clip-path: polygon(
      0 1%,
      18% 0,
      55% 0.8%,
      85% 0,
      100% 1%,
      99.3% 40%,
      100% 75%,
      99% 100%,
      70% 99.3%,
      30% 100%,
      0.5% 99.2%,
      0 60%,
      0.7% 25%
    );
  }
}

@media (prefers-reduced-motion: reduce), (max-width: 640px) {
  .leaf--side,
  .leaf--main {
    transform: none;
  }
}

.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.c-portrait {
  align-self: center;
  gap: 32px;
  --portrait-w: 210px;
  --portrait-h: 250px;
  --portrait-radius: 0;

  :deep(.portrait__frame) {
    border: 2px solid $ink-soft;
    box-shadow: 4px 4px 0 rgba(43, 26, 14, 0.35);
    background:
      repeating-linear-gradient(0deg, rgba(43, 26, 14, 0.06) 0 2px, transparent 2px 6px),
      $vellum-dark;
  }

  :deep(.portrait__empty) {
    color: $brown;
    font-size: 16px;
    font-style: italic;
  }

  :deep(.portrait__upload) {
    border: 1.5px dashed $brown;
    color: $ink-soft;
    font-size: 18px;
    font-weight: 400;
  }
}

.wax {
  position: absolute;
  bottom: -22px;
  right: -22px;
  width: 82px;
  height: 82px;
  border-radius: 47% 53% 50% 50% / 52% 46% 54% 48%;
  background: radial-gradient(
    circle at 38% 32%,
    color-mix(in srgb, var(--accent) 75%, #fff 25%) 0%,
    var(--accent) 40%,
    color-mix(in srgb, var(--accent) 55%, #000 45%) 100%
  );
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.45),
    inset 0 0 0 5px color-mix(in srgb, var(--accent) 70%, #000 30%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--on-accent);

  strong {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 34px;
    line-height: 0.9;
  }

  span {
    font-size: 12px;
    letter-spacing: 0.1em;
  }
}

.hp-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;

  h2 {
    font-size: 24px;
  }
}

.hp-value {
  font-family: var(--font-display);
  font-size: 34px;

  small {
    font-size: 20px;
    color: $brown;
  }
}

.hp-bar {
  height: 10px;
  border: 1.5px solid $ink-soft;
  background: $vellum-dark;

  span {
    display: block;
    height: 100%;
    background: var(--accent-ink);
    transition: width 0.2s ease;
  }
}

.hp-btns {
  display: flex;
  gap: 8px;

  button {
    flex: 1;
  }
}

.ink-btn {
  min-height: 44px;
  padding: 0 16px;
  border: 1.5px solid $ink-soft;
  background: transparent;
  color: $ink-soft;
  font-family: var(--font-body);
  font-size: 18px;

  &:hover:not(:disabled) {
    background: rgba(43, 26, 14, 0.08);
  }

  &--sm {
    border-color: $ink;
    color: $ink;
  }
}

.quick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1.5px solid $ink-soft;
  border-left: 1.5px solid $ink-soft;

  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 6px;
    border-right: 1.5px solid $ink-soft;
    border-bottom: 1.5px solid $ink-soft;
  }

  strong {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 28px;
    line-height: 1.1;
  }

  span {
    font-size: 15px;
    color: $brown;
  }
}

.death-title {
  font-size: 18px;
}

.death-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  span {
    font-size: 14px;
    color: $brown;
    width: 64px;
  }
}

.ink-dot {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid $ink-soft;
  background: transparent;

  &[aria-pressed='true'] {
    background: var(--accent-ink);
  }

  &--fail[aria-pressed='true'] {
    background: $ink;
  }
}

.head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;

  h1 {
    font-size: clamp(44px, 5.6vw, 72px);
    line-height: 0.95;
    color: $ink;
    overflow-wrap: anywhere;
  }
}

.head__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.head__kicker {
  font-size: 17px;
  color: $brown;
}

.head__byline {
  font-style: italic;
  font-size: 21px;
  color: $brown-soft;
}

.level-btn {
  min-height: 48px;
  padding: 0 22px;
  border: 2px solid $ink;
  background: $ink;
  color: #ebd9b4;
  font-family: var(--font-display);
  font-size: 20px;
  box-shadow: 3px 3px 0 var(--accent);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  border-top: 2px solid $ink;
  border-bottom: 2px solid $ink;

  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 16px 6px;
    border-right: 1px solid rgba(30, 18, 9, 0.35);
  }
}

.stats__name {
  font-family: var(--font-heading);
  font-size: 18px;
  color: $brown-soft;
}

.stats__mod {
  font-family: var(--font-display);
  font-size: 44px;
  line-height: 1;
}

.stats__score {
  font-size: 15px;
  color: $brown;
}

.arms-title {
  font-size: 28px;
  margin-bottom: 6px;
}

.weapon {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px dashed rgba(30, 18, 9, 0.5);
}

.weapon__name {
  flex: 1 1 200px;
  font-family: var(--font-display);
  font-size: 23px;

  em {
    font-family: var(--font-body);
    font-size: 16px;
    color: $brown;
  }
}

.weapon__atk {
  font-size: 18px;
  font-weight: 600;
  min-width: 64px;
}

.weapon__dmg {
  font-size: 18px;
  font-weight: 700;
  min-width: 80px;
  color: var(--accent-ink);
}

.c-roll {
  margin-top: 10px;
  font-style: italic;
  font-size: 21px;
  color: $ink;
}

.c-empty {
  padding: 10px 0;
  font-style: italic;
  font-size: 18px;
  color: $brown;
}

.c-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 2px solid $ink;

  button {
    min-height: 46px;
    padding: 0 18px;
    border: 0;
    background: transparent;
    color: $brown-soft;
    font-family: var(--font-heading);
    font-size: 20px;

    &[aria-selected='true'] {
      background: $ink;
      color: #ebd9b4;
    }
  }
}

.gift {
  padding: 10px 0;
  font-size: 18px;
  line-height: 1.55;

  span {
    font-family: var(--font-display);
    font-size: 21px;
    color: $ink;
  }
}

.inv {
  columns: 2 220px;
  column-gap: 32px;

  > div {
    break-inside: avoid;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed rgba(30, 18, 9, 0.45);
    font-size: 18px;

    span:last-child {
      color: $brown;
    }
  }
}

.notes-label {
  font-size: 17px;
  color: $brown-soft;
}

.c-notes {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid $brown;
  background: rgba(255, 245, 220, 0.35);
  color: $ink;
  font:
    italic 400 20px/1.6 'IM Fell English',
    Georgia,
    serif;
  resize: vertical;
}

:focus-visible {
  outline-color: $ink;
}
</style>
