<script setup lang="ts">
// The quick-action dropdowns: attacks, spells, reactions and limited-use
// abilities. Same rules as the sheet (useNimbleActions /
// useNimbleSpells); each result also goes to party chat.
import type { NimbleSheet } from '~/types/sheets'
import { stopCasting } from '~/utils/nimblePlay'

defineProps<{ drawer: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()

const { draft, canEdit, lastRoll, say } = useSheet<NimbleSheet>()
const { campaignId } = useCampaignBoard()
const chat = useBoardChat()
const sheet = computed(() => draft.value.sheet)
const uid = useId()

/** Bumped on every result, so a repeated message is still announced. */
const seq = ref(0)

function announce(message: string) {
  seq.value += 1
  void chat.send(`${draft.value.name} · ${message}`, 'party', 'action')
}

const { attacks, reactions, toggleReaction, abilities, spend } = useNimbleActions({
  onResult: announce,
})
const { tiers, help: spellHelp, cast } = useNimbleSpells({ onResult: announce })

const spellCount = computed(() => tiers.value.reduce((n, t) => n + t.spells.length, 0))
const reactionsLeft = computed(() => reactions.value.filter((r) => !r.used).length)
const sheetLink = computed(() => `/character/${draft.value.id}?campaign=${campaignId.value}`)
const casting = computed(() => sheet.value.casting)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Shows in the panel only; it isn't news for the party. */
function cancelCasting() {
  if (!canEdit.value) return
  say(stopCasting(sheet.value))
  seq.value += 1
}

/** Spells with why each can't be cast right now ('' when it can). */
const spellGroups = computed(() =>
  tiers.value.map((g) => ({
    ...g,
    spells: g.spells.map((s) => ({
      ...s,
      blocked: s.busy ? 'Finish casting first' : s.short ? `Needs ${s.at} mana` : '',
    })),
  })),
)

/** One row per counter, so an ability with two limits gets two buttons. */
const abilityRows = computed(() =>
  abilities.value.flatMap((a) =>
    a.counters.map((c) => ({
      id: c.id,
      name: a.name,
      desc: a.desc,
      label: a.counters.length > 1 ? c.label : '',
      left: c.left,
      max: c.max,
      counter: c,
    })),
  ),
)
</script>

<template>
  <div class="apm">
    <header class="apm__head">
      <div class="apm__who">
        <strong>{{ draft.name }}</strong>
      </div>
      <NuxtLink
        :to="sheetLink"
        class="btn btn--ghost btn--icon apm__icon"
        aria-label="Open sheet"
        title="Open sheet"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </NuxtLink>
      <button
        type="button"
        class="btn btn--ghost btn--icon apm__icon"
        data-ap-dismiss
        :aria-label="drawer ? 'Close quick actions' : 'Collapse quick actions'"
        :title="drawer ? 'Close' : 'Collapse'"
        @click="emit('dismiss')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            :d="drawer ? 'M6 6l12 12M18 6L6 18' : 'M15 5l-7 7 7 7'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </header>

    <p v-if="!canEdit" class="apm__note">Read only.</p>

    <div v-if="casting.actions" class="apm__turn">
      <p class="apm__casting">
        Casting {{ casting.spell }}: {{ plural(casting.actions, 'more action') }} next turn
      </p>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        :disabled="!canEdit"
        title="Give up on the spell; what it cost is not refunded"
        @click="cancelCasting"
      >
        Stop casting
      </button>
    </div>

    <p class="apm__result" :class="{ 'apm__result--empty': !lastRoll }" role="status">
      <span :key="seq">{{ lastRoll }}</span>
    </p>

    <details name="action-panel" class="apm__menu" open>
      <summary>
        <span>Attack</span>
        <UiHelp
          label="About attacks"
          text="A 1 on the first die misses; its max explodes as a crit. Each attack after the first in a turn is Rushed (1 more disadvantage)."
        />
        <small>{{ attacks.length }}</small>
      </summary>
      <ul v-if="attacks.length" class="apm__list">
        <li v-for="(w, i) in attacks" :key="i">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || undefined"
            :aria-label="`${w.name}, ${w.dmg} damage${w.rushed ? `, ${w.rushed}× disadvantage` : ''}`"
            :aria-describedby="w.props ? `${uid}-w${i}` : undefined"
            @click="canEdit && w.roll()"
          >
            <span class="apm__name">{{ w.name }}</span>
            <span class="apm__tag">{{ w.dmg }}</span>
            <span v-if="w.props || w.rushed" :id="`${uid}-w${i}`" class="apm__sub">
              <template v-if="w.rushed">{{ w.rushed }}× disadvantage</template>
              <template v-if="w.props && w.rushed"> · </template>
              {{ w.props }}
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="apm__empty">No attacks on the sheet.</p>
    </details>

    <details v-if="spellCount" name="action-panel" class="apm__menu">
      <summary>
        <span>Cast</span>
        <UiHelp label="About spells" :text="spellHelp" />
        <small>{{ spellCount }}</small>
      </summary>
      <div v-for="g in spellGroups" :key="g.tier" class="apm__group">
        <div class="apm__caps">{{ g.label }}</div>
        <ul class="apm__list">
          <li v-for="(s, j) in g.spells" :key="s.name" class="apm__split">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || !!s.blocked || undefined"
              :aria-label="`${s.name}, ${s.cost}${s.actions ? `, ${plural(s.actions, 'action')}` : ''}${s.blocked ? `. ${s.blocked}` : ''}`"
              :aria-describedby="`${uid}-s${g.tier}-${j}`"
              :title="`${s.cast}. ${s.desc}`"
              @click="canEdit && !s.blocked && cast(s)"
            >
              <span class="apm__name">{{ s.name }}</span>
              <span class="apm__tag">{{ s.cost }}</span>
              <span class="apm__sub" :class="{ 'apm__sub--warn': s.blocked }">
                {{ s.blocked || (s.actions ? plural(s.actions, 'action') : '') }}
              </span>
              <span :id="`${uid}-s${g.tier}-${j}`" class="sr-only">{{ s.cast }}. {{ s.desc }}</span>
            </button>
            <button
              v-if="s.bloodLabel"
              type="button"
              class="apm__alt"
              :aria-disabled="!canEdit || s.busy || undefined"
              :aria-label="`Cast ${s.name} by taking 1 Wound`"
              title="Take 1 Wound instead (My Blood, My Power)"
              @click="canEdit && !s.busy && cast(s, true)"
            >
              Wound
            </button>
          </li>
        </ul>
      </div>
    </details>

    <details name="action-panel" class="apm__menu">
      <summary>
        <span>React</span>
        <UiHelp
          label="About reactions"
          text="Each costs 1 action, once per round. Tap again to undo."
        />
        <small>{{ reactionsLeft }}/{{ reactions.length }}</small>
      </summary>
      <ul class="apm__list">
        <li v-for="(r, k) in reactions" :key="r.name">
          <button
            type="button"
            class="apm__row"
            :class="{ 'apm__row--used': r.used }"
            :aria-pressed="r.used"
            :aria-disabled="!canEdit || undefined"
            :aria-label="`Mark ${r.name} used, 1 action`"
            :aria-describedby="`${uid}-r${k}`"
            :title="r.desc"
            @click="canEdit && toggleReaction(r.name)"
          >
            <span class="apm__name">{{ r.name }}</span>
            <span class="apm__tag">{{ r.used ? 'Used' : '1 act' }}</span>
            <span :id="`${uid}-r${k}`" class="sr-only">{{ r.desc }}</span>
          </button>
        </li>
      </ul>
    </details>

    <details v-if="abilityRows.length" name="action-panel" class="apm__menu">
      <summary>
        <span>Abilities</span>
        <UiHelp
          label="About abilities"
          text="Limited-use abilities. Use spends one; refills on New turn, New encounter or Safe Rest (on the sheet)."
        />
        <small>{{ abilityRows.length }}</small>
      </summary>
      <ul class="apm__list">
        <li v-for="(a, n) in abilityRows" :key="a.id">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || a.left === 0 || undefined"
            :aria-label="`Use ${a.name}${a.label ? ` (${a.label})` : ''}, ${a.left} of ${a.max} left`"
            :aria-describedby="`${uid}-a${n}`"
            :title="a.desc"
            @click="canEdit && a.left > 0 && spend(a.counter, a.name, 1)"
          >
            <span class="apm__name">{{ a.name }}</span>
            <span class="apm__tag">{{ a.left }}/{{ a.max }}</span>
            <span
              v-if="a.label || a.left === 0"
              class="apm__sub"
              :class="{ 'apm__sub--warn': a.left === 0 }"
            >
              {{ a.left === 0 ? 'None left' : '' }}{{ a.left === 0 && a.label ? ' · ' : ''
              }}{{ a.label }}
            </span>
            <span :id="`${uid}-a${n}`" class="sr-only">{{ a.desc }}</span>
          </button>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped lang="scss">
.apm {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.apm__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.apm__who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  strong {
    font-family: var(--font-heading);
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.apm__icon {
  width: 32px;
  min-width: 32px;
  min-height: 32px;
  font-size: 18px;
}

.apm__note {
  font-size: 12px;
  color: var(--page-muted);
}

.apm__menu {
  border: 1px solid var(--line);
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);

  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      font-size: 12px;
      color: var(--page-muted);

      @media (prefers-reduced-motion: no-preference) {
        transition: rotate 0.15s;
      }
    }

    &:focus-visible {
      outline-offset: -2px;
    }

    small {
      margin-left: auto;
      font-size: 12px;
      font-weight: 600;
      color: var(--page-muted);
      font-variant-numeric: tabular-nums;
    }
  }

  &[open] {
    border-color: var(--accent);

    > summary::after {
      rotate: 180deg;
    }
  }
}

.apm__group + .apm__group {
  margin-top: 4px;
}

.apm__caps {
  padding: 4px 10px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.apm__list {
  list-style: none;
  margin: 0;
  padding: 0 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.apm__split {
  display: flex;
  gap: 2px;

  .apm__row {
    flex: 1;
    min-width: 0;
  }
}

.apm__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0 8px;
  width: 100%;
  min-height: 36px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--page-text);
  text-align: left;
  font-size: 13px;

  &:hover:not([aria-disabled='true']) {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  &:focus-visible {
    outline-offset: -2px;
  }

  // Unavailable rows stay readable and focusable; the sub line says why.
  &[aria-disabled='true'] {
    cursor: not-allowed;

    .apm__name {
      color: var(--page-soft);
    }

    .apm__tag {
      color: var(--page-muted);
    }
  }

  &--used .apm__name {
    text-decoration: line-through;
    color: var(--page-muted);
  }
}

.apm__name {
  font-weight: 600;
  // Two lines at most, so long names stay whole in the narrow panel.
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.apm__tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.apm__sub {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--page-soft);

  &:empty {
    display: none;
  }

  &--warn {
    font-weight: 600;
    color: var(--page-text);
  }
}

.apm__alt {
  min-width: 56px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--page-soft);
  font-size: 12px;
  font-weight: 700;

  &:focus-visible {
    outline-offset: -2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    color: var(--page-muted);
    border-style: dashed;
  }
}

.apm__empty {
  padding: 4px 10px 10px;
  font-size: 12px;
  color: var(--page-muted);
}

.apm__turn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.apm__casting {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-text);
}

.apm__result {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--inset, var(--field));
  font-size: 12px;
  line-height: 1.45;
  color: var(--page-soft);

  // Stays rendered while empty (a live region that appears later may not be read).
  &--empty {
    margin-top: -8px;
    padding: 0;
    background: none;
  }
}

@media (any-pointer: coarse) {
  .apm__row,
  .apm__alt,
  .apm__menu > summary {
    min-height: 44px;
  }

  .apm__icon {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
