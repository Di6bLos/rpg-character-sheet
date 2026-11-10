<script setup lang="ts">
defineEmits<{ levelUp: [] }>()

const {
  draft,
  sheet,
  stats,
  weapons,
  successes,
  failures,
  byline,
  canEdit,
  campaignName,
  hpPct,
  xpPct,
  adjustHp,
  lastRoll,
  sign,
} = useDnd5e(ref('gothic'))

const tab = ref<'arms' | 'feat' | 'inv' | 'notes'>('arms')
const tabs = [
  { id: 'arms', label: 'Arms' },
  { id: 'feat', label: 'Features & spells' },
  { id: 'inv', label: 'Possessions' },
  { id: 'notes', label: 'Notes' },
] as const

const quick = computed(() => [
  { k: 'AC', v: String(sheet.value.ac) },
  { k: 'Init', v: sign(sheet.value.initMod) },
  { k: 'Speed', v: sheet.value.speed.replace(/\s*ft\.?$/i, '') },
  { k: 'Prof', v: sign(sheet.value.profBonus) },
])
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="g-portrait" />
    <div class="identity__body">
      <div class="identity__kicker">
        <span class="accent">D&amp;D 5e</span><span aria-hidden="true">✦</span
        ><span>{{ campaignName }}</span>
      </div>
      <h1>{{ draft.name }}</h1>
      <div class="identity__byline">{{ byline || 'An unwritten soul' }}</div>
      <div class="identity__row">
        <div class="seal">
          <strong>{{ draft.level }}</strong>
          <span>Level</span>
        </div>
        <div class="xp">
          <div>
            {{ sheet.xp.toLocaleString() }} / {{ sheet.xpNext.toLocaleString() }} experience
          </div>
          <div class="bar bar--thin"><span :style="{ width: xpPct + '%' }" /></div>
        </div>
        <button v-if="canEdit" type="button" class="level-btn" @click="$emit('levelUp')">
          Level up
        </button>
      </div>
    </div>
  </section>

  <div class="two-col">
    <section class="g-panel" aria-labelledby="g-ab">
      <h2 id="g-ab" class="g-title">Abilities<span aria-hidden="true" /></h2>
      <div class="stats">
        <div v-for="s in stats" :key="s.k" class="stat">
          <div class="stat__k">{{ s.k }}</div>
          <div class="stat__mod">{{ s.mod }}</div>
          <div class="stat__score">{{ s.score }}</div>
          <div v-if="s.prof" class="diamond stat__prof" title="Proficient save" />
        </div>
      </div>
      <div class="legend"><span class="diamond" />Proficient saving throw</div>
    </section>

    <section class="g-panel" aria-labelledby="g-vit">
      <h2 id="g-vit" class="g-title">Vitality<span aria-hidden="true" /></h2>
      <div class="vit">
        <div class="vit__hp" aria-live="polite">
          <strong>{{ sheet.hp }}</strong>
          <span>/ {{ sheet.hpMax }}</span>
        </div>
        <div class="row" style="gap: 8px">
          <button
            type="button"
            class="sq"
            aria-label="Take 1 damage"
            :disabled="!canEdit"
            @click="adjustHp(-1)"
          >
            −
          </button>
          <button
            type="button"
            class="sq"
            aria-label="Heal 1"
            :disabled="!canEdit"
            @click="adjustHp(1)"
          >
            +
          </button>
        </div>
      </div>
      <div class="bar bar--hp"><span :style="{ width: hpPct + '%' }" /></div>
      <div class="quick">
        <div v-for="q in quick" :key="q.k">
          <strong>{{ q.v }}</strong>
          <span>{{ q.k }}</span>
        </div>
      </div>
      <div class="death">
        <div>
          <div class="death__label">Death saves · successes</div>
          <div class="death__pips">
            <button
              v-for="d in successes"
              :key="d.label"
              type="button"
              class="diamond-btn"
              :aria-label="d.label"
              :aria-pressed="d.pressed"
              :disabled="!canEdit"
              @click="d.set"
            />
          </div>
        </div>
        <div>
          <div class="death__label">Failures</div>
          <div class="death__pips">
            <button
              v-for="d in failures"
              :key="d.label"
              type="button"
              class="diamond-btn"
              :aria-label="d.label"
              :aria-pressed="d.pressed"
              :disabled="!canEdit"
              @click="d.set"
            />
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="g-panel g-panel--flush" aria-label="Details">
    <div class="g-tabs" role="tablist" aria-label="Sheet sections">
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

    <div v-if="tab === 'arms'" class="g-body">
      <div v-for="(w, i) in weapons" :key="i" class="weapon">
        <div class="weapon__name">
          <strong>{{ w.name }}</strong>
          <em>{{ w.range }}</em>
        </div>
        <div class="weapon__num">
          <strong>{{ w.atkLabel }}</strong>
          <span>to hit</span>
        </div>
        <div class="weapon__num weapon__num--dmg">
          <strong>{{ w.dmg }}</strong>
          <span>{{ w.type || 'damage' }}</span>
        </div>
        <button type="button" class="g-btn" :aria-label="`Roll ${w.name}`" @click="w.roll">
          Roll
        </button>
      </div>
      <p v-if="!weapons.length" class="g-empty">No arms borne. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="g-roll" role="status">{{ lastRoll }}</div>
    </div>

    <div v-else-if="tab === 'feat'" class="g-body">
      <div v-for="(f, i) in sheet.features" :key="i" class="feat">
        <strong>{{ f.name }}</strong>
        <p>{{ f.desc }}</p>
      </div>
      <p v-if="!sheet.features.length" class="g-empty">Nothing recorded.</p>
    </div>

    <div v-else-if="tab === 'inv'" class="g-body">
      <div v-for="(item, i) in sheet.inventory" :key="i" class="inv">
        <span>{{ item.name }}</span
        ><span>{{ item.qty }}</span>
      </div>
      <p v-if="!sheet.inventory.length" class="g-empty">No possessions.</p>
    </div>

    <div v-else class="g-body" style="gap: 8px">
      <label for="g-notes" class="death__label">Private notes</label>
      <textarea id="g-notes" v-model="sheet.notes" rows="7" class="g-notes" :readonly="!canEdit" />
    </div>
  </section>
</template>

<style scoped lang="scss">
$ink: #0e0c0c;
$line: #3b3532;
$line-strong: #5a4f49;
$muted: #a79d92;
$soft: #c9bfb2;
$bright: #f2ebdd;

.identity {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  align-items: center;
  padding: 32px;
  background: linear-gradient(180deg, #181414 0%, #110f0f 100%);
  border: 1px solid $line;
  box-shadow:
    inset 0 0 0 5px #110f0f,
    inset 0 0 0 6px #2a2422,
    0 20px 50px rgba(0, 0, 0, 0.5);
}

.g-portrait {
  flex: 0 0 200px;
  gap: 12px;
  --portrait-w: 200px;
  --portrait-h: 250px;
  --portrait-radius: 100px 100px 4px 4px;

  :deep(.portrait__frame) {
    border-color: $line-strong;
    box-shadow:
      inset 0 0 0 6px #110f0f,
      inset 0 0 0 7px $line,
      inset 0 0 60px rgba(0, 0, 0, 0.8);
    background: repeating-linear-gradient(135deg, #191515 0 10px, #151212 10px 20px);
    overflow: hidden;
  }

  :deep(.portrait__empty) {
    font-size: 15px;
  }

  :deep(.portrait__upload) {
    border-color: $line-strong;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

.identity__body {
  flex: 999 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(44px, 6vw, 76px);
    line-height: 0.95;
    color: $bright;
    text-shadow: 0 2px 0 #000;
    overflow-wrap: anywhere;
  }
}

.identity__kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $muted;

  .accent {
    color: var(--accent-text);
  }
}

.identity__byline {
  font-size: 20px;
  font-style: italic;
  color: $soft;
}

.identity__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
  padding-top: 6px;
}

.seal {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(
    circle at 35% 30%,
    color-mix(in srgb, var(--accent) 85%, #fff 15%) 0%,
    var(--accent) 45%,
    color-mix(in srgb, var(--accent) 60%, #000 40%) 100%
  );
  color: var(--on-accent);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.6),
    inset 0 0 0 3px color-mix(in srgb, var(--accent) 70%, #000 30%);

  strong {
    font-family: var(--font-heading);
    font-size: 36px;
    line-height: 0.9;
  }

  span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
}

.xp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 200px;
  max-width: 280px;
  font-size: 15px;
  color: $soft;
}

.bar {
  height: 10px;
  background: #241f1e;
  border: 1px solid $line;

  span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease;
  }

  &--thin {
    height: 6px;
  }

  &--hp span {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 55%, #000 45%),
      var(--accent)
    );
  }
}

.level-btn {
  min-height: 48px;
  padding: 0 24px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow:
    0 0 0 3px #110f0f,
    0 0 0 4px color-mix(in srgb, var(--accent) 60%, transparent);
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
  gap: 28px;
  align-items: start;
}

.g-panel {
  padding: 26px;
  background: #131111;
  border: 1px solid $line;
  box-shadow:
    inset 0 0 0 4px #131111,
    inset 0 0 0 5px #241f1e;
  display: flex;
  flex-direction: column;
  gap: 18px;

  &--flush {
    padding: 0;
    gap: 0;
  }
}

.g-title {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.06em;

  span {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, $line-strong, transparent);
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 16px 8px 14px;
  background: $ink;
  border: 1px solid $line;
  clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%, 0 12px);
}

.stat__k {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: $muted;
}

.stat__mod {
  font-family: var(--font-heading);
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
}

.stat__score {
  font-size: 15px;
  color: $muted;
}

.diamond {
  display: inline-block;
  width: 8px;
  height: 8px;
  transform: rotate(45deg);
  background: var(--accent);
}

.stat__prof {
  position: absolute;
  top: 8px;
  right: 10px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: $muted;
}

.vit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.vit__hp {
  display: flex;
  align-items: baseline;
  gap: 8px;

  strong {
    font-family: var(--font-heading);
    font-size: 64px;
    line-height: 0.9;
    color: $bright;
  }

  span {
    font-size: 26px;
    color: $muted;
  }
}

.sq {
  width: 48px;
  height: 48px;
  border: 1px solid $line-strong;
  background: $ink;
  color: var(--page-text);
  font-size: 24px;
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
    border: 1px solid $line;
    background: $ink;
  }

  strong {
    font-family: var(--font-heading);
    font-size: 26px;
  }

  span {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $muted;
  }
}

.death {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding-top: 4px;
}

.death__label {
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: $muted;
  margin-bottom: 8px;
}

.death__pips {
  display: flex;
  gap: 16px;
  padding: 7px;
}

.diamond-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  transform: rotate(45deg);
  background: transparent;
  border: 1px solid $line-strong;

  &[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
  }
}

.g-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  padding: 10px 16px 0;
  border-bottom: 1px solid $line;

  button {
    min-height: 52px;
    padding: 0 22px;
    border: 0;
    background: transparent;
    font-family: var(--font-heading);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: $muted;

    &[aria-selected='true'] {
      color: $bright;
      box-shadow: inset 0 -2px 0 var(--accent);
    }
  }
}

.g-body {
  padding: 16px 26px 26px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.weapon {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid #241f1e;
}

.weapon__name {
  flex: 1 1 200px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    font-family: var(--font-heading);
    font-size: 22px;
  }

  em {
    font-size: 15px;
    color: $muted;
  }
}

.weapon__num {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;

  strong {
    font-family: var(--font-heading);
    font-size: 24px;
  }

  span {
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: $muted;
  }

  &--dmg {
    min-width: 90px;

    strong {
      color: var(--accent-text);
    }
  }
}

.g-btn {
  min-height: 44px;
  padding: 0 20px;
  border: 1px solid $line-strong;
  background: $ink;
  color: var(--page-text);
  font-family: var(--font-heading);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.g-roll {
  margin-top: 14px;
  align-self: flex-start;
  padding: 12px 18px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, #{$ink});
  font-size: 18px;
  font-style: italic;
}

.g-empty {
  padding: 18px 0;
  font-style: italic;
  color: $muted;
  font-size: 17px;
}

.feat {
  padding: 14px 0;
  border-bottom: 1px solid #241f1e;

  strong {
    font-family: var(--font-heading);
    font-size: 21px;
  }

  p {
    font-size: 17px;
    line-height: 1.5;
    color: $soft;
  }
}

.inv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #241f1e;
  font-size: 18px;

  span:last-child {
    color: $muted;
  }
}

.g-notes {
  width: 100%;
  padding: 14px;
  border: 1px solid $line;
  background: $ink;
  color: var(--page-text);
  font:
    400 18px/1.6 'Crimson Pro',
    Georgia,
    serif;
  resize: vertical;
}
</style>
