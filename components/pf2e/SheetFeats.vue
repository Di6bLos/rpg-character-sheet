<script setup lang="ts">
// The PF2e sheet's feats and features as Nimble's ability cards, with archetype feats grouped under their archetype
// (Player Core p. 215): its dedication first, then the feats taken for it, and whether a new
// dedication is open yet (two more feats of the archetype first). The archetype's introduction
// comes from `data/pf2e`, fetched when the sheet has an archetype.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eArchetypeDef } from '~/data/pf2e/types'
import type { Pf2eFeat, Pf2eSheet } from '~/types/sheets'
import { DEDICATION_FEATS, heroArchetypes } from '~/utils/pf2eArchetypes'
import { loreHtml } from '~/utils/loreText'

const { draft } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const groups = computed(() => heroArchetypes(sheet.value.feats))
const own = computed(() =>
  sheet.value.feats.filter((f) => !groups.value.some((g) => g.name === f.archetype)),
)
const members = (name: string) => sheet.value.feats.filter((f) => f.archetype === name)
const last = computed(() => groups.value.at(-1)?.name)

const archetypes = shallowRef<Pf2eArchetypeDef[]>([])
watch(
  () => groups.value.length > 0,
  async (any) => {
    if (!any || archetypes.value.length) return
    try {
      archetypes.value = await loadPf2e('archetypes')
    } catch {
      // The groups still show; only the archetype's introduction waits.
    }
  },
  { immediate: true },
)
const intro = (name: string) => archetypes.value.find((a) => a.name === name)

/** "1 more feat before another dedication" while the dedication rule holds (p. 215). */
function progress(name: string, count: number) {
  if (name !== last.value || count >= DEDICATION_FEATS) return ''
  const n = DEDICATION_FEATS - count
  return `${n} more feat${n === 1 ? '' : 's'} before another dedication`
}
const detail = (f: Pf2eFeat) =>
  [f.frequency && `Frequency ${f.frequency}`, f.trigger && `Trigger ${f.trigger}`]
    .filter(Boolean)
    .join(' · ')
</script>

<template>
  <div class="abilities">
    <article v-for="(f, i) in own" :key="`own-${i}`" class="tile ability">
      <div class="ability__head">
        <strong
          ><span v-if="f.action" class="glyph" aria-hidden="true">{{ f.action }} </span
          >{{ f.name }}</strong
        >
        <small>{{ f.type }}{{ f.level ? ` · ${f.level}` : '' }}</small>
      </div>
      <small v-if="detail(f)" class="ability__detail">{{ detail(f) }}</small>
      <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
      <div class="ability__text" v-html="loreHtml(f.desc)" />
    </article>
  </div>

  <section v-for="g in groups" :key="g.name" class="archetype" :aria-label="`${g.name} archetype`">
    <div class="archetype__head">
      <h3 class="caps">{{ g.name }} archetype</h3>
      <span v-if="progress(g.name, g.feats.length)" class="small muted">
        {{ progress(g.name, g.feats.length) }}
      </span>
    </div>
    <details v-if="intro(g.name)?.text" class="archetype__intro">
      <summary class="small">About the {{ g.name.toLowerCase() }} archetype</summary>
      <p class="small">{{ intro(g.name)!.text.split('\n\n')[0] }}</p>
    </details>
    <div class="abilities">
      <article v-for="(f, i) in members(g.name)" :key="`${g.name}-${i}`" class="tile ability">
        <div class="ability__head">
          <strong
            ><span v-if="f.action" class="glyph" aria-hidden="true">{{ f.action }} </span
            >{{ f.name }}</strong
          >
          <small
            >{{ f.dedication ? 'Dedication' : f.via ? `Via ${f.via}` : f.type
            }}{{ f.level ? ` · ${f.level}` : '' }}</small
          >
        </div>
        <small v-if="detail(f)" class="ability__detail">{{ detail(f) }}</small>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div class="ability__text" v-html="loreHtml(f.desc)" />
      </article>
    </div>
  </section>

  <p v-if="!sheet.feats.length" class="empty">No feats recorded yet.</p>
</template>

<style scoped lang="scss">
@use '../../assets/styles/abilities';

.glyph {
  color: var(--secondary);
}

.ability__detail {
  font-size: 12px;
  color: var(--page-muted);
}

.ability__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  :deep(p) {
    margin: 0.3em 0;
  }
}

.archetype {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
}

.archetype__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding-top: 8px;

  h3 {
    margin: 0;
    font-size: 12px;
    color: var(--accent-text);
  }
}

.archetype__intro {
  padding: 4px 0;

  summary {
    min-height: 32px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--page-soft);

    @media (pointer: coarse) {
      min-height: 44px;
    }
  }

  p {
    margin: 4px 0 0;
    color: var(--page-soft);
    line-height: 1.45;
  }
}
</style>
