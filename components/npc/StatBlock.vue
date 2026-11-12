<script setup lang="ts">
// One renderer for every system's stat block (the stored JSON is system-agnostic:
// headline lines, an ability row, secondary lines and named sections).
import type { GameSystem, NpcSource, StatBlock } from '~/types'
import { LEVEL_LABEL, statBlockSubtitle } from '~/utils/npcStatBlock'
import { systemLabel } from '~/utils/systems'

const props = defineProps<{
  name: string
  system: GameSystem
  level: string
  block: StatBlock
  imagePath?: string | null
  source?: NpcSource
  aiGenerated?: boolean
  gmNotes?: string
}>()

const sub = computed(() => statBlockSubtitle(props.block))
const image = computed(() => npcImageUrl(props.imagePath))
const levelText = computed(() => (props.level ? `${LEVEL_LABEL[props.system]} ${props.level}` : ''))
</script>

<template>
  <article class="panel sb" :aria-label="name || 'Stat block'">
    <div class="sb__head">
      <img v-if="image" :src="image" alt="" class="sb__img" />
      <div class="sb__title">
        <h2>{{ name || 'Unnamed' }}</h2>
        <span v-if="sub" class="sb__sub">{{ sub }}</span>
      </div>
      <span v-if="levelText" class="sb__lvl">{{ levelText }}</span>
    </div>
    <div class="sb__tags">
      <span class="sb__tag">{{ systemLabel(system) }}</span>
      <span v-if="source" class="sb__tag" :class="`sb__tag--${source}`">{{
        source === 'official' ? 'Official' : 'Homebrew'
      }}</span>
      <span v-if="aiGenerated" class="sb__tag">AI draft</span>
    </div>
    <div class="sb__rule" aria-hidden="true" />
    <dl v-if="block.top?.length" class="sb__lines">
      <div v-for="[k, v] in block.top" :key="k">
        <dt>{{ k }}</dt>
        <dd>{{ v }}</dd>
      </div>
    </dl>
    <template v-if="block.stats?.length">
      <div class="sb__rule" aria-hidden="true" />
      <dl class="sb__stats">
        <div v-for="[k, v] in block.stats" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </div>
      </dl>
    </template>
    <template v-if="block.lines?.length">
      <div class="sb__rule" aria-hidden="true" />
      <dl class="sb__lines sb__lines--small">
        <div v-for="([k, v], i) in block.lines" :key="`${k}-${i}`">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </div>
      </dl>
    </template>
    <section v-for="sec in block.sections ?? []" :key="sec.title" class="sb__sec">
      <h3>{{ sec.title }}</h3>
      <p v-for="(it, i) in sec.items" :key="`${it.n}-${i}`">
        <b v-if="it.n">{{ it.n }}.</b> {{ it.t }}
      </p>
    </section>
    <div v-if="gmNotes" class="sb__notes"><b>GM notes · </b>{{ gmNotes }}</div>
  </article>
</template>

<style scoped lang="scss">
.sb {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sb__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 14px;
}

.sb__img {
  width: 72px;
  height: 72px;
  border-radius: min(var(--radius-control), 10px);
  object-fit: cover;
}

.sb__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 30px;
    line-height: 1.1;
    color: var(--accent-text);
  }
}

.sb__sub {
  font-size: 15px;
  font-style: italic;
  color: var(--page-muted);
}

.sb__lvl {
  padding: 4px 10px;
  border-radius: var(--radius-control);
  border: 1.5px solid var(--accent-text);
  font-size: 14px;
  font-weight: 700;
}

.sb__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sb__tag {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 700;

  &--official {
    border-color: var(--accent-text);
    color: var(--accent-text);
  }
}

.sb__rule {
  height: 2px;
  background: linear-gradient(90deg, var(--accent-text), transparent);
}

.sb__lines {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 15px;
  line-height: 1.45;

  dt {
    display: inline;
    font-weight: 700;
  }

  dd {
    display: inline;
    margin: 0 0 0 6px;
  }

  &--small {
    font-size: 14px;
  }
}

.sb__stats {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  text-align: center;

  div {
    padding: 6px 2px;
    border-radius: min(var(--radius-control), 8px);
    background: var(--inset);
  }

  dt {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  dd {
    margin: 0;
    font-size: 15px;
  }
}

.sb__sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;

  h3 {
    margin: 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--accent-text);
    font-family: var(--font-heading);
    font-size: 19px;
    color: var(--accent-text);
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  b {
    font-style: italic;
  }
}

.sb__notes {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px dashed var(--accent-text);
  font-size: 14px;
  line-height: 1.5;

  b {
    color: var(--accent-text);
  }
}

@media (max-width: 480px) {
  .sb__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
