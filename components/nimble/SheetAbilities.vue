<script setup lang="ts">
// Every ability with its full text. Those with limited uses are also counted in
// the Actions panel.
import { INVENTIONS } from '~/data/nimble/effects'
import type { NimbleSheet } from '~/types/sheets'
import { abilityBaseName, keyStatValue } from '~/utils/nimbleBuild'
import { splitMishap } from '~/utils/nimbleEffects'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const { malfunctions, toggleMalfunction, effects, useEffect } = useNimbleActions()
const effectBy = computed(() => new Map(effects.value.map((e) => [e.source, e])))
const risks = computed(() => new Map(malfunctions.value.map((m) => [m.name, m])))
const inventionOf = (name: string) => INVENTIONS.find((i) => i.name === abilityBaseName(name))
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="ab-h">
    <UiFold name="All abilities" />
    <h2 id="ab-h">All abilities</h2>
    <div class="abilities">
      <article
        v-for="(a, i) in sheet.abilities"
        :key="i"
        class="tile ability"
        :class="{ 'is-down': risks.get(a.name)?.on }"
      >
        <div class="ability__head">
          <strong>{{ a.name }}</strong>
          <small>{{ a.src }}{{ a.level ? ` · L${a.level}` : '' }}</small>
        </div>
        <template v-if="inventionOf(a.name)">
          <p class="ability__stats">{{ inventionOf(a.name)!.stats }}</p>
          <template v-for="(m, k) in inventionOf(a.name)!.modes" :key="k">
            <p>
              <strong v-if="m.name">{{ m.name }}</strong
              ><small v-if="m.cost"> · {{ m.cost }}</small> {{ m.text }}
            </p>
            <NimbleMishap v-if="m.mishap" :name="m.mishap.name" :text="m.mishap.text" />
          </template>
          <NimbleMishap
            v-if="inventionOf(a.name)!.mishap"
            :name="inventionOf(a.name)!.mishap!.name"
            :text="inventionOf(a.name)!.mishap!.text"
          />
          <details class="ability__full">
            <summary>Full rules</summary>
            <p><NimbleRulesText :text="a.desc" :key-value="keyValue" /></p>
          </details>
        </template>
        <template v-else>
          <p><NimbleRulesText :text="splitMishap(a.desc).text" :key-value="keyValue" /></p>
          <NimbleMishap
            v-if="splitMishap(a.desc).mishap"
            :name="splitMishap(a.desc).mishap!.name"
            :text="splitMishap(a.desc).mishap!.text"
          />
        </template>
        <NimbleTrigger :name="a.name" :text="a.desc" />
        <NimbleModifiers :target="a.name" />
        <button
          v-if="effectBy.get(a.name)"
          type="button"
          class="btn btn--ghost btn--sm"
          style="align-self: flex-start"
          :disabled="!canEdit || effectBy.get(a.name)?.on || !!effectBy.get(a.name)?.notNow"
          :title="effectBy.get(a.name)?.notNow || undefined"
          @click="useEffect(a.name)"
        >
          {{
            effectBy.get(a.name)?.on
              ? `${effectBy.get(a.name)?.condition} now`
              : `Become ${effectBy.get(a.name)?.condition}`
          }}
        </button>
        <div v-if="risks.get(a.name)" class="malfunction">
          <UiSwitch
            :model-value="!!risks.get(a.name)?.on"
            :label="risks.get(a.name)?.label ?? ''"
            :disabled="!canEdit"
            @update:model-value="toggleMalfunction(a.name)"
          />
          <small>{{ risks.get(a.name)?.fix }}</small>
        </div>
      </article>
    </div>
    <p v-if="!sheet.abilities.length" class="empty">No abilities recorded yet.</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/abilities';

.ability__stats {
  font-weight: 700;
  color: var(--accent-text) !important;
}

.ability__full {
  > summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--page-muted);
  }

  p {
    margin-top: 6px;
  }
}

.is-down {
  border-color: var(--danger);
}

.malfunction {
  font-size: 13px;
  font-weight: 600;

  small {
    font-weight: 400;
    color: var(--page-muted);
  }
}
</style>
