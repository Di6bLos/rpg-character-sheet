<script setup lang="ts">
// Party roster cards: HP, temp HP, conditions; Nimble gets single-column long
// cards with wounds, armor, actions and concentration.
import type { GameSystem, RosterEntry } from '~/types'
import { plural } from '~/utils/format'

const props = defineProps<{
  roster: RosterEntry[]
  system: GameSystem
  /** Character whose turn it is. */
  turnCharacterId?: string | null
}>()

const auth = useAuthStore()

const heroes = computed(() => props.roster.filter((r) => r.role !== 'gm' || r.character_id))
const nimble = computed(() => props.system === 'nimble')

function hp(r: RosterEntry) {
  const now = Math.max(0, r.summary?.hp ?? 0)
  const max = Math.max(0, r.summary?.hpMax ?? 0)
  const temp = Math.max(0, r.summary?.tempHp ?? 0)
  const total = Math.max(max, now + temp) || 1
  return {
    now,
    max,
    temp,
    pct: `${Math.round((Math.min(now, max) / total) * 100)}%`,
    tempPct: `${Math.round((temp / total) * 100)}%`,
    low: max > 0 && now * 2 <= max,
  }
}

function sub(r: RosterEntry) {
  const who = [r.summary?.lineage, r.summary?.class].filter(Boolean).join(' ')
  const lvl = r.character_level ? ` ${r.character_level}` : ''
  return `${who || 'Adventurer'}${lvl} · ${r.display_name}`
}

function conditions(r: RosterEntry): string[] {
  const list = [...(r.summary?.conditions ?? [])]
  if (!nimble.value && r.summary?.concentration)
    list.push(`Concentrating · ${r.summary.concentration}`)
  return list
}

function down(r: RosterEntry) {
  return !!r.character_id && (r.summary?.hp ?? 1) <= 0
}

function dyingLine(r: RosterEntry) {
  const ds = r.summary?.deathSaves
  if (ds) return `Death saves · ${ds.successes} success, ${ds.failures} fail`
  if (typeof r.summary?.dying === 'number') return `Dying ${r.summary.dying}`
  return 'Dying'
}

function wounds(r: RosterEntry) {
  const max = Math.max(0, r.summary?.woundsMax ?? 6)
  const n = Math.min(max, Math.max(0, r.summary?.wounds ?? 0))
  return { n, max, pips: Array.from({ length: max }, (_, i) => i < n) }
}

function actions(r: RosterEntry) {
  const spent = Math.min(3, Math.max(0, r.summary?.actionsSpent ?? 0))
  return { left: 3 - spent, pips: [0, 1, 2].map((i) => i >= spent) }
}
</script>

<template>
  <section class="roster" aria-labelledby="ros-h">
    <h2 id="ros-h" class="rule-title">Party roster<span aria-hidden="true" /></h2>
    <p v-if="!heroes.length" class="empty">No one has joined this campaign yet.</p>

    <div v-else-if="!nimble" class="roster__grid">
      <article
        v-for="r in heroes"
        :key="r.user_id"
        class="panel card"
        :class="{
          'is-mine': r.user_id === auth.userId,
          'is-turn': r.character_id && r.character_id === turnCharacterId,
        }"
        :aria-label="r.character_name ?? r.display_name"
      >
        <div class="card__who">
          <UiAvatar
            :name="r.character_name ?? r.display_name"
            :portrait-path="r.portrait_path"
            :class-slug="r.summary?.classSlug ?? null"
            :faded="down(r)"
            :size="52"
          />
          <span class="card__names">
            <span class="card__line">
              <h3>{{ r.character_name ?? 'No character yet' }}</h3>
              <span v-if="r.character_id && r.character_id === turnCharacterId" class="turn"
                >Their turn</span
              >
            </span>
            <span class="card__sub">{{ sub(r) }}</span>
          </span>
        </div>
        <template v-if="r.character_id">
          <div class="hp">
            <div class="hp__nums">
              <span class="caps">Hit points</span>
              <span>
                <b :class="{ 'is-low': hp(r).low }">{{ hp(r).now }}</b> / {{ hp(r).max }}
                <template v-if="hp(r).temp"> · +{{ hp(r).temp }} temp</template>
              </span>
            </div>
            <div
              class="hp__bar"
              role="meter"
              :aria-label="`${r.character_name}: ${hp(r).now} of ${hp(r).max} hit points`"
              aria-valuemin="0"
              :aria-valuemax="hp(r).max"
              :aria-valuenow="hp(r).now"
            >
              <span
                class="hp__fill"
                :class="{ 'is-low': hp(r).low }"
                :style="{ width: hp(r).pct }"
              />
              <span class="hp__temp" :style="{ left: hp(r).pct, width: hp(r).tempPct }" />
            </div>
          </div>
          <div v-if="down(r)" class="dying">
            <b>Down</b><span>{{ dyingLine(r) }}</span>
          </div>
          <div class="stats">
            <div>
              <b>{{ r.summary?.ac ?? '—' }}</b
              ><span>AC</span>
            </div>
            <div>
              <b>{{ r.summary?.speed ?? '—' }}</b
              ><span>Speed</span>
            </div>
            <div>
              <b>{{ r.summary?.passivePerception ?? '—' }}</b
              ><span>Passive</span>
            </div>
          </div>
          <div class="conds">
            <span v-for="c in conditions(r)" :key="c" class="cond">{{ c }}</span>
            <span v-if="!conditions(r).length" class="muted small">No conditions</span>
          </div>
        </template>
      </article>
    </div>

    <ul v-else class="roster__long">
      <li
        v-for="r in heroes"
        :key="r.user_id"
        class="panel long"
        :class="{
          'is-mine': r.user_id === auth.userId,
          'is-turn': r.character_id && r.character_id === turnCharacterId,
        }"
        :aria-label="r.character_name ?? r.display_name"
      >
        <div class="long__who">
          <UiAvatar
            :name="r.character_name ?? r.display_name"
            :portrait-path="r.portrait_path"
            :class-slug="r.summary?.classSlug ?? null"
            :faded="down(r)"
            :size="56"
          />
          <span class="card__names">
            <span class="card__line">
              <h3>{{ r.character_name ?? 'No character yet' }}</h3>
              <span v-if="r.character_id && r.character_id === turnCharacterId" class="turn"
                >Their turn</span
              >
            </span>
            <span class="card__sub">{{ sub(r) }}</span>
          </span>
        </div>
        <template v-if="r.character_id">
          <div class="long__hp">
            <div class="hp__nums">
              <span class="caps">Hit points</span>
              <span>
                <b :class="{ 'is-low': hp(r).low }">{{ hp(r).now }}</b> / {{ hp(r).max }}
                <template v-if="hp(r).temp"> · +{{ hp(r).temp }} temp</template>
              </span>
            </div>
            <div
              class="hp__bar hp__bar--tall"
              role="meter"
              :aria-label="`${r.character_name}: ${hp(r).now} of ${hp(r).max} hit points`"
              aria-valuemin="0"
              :aria-valuemax="hp(r).max"
              :aria-valuenow="hp(r).now"
            >
              <span
                class="hp__fill"
                :class="{ 'is-low': hp(r).low }"
                :style="{ width: hp(r).pct }"
              />
              <span class="hp__temp" :style="{ left: hp(r).pct, width: hp(r).tempPct }" />
            </div>
            <div
              class="wounds"
              role="img"
              :aria-label="`${plural(wounds(r).n, 'wound')} of ${wounds(r).max}`"
            >
              <span class="caps">Wounds</span>
              <span
                v-for="(on, i) in wounds(r).pips"
                :key="i"
                class="wound"
                :class="{ 'is-on': on }"
              />
              <span class="wounds__txt" :class="{ 'is-low': wounds(r).n > 0 }"
                >{{ wounds(r).n }} / {{ wounds(r).max }}</span
              >
            </div>
          </div>
          <div class="long__boxes">
            <div class="box">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
              </svg>
              <b>{{ r.summary?.ac ?? '—' }}</b>
              <span class="caps">Armor</span>
            </div>
            <div
              class="box box--wide"
              role="img"
              :aria-label="`${plural(actions(r).left, 'action')} left`"
            >
              <span class="acts">
                <span
                  v-for="(on, i) in actions(r).pips"
                  :key="i"
                  class="act"
                  :class="{ 'is-on': on }"
                />
              </span>
              <b>{{ actions(r).left }} left</b>
              <span class="caps">Actions</span>
            </div>
          </div>
          <div class="long__foot">
            <span class="cond" :class="{ 'cond--on': r.summary?.concentration }">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" />
              </svg>
              {{
                r.summary?.concentration
                  ? `Concentrating · ${r.summary.concentration}`
                  : 'Not concentrating'
              }}
            </span>
            <span v-if="r.summary?.dying" class="cond cond--low">Dying</span>
            <span v-for="c in conditions(r)" :key="c" class="cond">{{ c }}</span>
            <span v-if="!conditions(r).length" class="muted small">No conditions</span>
          </div>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.roster {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.rule-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-heading);
  font-size: 22px;

  span {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--line), transparent);
  }
}

.roster__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 14px;
}

.roster__long {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card,
.long {
  padding: 16px;

  &.is-mine {
    box-shadow:
      var(--panel-shadow),
      inset 0 0 0 1px var(--accent);
  }

  &.is-turn {
    box-shadow:
      var(--panel-shadow),
      inset 0 0 0 2px var(--accent);
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.long {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 22px;
  padding: 14px 18px;
}

.card__who,
.long__who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.long__who {
  flex: 1 1 210px;
}

.card__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.card__line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 19px;
    line-height: 1.15;
  }
}

.card__sub {
  font-size: 13px;
  color: var(--page-muted);
}

.turn {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.caps {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.hp,
.long__hp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.long__hp {
  flex: 2 1 240px;
  min-width: 0;
}

.hp__nums {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;

  b {
    font-size: 18px;
  }
}

.is-low {
  color: var(--danger-text);
}

.hp__bar {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;

  &--tall {
    height: 12px;
  }
}

.hp__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: var(--ok-text, var(--accent));

  &.is-low {
    background: var(--danger);
  }
}

.hp__temp {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent) 60%, transparent);
}

.dying {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 8px 10px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--danger);
  font-size: 14px;

  b {
    color: var(--danger-text);
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;

  div {
    padding: 6px 4px;
    border-radius: min(var(--radius-control), 8px);
    background: var(--inset);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  b {
    font-size: 18px;
  }

  span {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.conds,
.long__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.long__foot {
  flex: 1 1 100%;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.cond {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  font-size: 13px;
  font-weight: 600;

  &--on {
    border-color: var(--accent);
    color: var(--accent-text);
  }

  &--low {
    border-color: var(--danger);
    color: var(--danger-text);
  }
}

.wounds {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wound {
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  border: 1.5px solid var(--danger);

  &.is-on {
    background: var(--danger);
  }
}

.wounds__txt {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 600;
}

.long__boxes {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
}

.box {
  width: 74px;
  padding: 8px 4px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  color: var(--page-text);

  svg {
    color: var(--accent-text);
  }

  b {
    font-size: 18px;
    line-height: 1.1;
  }

  &--wide {
    width: 118px;
  }
}

.acts {
  display: flex;
  gap: 6px;
  padding-top: 1px;
}

.act {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);

  &.is-on {
    border-color: var(--accent);
    background: var(--accent);
  }
}
</style>
