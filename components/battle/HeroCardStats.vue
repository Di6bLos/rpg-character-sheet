<script setup lang="ts">
// The stats modal's main area: stats with save marks, top skills, resources, summons
// and key abilities with one line of text each. Shows only what campaign_hero_card
// returned (the public subset of a hero).
import type { HeroCard } from '~/types'
import { sign } from '~/utils/dice'

const props = defineProps<{ card: HeroCard }>()

const STATS = ['STR', 'DEX', 'INT', 'WIL'] as const

const stats = computed(() =>
  STATS.map((k) => {
    const mode = props.card.saveAdv === k ? 'adv' : props.card.saveDis === k ? 'dis' : ''
    return {
      k,
      v: sign(props.card.stats[k] ?? 0),
      mode,
      label: mode === 'adv' ? `${k} ▲` : mode === 'dis' ? `${k} ▼` : k,
      title:
        mode === 'adv'
          ? `${k} saves with advantage`
          : mode === 'dis'
            ? `${k} saves with disadvantage`
            : `${k} saves`,
    }
  }),
)

/** The best skills by total (stat + points), up to five. */
const skills = computed(() =>
  props.card.skills
    .filter((s) => s.name)
    .map((s) => ({
      name: s.name,
      total: (props.card.stats[s.stat as (typeof STATS)[number]] ?? 0) + s.points,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 5),
)

const resources = computed(() => {
  const rows: { name: string; value: string }[] = []
  const m = props.card.mana
  if (m && m.max > 0) rows.push({ name: 'Mana', value: `${m.current} / ${m.max}` })
  const r = props.card.resource
  if (r?.name) {
    const value = r.dice && r.die ? `${r.dice} × d${r.die}` : String(r.count)
    rows.push({ name: r.name, value })
  }
  return rows
})

/** The first sentence, for the one-line summary (the whole text is on hover). */
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const end = flat.search(/[.!?](\s|$)/)
  return end > 0 ? flat.slice(0, end + 1) : flat
}

const abilities = computed(() => props.card.abilities.filter((a) => a.name))
</script>

<template>
  <div class="hcs">
    <div class="hcs__full">
      <span class="hcs__sect">Stats &amp; saves</span>
      <div class="hcs__stats">
        <div
          v-for="s in stats"
          :key="s.k"
          class="hcs__stat"
          :class="s.mode && `hcs__stat--${s.mode}`"
          :title="s.title"
        >
          <b>{{ s.v }}</b>
          <span>{{ s.label }}</span>
        </div>
      </div>
    </div>

    <div>
      <span class="hcs__sect">Top skills</span>
      <dl v-if="skills.length" class="hcs__pairs">
        <template v-for="s in skills" :key="s.name">
          <dt>{{ s.name }}</dt>
          <dd>{{ sign(s.total) }}</dd>
        </template>
      </dl>
      <p v-else class="hcs__none">None</p>
    </div>

    <div>
      <span class="hcs__sect">Resources</span>
      <dl v-if="resources.length" class="hcs__pairs">
        <template v-for="r in resources" :key="r.name">
          <dt>{{ r.name }}</dt>
          <dd>{{ r.value }}</dd>
        </template>
      </dl>
      <p v-else class="hcs__none">None</p>
      <template v-if="card.summons.length">
        <span class="hcs__sect hcs__sect--gap">Summons</span>
        <dl class="hcs__pairs">
          <template v-for="(m, i) in card.summons" :key="i">
            <dt>{{ m.name }}</dt>
            <dd>{{ m.hpMax ? (m.hp > 0 ? `${m.hp}/${m.hpMax} HP` : 'Slain') : '—' }}</dd>
          </template>
        </dl>
      </template>
    </div>

    <div class="hcs__full">
      <span class="hcs__sect">Key abilities</span>
      <ul v-if="abilities.length" class="hcs__abil">
        <li v-for="(a, i) in abilities" :key="i" :title="a.desc || undefined">
          <b>{{ a.name }}.</b> {{ oneLine(a.desc) }}
        </li>
      </ul>
      <p v-else class="hcs__none">None</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hcs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
  align-content: start;
}

.hcs__full {
  grid-column: 1 / -1;
}

.hcs__sect {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);

  &--gap {
    margin-top: 12px;
  }
}

.hcs__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.hcs__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  font-size: 11px;
  color: var(--page-soft);

  b {
    font-family: var(--font-heading);
    font-size: 16px;
    color: var(--page-text);
  }

  &--adv span {
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
    font-weight: 700;
  }

  &--dis span {
    color: color-mix(in srgb, var(--danger) 35%, var(--page-text));
    font-weight: 700;
  }
}

.hcs__pairs {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 10px;
  font-size: 13px;

  dt {
    color: var(--page-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dd {
    margin: 0;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.hcs__none {
  margin: 0;
  font-size: 13px;
  color: var(--page-muted);
}

.hcs__abil {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;

  li {
    font-size: 13px;
    line-height: 1.4;
    color: var(--page-soft);
  }

  b {
    color: var(--page-text);
  }
}
</style>
