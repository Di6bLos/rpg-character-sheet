<script setup lang="ts">
// Spells the hero can cast; the casting rules live in useNimbleSpells().
import { SCHOOL_LABELS } from '~/data/nimble/spells'
import type { SpellSchool } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const { known, utility, maxTier, tiers, help, setUpcast, cast } = useNimbleSpells()

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

    <details class="tier spell-list" open>
      <summary class="caps">
        Spell list <small>{{ known.length + utility.length }}</small>
      </summary>
      <div class="stack" style="gap: 16px">
        <details v-for="g in tiers" :key="g.tier" class="tier" open>
          <summary class="caps">
            {{ g.label }} <small>{{ g.spells.length }}</small>
          </summary>
          <div class="spell-grid">
            <details v-for="s in g.spells" :key="s.name" name="nimble-spell" class="tile spell">
              <summary class="spell__head">
                <strong>{{ s.name }}</strong>
                <span class="school" :class="`school--${s.school}`">{{
                  SCHOOL_LABELS[s.school]
                }}</span>
                <small>{{ s.cast }}</small>
              </summary>
              <div class="spell__body">
                <p><NimbleRulesText :text="s.desc" :key-value="keyValue" /></p>
                <NimbleModifiers :target="s.name" />
                <div class="row" style="gap: 8px">
                  <div v-if="s.canUpcast" class="row" style="gap: 4px">
                    <button
                      type="button"
                      class="step step--xs"
                      :aria-label="`Lower the cast tier of ${s.name}`"
                      :disabled="!canEdit || s.at <= s.tier"
                      @click="setUpcast(s, s.at - 1)"
                    >
                      −
                    </button>
                    <span class="spell__tier" aria-live="polite">Tier {{ s.at }}</span>
                    <button
                      type="button"
                      class="step step--xs"
                      :aria-label="`Upcast ${s.name}`"
                      :disabled="!canEdit || s.at >= maxTier"
                      @click="setUpcast(s, s.at + 1)"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    class="btn btn--sm cast"
                    :class="{ 'btn--ghost': s.tier === 0 }"
                    :disabled="!canEdit || s.short || s.busy || s.noActions"
                    :title="
                      s.busy
                        ? `Still casting ${sheet.casting.spell}`
                        : s.noActions
                          ? 'No actions left'
                          : s.short
                            ? s.usesMinions
                              ? `Not enough shadow minions (needs ${s.cost})`
                              : 'Not enough mana'
                            : s.spread
                              ? 'Spends the actions you have now and the rest on your next turns; it takes effect then. Keep Concentration and take no other actions or reactions meanwhile (Core p. 15).'
                              : undefined
                    "
                    @click="cast(s)"
                  >
                    {{ s.label }}
                  </button>
                  <button
                    v-if="s.bloodLabel"
                    type="button"
                    class="btn btn--sm btn--ghost cast"
                    :disabled="!canEdit || s.busy || s.noActions"
                    @click="cast(s, true)"
                  >
                    {{ s.bloodLabel }}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </details>
        <p v-if="!known.length" class="empty">No combat spells yet.</p>

        <details v-if="utility.length" class="tier" open>
          <summary class="caps">
            Utility spells <small>{{ utility.length }}</small>
          </summary>
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
.tier {
  display: flex;
  flex-direction: column;
  gap: 8px;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    small {
      font-size: 11px;
      letter-spacing: normal;
      color: var(--page-muted);
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      letter-spacing: normal;
      color: var(--accent-text);
    }
  }

  &[open] > summary {
    margin-bottom: 8px;

    &::after {
      content: '▴';
    }
  }
}

// Two columns on wider panels, like the reactions.
.spell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.spell {
  padding: 0;
  gap: 0;

  summary {
    min-height: 44px;
    padding: 10px 14px;
    cursor: pointer;
  }

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }

  &[open] {
    border-color: var(--accent);
  }
}

.spell__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px;
}

.spell__head,
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

.spell__tier {
  min-width: 52px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}

.cast {
  margin-left: auto;
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
