<script setup lang="ts">
// Spells the hero can cast; the casting rules live in useNimbleSpells().
import { SCHOOL_LABELS } from '~/data/nimble/spells'
import type { SpellSchool } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

const { draft } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const { known, utility, tiers, help, setUpcast } = useNimbleSpells()

const schools = computed(() =>
  sheet.value.spells.schools.map((s) => SCHOOL_LABELS[s as SpellSchool] ?? s).join(' · '),
)
</script>

<template>
  <section class="panel stack" style="gap: 16px" aria-labelledby="sp-h">
    <UiFold name="Spells" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="sp-h">Spells</h2>
        <UiHelp label="About spells" :text="help" />
      </div>
      <span v-if="schools" class="small muted" style="font-size: 12px">{{ schools }}</span>
    </div>

    <NimbleSpellPool />
    <NimbleSpellshaper />

    <details class="tier spell-list" open>
      <summary class="caps">Spell list</summary>
      <div class="stack" style="gap: 16px">
        <details v-for="g in tiers" :key="g.tier" class="tier" open>
          <summary class="caps">
            {{ g.label }}
          </summary>
          <div class="spell-grid">
            <NimbleSpellCard
              v-for="s in g.spells"
              :key="s.name"
              :spell="s"
              @upcast="setUpcast(s, $event)"
            />
          </div>
        </details>
        <p v-if="!known.length" class="empty">No combat spells yet.</p>

        <details v-if="utility.length" class="tier" open>
          <summary class="caps">Utility spells</summary>
          <div class="stack" style="gap: 8px">
            <details v-for="s in utility" :key="s.name" name="nimble-utility" class="tile utility">
              <summary>
                <strong>{{ s.name }}</strong>
                <span class="school" :class="`school--${s.school}`">{{
                  SCHOOL_LABELS[s.school]
                }}</span>
                <small>{{ s.cast }}</small>
              </summary>
              <p><NimbleRulesText :text="s.desc" :key-value="keyValue" /></p>
              <NimbleModifiers :target="s.name" />
            </details>
          </div>
        </details>
      </div>
    </details>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/spells-list';

.utility summary {
  display: flex;
  align-items: center;
  gap: 4px 8px;
  flex-wrap: wrap;

  strong {
    font-size: 14px;
  }

  small {
    margin-left: auto;
    font-size: 12px;
    color: var(--page-muted);
  }
}

// Each school tints its chip; mixing with the theme's own field and text keeps
// it readable on dark panels and on Cursed parchment.
.school {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--school) 22%, var(--field));
  color: color-mix(in srgb, var(--school) 45%, var(--page-text));

  &--fire {
    --school: #e8703a;
  }

  &--ice {
    --school: #4f9fe0;
  }

  &--lightning {
    --school: #d8c02e;
  }

  &--wind {
    --school: #4fbf8c;
  }

  &--radiant {
    --school: #e0b84a;
  }

  &--necrotic {
    --school: #9a6fd6;
  }
}

.utility {
  padding: 0;
  gap: 0;

  summary {
    padding: 10px 14px;
    min-height: 44px;
    cursor: pointer;
  }

  p {
    padding: 0 14px 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }

  &[open] {
    border-color: var(--accent);
  }
}
</style>
