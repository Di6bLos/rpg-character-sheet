<script setup lang="ts">
// Nimble sheet: identity, then the play panels (components/nimble/Sheet*.vue).
import { ancestryBySlug } from '~/data/nimble/ancestries'
import { classBySlug } from '~/data/nimble/classes'
import { MAX_SKILL_BONUS } from '~/data/nimble/core'
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { knownSpells, knownUtilitySpells } from '~/utils/nimbleBuild'

const { draft, campaignName } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']

const cls = computed(() => classBySlug(sheet.value.classSlug))

const hasSpells = computed(
  () => knownSpells(sheet.value).length > 0 || knownUtilitySpells(sheet.value).length > 0,
)

const stats = computed(() =>
  STATS.map((k) => {
    const mode = sheet.value.saveAdv === k ? 'adv' : sheet.value.saveDis === k ? 'dis' : ''
    return {
      k,
      v: sign(sheet.value.stats[k]),
      mode,
      key: cls.value?.keyStats.includes(k) ?? false,
      save: mode === 'adv' ? 'Save · advantage' : mode === 'dis' ? 'Save · disadvantage' : 'Save',
    }
  }),
)

const identityBits = computed(() =>
  [sheet.value.lineage, sheet.value.class, sheet.value.subclass, sheet.value.background].filter(
    Boolean,
  ),
)

const details = computed(() =>
  [
    { label: 'Size', value: ancestryBySlug(sheet.value.ancestrySlug)?.size ?? '' },
    { label: 'Height & weight', value: sheet.value.heightWeight },
    { label: 'Languages', value: sheet.value.languages },
  ].filter((d) => d.value.trim() !== ''),
)

const skills = computed(() =>
  sheet.value.skills.map((s) => ({
    ...s,
    v: sign(Math.min(MAX_SKILL_BONUS, sheet.value.stats[s.stat] + s.points)),
  })),
)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="nb-portrait">
      <template v-if="cls" #empty>
        <NimbleSigil :slug="cls.slug" :size="140" class="nb-sigil" />
      </template>
    </SheetPortrait>
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
        <div v-if="details.length" class="identity__details">
          <span v-for="d in details" :key="d.label"
            >{{ d.label }} <strong>{{ d.value }}</strong></span
          >
        </div>
      </div>
      <div class="stats">
        <div
          v-for="s in stats"
          :key="s.k"
          class="stat"
          :class="[s.mode && `stat--${s.mode}`, { 'stat--key': s.key }]"
        >
          <div class="stat__k">
            {{ s.k }}<template v-if="s.key"> · <abbr title="Key Stat">KEY</abbr></template>
          </div>
          <div class="stat__v">{{ s.v }}</div>
          <div class="stat__save">{{ s.save }}</div>
        </div>
      </div>
    </div>
  </section>

  <div class="cols cols--vitals">
    <NimbleSheetVitals />
    <div class="stack" style="gap: 24px; min-width: 0">
      <NimbleSheetTurn />
      <NimbleSheetResources />
    </div>
  </div>

  <div class="cols cols--play">
    <NimbleSheetActions />
    <div class="stack" style="gap: 24px; min-width: 0">
      <NimbleSheetSpells v-if="hasSpells" />
      <NimbleSheetConditions />
    </div>
  </div>

  <div class="cols cols--lists">
    <section class="panel stack" style="gap: 6px" aria-labelledby="sk-h">
      <div class="title-help" style="margin: 0 0 6px">
        <h2 id="sk-h">Skills</h2>
        <UiHelp
          label="About skills"
          :text="`A skill’s bonus is its stat plus the skill points you put in it, up to +${MAX_SKILL_BONUS}.`"
        />
      </div>
      <div v-for="s in skills" :key="s.name" class="skill">
        <span class="grow"
          >{{ s.name }} <small>{{ s.stat }}</small></span
        >
        <span class="skill__pts" :aria-label="`${s.points} skill points`">
          <i v-for="p in Math.max(0, s.points)" :key="p" />
        </span>
        <strong>{{ s.v }}</strong>
      </div>
    </section>

    <NimbleSheetInventory />
  </div>

  <NimbleSheetAbilities />
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

// Fill most of the portrait frame; it keeps its square shape.
.nb-sigil {
  width: min(140px, 100%);
  height: auto;
}

.identity__body {
  flex: 999 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;

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

.identity__details {
  display: flex;
  gap: 4px 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--page-muted);

  strong {
    color: var(--page-text);
    font-weight: 600;
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px 12px;
  border-radius: var(--radius-panel);
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  box-shadow: var(--panel-shadow);

  &--key {
    border: 1.5px solid var(--accent);
  }

  &--adv .stat__save {
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  // The tile uses the panel palette (parchment on Cursed), so its chip does too.
  &--dis .stat__save {
    background: var(--panel-track);
  }
}

.stat__k {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--panel-muted);

  abbr {
    text-decoration: none;
  }
}

.stat__v {
  font-family: var(--font-heading);
  font-size: 36px;
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

.cols {
  display: grid;
  gap: 24px;
  align-items: start;

  &--vitals {
    grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
  }

  &--play {
    grid-template-columns: repeat(auto-fit, minmax(min(480px, 100%), 1fr));
  }

  &--lists {
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  }
}

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
  max-width: 64px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
}
</style>
