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
  portrait,
  uploadingPortrait,
  onPortrait,
  hpPct,
  xpPct,
  xpLabel,
  adjustHp,
  lastRoll,
  sign,
} = useDnd5e(ref('eldritch'))

const tab = ref<'feat' | 'inv' | 'notes'>('feat')
const tabs = [
  { id: 'feat', label: 'Features & spells' },
  { id: 'inv', label: 'Possessions' },
  { id: 'notes', label: 'Notes' },
] as const

const quick = computed(() => [
  { k: 'AC', v: String(sheet.value.ac) },
  { k: 'Initiative', v: sign(sheet.value.initMod) },
  { k: 'Speed', v: sheet.value.speed.replace(/\s*ft\.?$/i, '') },
  { k: 'Prof.', v: sign(sheet.value.profBonus) },
])

const byline = computed(() =>
  [sheet.value.lineage, sheet.value.class, sheet.value.background, sheet.value.alignment]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <div class="sigil">
      <svg
        class="sigil__ring"
        viewBox="0 0 260 260"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <circle cx="130" cy="130" r="126" stroke-width="1" opacity="0.5" />
        <circle cx="130" cy="130" r="112" stroke-width="1" stroke-dasharray="2 8" />
        <path d="M130 8 236 191H24z" stroke-width="1" opacity="0.45" />
        <path d="M130 252 24 69h212z" stroke-width="1" opacity="0.45" />
      </svg>
      <div class="sigil__portrait">
        <img v-if="portrait" :src="portrait" :alt="`Portrait of ${draft.name}`" />
        <span v-else>Portrait</span>
      </div>
      <div class="sigil__level">
        <strong>{{ draft.level }}</strong>
        <span>lvl</span>
      </div>
    </div>
    <div class="identity__text">
      <div class="identity__kicker">D&amp;D 5e · {{ campaignName }}</div>
      <h1>{{ draft.name }}</h1>
      <div class="identity__byline">{{ byline || 'A name not yet spoken' }}</div>
    </div>
    <div class="identity__row">
      <label v-if="canEdit" class="pill pill--upload">
        <input type="file" accept="image/*" :disabled="uploadingPortrait" @change="onPortrait" />
        {{ uploadingPortrait ? 'Uploading…' : 'Upload portrait' }}
      </label>
      <div class="xp">
        <div class="xp__bar"><span :style="{ width: xpPct + '%' }" /></div>
        <div>{{ xpLabel }}</div>
      </div>
      <button v-if="canEdit" type="button" class="pill pill--primary" @click="$emit('levelUp')">
        Level up
      </button>
    </div>
  </section>

  <section class="abilities" aria-label="Abilities">
    <div v-for="s in stats" :key="s.k" class="ability" :class="{ 'is-prof': s.prof }">
      <div class="ability__k">{{ s.k }}</div>
      <div class="ability__mod">{{ s.mod }}</div>
      <div class="ability__score">{{ s.score }}{{ s.prof ? ' · save' : '' }}</div>
    </div>
  </section>

  <div class="two-col">
    <section class="e-panel" aria-labelledby="e-vit">
      <h2 id="e-vit">Life force</h2>
      <div class="life">
        <div class="life__ring" :style="{ '--deg': hpPct * 3.6 + 'deg' }">
          <div aria-live="polite">
            <strong>{{ sheet.hp }}</strong>
            <span>of {{ sheet.hpMax }} HP</span>
          </div>
        </div>
        <div class="life__side">
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="orb"
              aria-label="Take 1 damage"
              :disabled="!canEdit"
              @click="adjustHp(-1)"
            >
              −
            </button>
            <button
              type="button"
              class="orb"
              aria-label="Heal 1"
              :disabled="!canEdit"
              @click="adjustHp(1)"
            >
              +
            </button>
          </div>
          <div class="life__label">Death saves</div>
          <div class="life__pips">
            <button
              v-for="d in successes"
              :key="d.label"
              type="button"
              class="dot"
              :aria-label="d.label"
              :aria-pressed="d.pressed"
              :disabled="!canEdit"
              @click="d.set"
            />
            <span style="width: 10px" />
            <button
              v-for="d in failures"
              :key="d.label"
              type="button"
              class="dot dot--fail"
              :aria-label="d.label"
              :aria-pressed="d.pressed"
              :disabled="!canEdit"
              @click="d.set"
            />
          </div>
        </div>
      </div>
      <div class="quick">
        <div v-for="q in quick" :key="q.k">
          <strong>{{ q.v }}</strong>
          <span>{{ q.k }}</span>
        </div>
      </div>
    </section>

    <section class="e-panel" aria-labelledby="e-arms" style="gap: 14px">
      <h2 id="e-arms">Arms</h2>
      <div v-for="(w, i) in weapons" :key="i" class="weapon">
        <div class="weapon__text">
          <strong>{{ w.name }}</strong>
          <span>{{ w.atkLabel }} to hit{{ w.range ? ` · ${w.range}` : '' }}</span>
        </div>
        <button
          type="button"
          class="pill pill--roll"
          :aria-label="`Roll ${w.name}, ${w.dmg}`"
          @click="w.roll"
        >
          {{ w.dmg }}
        </button>
      </div>
      <p v-if="!weapons.length" class="e-empty">No arms yet. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="e-roll" role="status">{{ lastRoll }}</div>
    </section>
  </div>

  <section class="e-panel e-panel--flush" aria-label="Details">
    <div class="e-tabs" role="tablist" aria-label="Sheet sections">
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
    <div v-if="tab === 'feat'" class="feats">
      <div v-for="(f, i) in sheet.features" :key="i" class="feat">
        <strong>{{ f.name }}</strong>
        <p>{{ f.desc }}</p>
      </div>
      <p v-if="!sheet.features.length" class="e-empty">Nothing recorded yet.</p>
    </div>
    <div v-else-if="tab === 'inv'" class="e-body">
      <div v-for="(item, i) in sheet.inventory" :key="i" class="inv">
        <span>{{ item.name }}</span
        ><span>{{ item.qty }}</span>
      </div>
      <p v-if="!sheet.inventory.length" class="e-empty">No possessions.</p>
    </div>
    <div v-else class="e-body" style="gap: 8px">
      <label for="e-notes" class="life__label">Private notes</label>
      <textarea id="e-notes" v-model="sheet.notes" rows="6" class="e-notes" :readonly="!canEdit" />
    </div>
  </section>
</template>

<style scoped lang="scss">
$field: #120e1e;
$line: #2e2745;
$line-strong: #4a3f70;
$muted: #a69dc4;
$soft: #bdb4da;
$bright: #f3eeff;
$panel: rgba(22, 18, 34, 0.85);

.identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.sigil {
  position: relative;
  width: 260px;
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sigil__ring {
  position: absolute;
  inset: 0;
  color: var(--accent);
}

.sigil__portrait {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  box-shadow:
    0 0 40px color-mix(in srgb, var(--accent) 35%, transparent),
    inset 0 0 40px rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: $muted;
  font-size: 15px;
  background: radial-gradient(circle, #1e1830 0%, $field 100%);
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.sigil__level {
  position: absolute;
  bottom: 10px;
  right: 26px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #0a0812;
  border: 2px solid var(--accent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  strong {
    font-family: var(--font-heading);
    font-size: 24px;
    line-height: 1;
    color: var(--accent-text);
  }

  span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: $muted;
  }
}

.identity__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;

  h1 {
    font-family: var(--font-display);
    font-size: clamp(40px, 5.6vw, 68px);
    font-weight: 700;
    line-height: 1;
    color: $bright;
    text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 40%, transparent);
    overflow-wrap: anywhere;
  }
}

.identity__kicker {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.identity__byline {
  font-size: 19px;
  color: $soft;
}

.identity__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 14px;
}

.pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid $line-strong;
  background: transparent;
  color: var(--page-text);
  font:
    700 15px 'Alegreya Sans',
    sans-serif;
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  &--upload:focus-within {
    outline: 2px solid var(--accent-text);
    outline-offset: 3px;
  }

  &--primary {
    padding: 0 22px;
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 16px;
    letter-spacing: 0.04em;
    box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  &--roll {
    flex: none;
    padding: 0 16px;
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, #{$field});
    color: $bright;
    font-size: 16px;
  }
}

.xp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 220px;
  font-size: 13px;
  color: $muted;
}

.xp__bar {
  height: 6px;
  border-radius: 3px;
  background: #1e1830;
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
}

.abilities {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}

.ability {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 10px;
  border-radius: 20px;
  background: $panel;
  border: 1px solid $line;

  &.is-prof {
    border-color: var(--accent);
    box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 22%, transparent);
  }
}

.ability__k {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: $muted;
}

.ability__mod {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid $line-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: 30px;
  font-weight: 700;
}

.ability__score {
  font-size: 15px;
  color: $soft;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.e-panel {
  padding: 26px;
  border-radius: 22px;
  background: $panel;
  border: 1px solid $line;
  display: flex;
  flex-direction: column;
  gap: 18px;

  h2 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  &--flush {
    padding: 0;
    gap: 0;
    overflow: hidden;
  }
}

.life {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
}

.life__ring {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: conic-gradient(var(--accent) var(--deg), #1e1830 0);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 30px color-mix(in srgb, var(--accent) 30%, transparent);

  > div {
    width: 108px;
    height: 108px;
    border-radius: 50%;
    background: $field;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  strong {
    font-family: var(--font-heading);
    font-size: 38px;
    line-height: 1;
  }

  span {
    font-size: 14px;
    color: $muted;
  }
}

.life__side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.life__label {
  font-size: 14px;
  color: $muted;
}

.life__pips {
  display: flex;
  gap: 10px;
  align-items: center;
}

.orb {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid $line-strong;
  background: $field;
  color: var(--page-text);
  font-size: 24px;
}

.dot {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  border: 1px solid $line-strong;

  &[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }

  &--fail[aria-pressed='true'] {
    background: var(--secondary);
    border-color: var(--secondary);
    box-shadow: none;
  }
}

.quick {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 12px 6px;
    border-radius: 14px;
    background: $field;
    border: 1px solid $line;
  }

  strong {
    font-size: 22px;
  }

  span {
    font-size: 13px;
    color: $muted;
  }
}

.weapon {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: $field;
  border: 1px solid $line;
}

.weapon__text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    font-size: 18px;
  }

  span {
    font-size: 14px;
    color: $muted;
  }
}

.e-roll {
  padding: 12px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 16%, #{$field});
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  font-size: 16px;
  font-weight: 500;
}

.e-empty {
  color: $muted;
  padding: 8px 0;
}

.e-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 14px 18px;
  border-bottom: 1px solid $line;

  button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: $muted;
    font:
      700 16px 'Alegreya Sans',
      sans-serif;

    &[aria-selected='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.feats {
  padding: 18px 26px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 14px;
}

.feat {
  padding: 16px;
  border-radius: 16px;
  background: $field;
  border: 1px solid $line;
  display: flex;
  flex-direction: column;
  gap: 6px;

  strong {
    font-size: 17px;
    color: var(--accent-text);
  }

  p {
    font-size: 16px;
    line-height: 1.5;
    color: $soft;
  }
}

.e-body {
  padding: 10px 26px 24px;
  display: flex;
  flex-direction: column;
}

.inv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid $line;
  font-size: 17px;

  span:last-child {
    color: $muted;
  }
}

.e-notes {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid $line;
  background: $field;
  color: var(--page-text);
  font:
    400 17px/1.6 'Alegreya Sans',
    sans-serif;
  resize: vertical;
}
</style>
