<script setup lang="ts">
const {
  draft,
  sheet,
  stats,
  weapons,
  canEdit,
  campaignName,
  hpPct,
  xpPct,
  xpLabel,
  adjustHp,
  lastRoll,
} = useDnd5e(ref('classic'))

const tab = ref<'weapons' | 'inventory' | 'features' | 'notes'>('weapons')
const tabs = [
  { id: 'weapons', label: 'Weapons & attacks' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'features', label: 'Features & spells' },
  { id: 'notes', label: 'Notes' },
] as const

const fields = [
  { key: 'lineage', label: 'Race' },
  { key: 'class', label: 'Class' },
  { key: 'background', label: 'Background' },
  { key: 'alignment', label: 'Alignment' },
] as const

const combat = computed(() => [
  { label: 'Armor Class', value: String(sheet.value.ac) },
  { label: 'Initiative', value: sign(sheet.value.initMod) },
  { label: 'Speed', value: sheet.value.speed },
  { label: 'Proficiency', value: sign(sheet.value.profBonus) },
  { label: 'Passive Perc.', value: String(sheet.value.passivePerception) },
])

function sign(n: number) {
  return n >= 0 ? `+${n}` : `${n}`
}
</script>

<template>
  <section class="panel identity" aria-label="Identity">
    <SheetPortrait />
    <div class="identity__body">
      <div class="identity__top">
        <div class="stack" style="gap: 6px">
          <div class="row" style="gap: 10px">
            <span class="badge badge--dnd5e">D&amp;D 5e</span>
            <span class="small muted">{{ campaignName }}</span>
          </div>
          <h1>{{ draft.name }}</h1>
        </div>
        <div class="row" style="gap: 14px">
          <div class="level-ring">
            <strong>{{ draft.level }}</strong>
            <span>Level</span>
          </div>
          <div class="xp">
            <div>{{ xpLabel }}</div>
            <div class="meter meter--accent meter--thin">
              <span :style="{ width: xpPct + '%' }" />
            </div>
          </div>
        </div>
      </div>
      <div class="identity__fields">
        <div class="field">
          <label for="f-name">Character name</label>
          <input
            id="f-name"
            v-model="draft.name"
            class="input"
            maxlength="80"
            :readonly="!canEdit"
          />
        </div>
        <div v-for="f in fields" :key="f.key" class="field">
          <label :for="`f-${f.key}`">{{ f.label }}</label>
          <input :id="`f-${f.key}`" v-model="sheet[f.key]" class="input" :readonly="!canEdit" />
        </div>
      </div>
    </div>
  </section>

  <div class="two-col">
    <section class="panel stack" aria-labelledby="ab-h">
      <div class="panel-title" style="margin: 0">
        <h2 id="ab-h">Ability scores</h2>
        <span class="small muted">Modifier · score</span>
      </div>
      <div class="stats">
        <div v-for="s in stats" :key="s.k" class="stat">
          <div class="caps">{{ s.k }}</div>
          <div class="stat__big">{{ s.mod }}</div>
          <div class="stat__small">{{ s.score }}</div>
        </div>
      </div>
    </section>

    <section class="panel stack" aria-labelledby="cb-h">
      <h2 id="cb-h">Combat</h2>
      <div class="tile" style="gap: 10px; padding: 16px">
        <div class="hp">
          <div class="row" style="gap: 10px">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--secondary)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
            </svg>
            <div class="caps">Hit points</div>
          </div>
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
      </div>
      <div class="combat">
        <div v-for="c in combat" :key="c.label" class="tile">
          <div class="tile__label">{{ c.label }}</div>
          <div class="tile__value">{{ c.value }}</div>
        </div>
      </div>
    </section>
  </div>

  <section class="panel panel--flush" aria-label="Details">
    <div class="tabs sheet-tabs" role="tablist" aria-label="Sheet sections">
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

    <div v-if="tab === 'weapons'" class="tab-body">
      <div v-if="weapons.length" class="table-wrap">
        <table class="table" style="min-width: 640px">
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              <th scope="col">To hit</th>
              <th scope="col">Damage</th>
              <th scope="col">Type</th>
              <th scope="col">Range / traits</th>
              <th scope="col" style="text-align: right">Roll</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(w, i) in weapons" :key="i">
              <td>
                <strong>{{ w.name }}</strong>
              </td>
              <td>{{ w.atkLabel }}</td>
              <td>
                <span class="dmg">{{ w.dmg }}</span>
              </td>
              <td class="muted">{{ w.type }}</td>
              <td class="muted">{{ w.range }}</td>
              <td style="text-align: right">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  :aria-label="`Roll ${w.name}`"
                  @click="w.roll"
                >
                  Roll
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty">No weapons yet. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
    </div>

    <div v-else-if="tab === 'inventory'" class="tab-body tab-body--list">
      <div v-for="(item, i) in sheet.inventory" :key="i" class="list-row">
        <span>{{ item.name }}</span>
        <span class="muted">{{ item.qty }}</span>
      </div>
      <p v-if="!sheet.inventory.length" class="empty">Your pack is empty.</p>
    </div>

    <div v-else-if="tab === 'features'" class="tab-body tab-body--list">
      <div v-for="(ft, i) in sheet.features" :key="i" class="feature">
        <strong>{{ ft.name }}</strong>
        <span>{{ ft.desc }}</span>
      </div>
      <p v-if="!sheet.features.length" class="empty">No features or spells recorded yet.</p>
    </div>

    <div v-else class="tab-body">
      <div class="field">
        <label for="notes">Session notes</label>
        <textarea id="notes" v-model="sheet.notes" class="input" rows="8" :readonly="!canEdit" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.identity {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
}

.identity__body {
  flex: 999 1 380px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;

  h1 {
    font-size: clamp(28px, 3.4vw, 40px);
  }
}

.identity__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.identity__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
  gap: 14px;

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
  border: 2px solid var(--accent);
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
  width: 150px;
  font-size: 12px;
  color: var(--page-soft);
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 24px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);
}

.stat__big {
  font-family: var(--font-heading);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}

.stat__small {
  font-size: 12px;
  color: var(--page-soft);
}

.hp {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.hp__value {
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 700;
  min-width: 96px;
  text-align: center;

  span {
    font-size: 18px;
    color: var(--page-muted);
  }
}

.combat {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.sheet-tabs {
  padding: 8px 12px 0;
  flex-wrap: nowrap;
  overflow-x: auto;

  button {
    white-space: nowrap;
    min-height: 48px;
    font-size: 14px;
    font-weight: 600;
  }
}

.tab-body {
  padding: 20px 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  &--list {
    padding-top: 12px;
    gap: 0;
  }
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 0;
  border-bottom: 1px solid var(--track);

  span {
    font-size: 14px;
    color: var(--page-soft);
  }
}
</style>
