<script setup lang="ts">
// Spells the hero can cast: Cast spends the spell's actions and its mana (or a
// use of Pilfered Power, or a Reaver's minions or Wound), and starts
// Concentration when the spell needs it.
import { SCHOOL_LABELS, SPELL_RULES } from '~/data/nimble/spells'
import type { SpellDef, SpellSchool } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue, knownSpells, knownUtilitySpells, sheetResource } from '~/utils/nimbleBuild'
import {
  castingBlocks,
  castSpell,
  isHollowOne,
  manaPool,
  payBloodCast,
  payShadowExploit,
  shadowExploitCost,
  spellActions,
  spendMana,
} from '~/utils/nimblePlay'

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))

const known = computed(() => knownSpells(sheet.value))
const utility = computed(() => knownUtilitySpells(sheet.value))
const maxTier = computed(() => sheet.value.spells.tier)

/**
 * Reavers can't use Pilfered Power: they sacrifice minions (Shadow Exploit) or,
 * from level 11, take a Wound (My Blood, My Power), both at the highest tier.
 */
const reaver = computed(() => isHollowOne(sheet.value))
const bloodCast = computed(() => sheet.value.abilities.some((a) => a.name === 'My Blood, My Power'))
const minionCost = computed(() => shadowExploitCost(sheet.value))

/** Shadowmancers have no mana: tiered spells use Pilfered Power at the highest tier. */
const pact = computed(() => {
  if (reaver.value) return null
  const r = sheetResource(sheet.value, draft.value.level)
  return r?.kind === 'uses' && sheet.value.mana.max === 0 ? r : null
})
const pactLimit = computed(() => {
  const stat = pact.value?.stat
  return stat ? Math.max(0, sheet.value.stats[stat]) : 0
})

/** Tier each spell is set to be cast at, when upcast. */
const upcast = reactive<Record<string, number>>({})

function castTier(s: SpellDef): number {
  if (s.tier === 0) return 0
  if (pact.value || reaver.value) return Math.max(s.tier, maxTier.value)
  return Math.max(s.tier, Math.min(maxTier.value, upcast[s.name] ?? s.tier))
}

const tiers = computed(() => {
  const groups = new Map<number, SpellDef[]>()
  for (const s of known.value) groups.set(s.tier, [...(groups.get(s.tier) ?? []), s])
  return [...groups.entries()].map(([tier, list]) => ({
    tier,
    label:
      tier === 0
        ? 'Cantrips · free'
        : reaver.value
          ? `Tier ${tier} · Shadow Exploit`
          : pact.value
            ? `Tier ${tier} · ${pact.value.name}`
            : `Tier ${tier} · ${tier} mana`,
    spells: list.map((s) => {
      const at = castTier(s)
      const actions = spellActions(s.cast)
      const acts = actions ? ` · ${actions} act` : ''
      const usesPact = !!pact.value && s.tier > 0
      const usesMinions = reaver.value && s.tier > 0
      const n = minionCost.value
      return {
        ...s,
        at,
        actions,
        usesPact,
        usesMinions,
        bloodLabel: usesMinions && bloodCast.value ? `Cast · 1 Wound${acts}` : '',
        canUpcast: !pact.value && !reaver.value && s.tier > 0 && maxTier.value > s.tier,
        short: !usesPact && !usesMinions && at > manaPool(sheet.value),
        busy: castingBlocks(sheet.value, actions),
        label:
          s.tier === 0
            ? `Cast · free${acts}`
            : usesMinions
              ? `Cast at tier ${at} · ${n} minion${n === 1 ? '' : 's'}${acts}`
              : usesPact
                ? `Cast at tier ${at} · 1 use${acts}`
                : `Cast · ${at} mana${acts}`,
      }
    }),
  }))
})

const schools = computed(() =>
  sheet.value.spells.schools.map((s) => SCHOOL_LABELS[s as SpellSchool] ?? s).join(' · '),
)
const help = computed(() =>
  reaver.value
    ? `Cut off from your patron: tiered spells are cast at your highest tier by sacrificing shadow minions (Shadow Exploit: 1, then 1 more for each spell cast that way this encounter)${bloodCast.value ? ' or by taking 1 Wound (My Blood, My Power)' : ''}. Cantrips cost nothing.`
    : pact.value
      ? `Tiered spells use ${pact.value.name} in place of mana; cantrips cost nothing. Save DC is 10+KEY. Multi-target and AoE spells do not miss or crit.`
      : SPELL_RULES,
)

function setUpcast(s: SpellDef, tier: number) {
  upcast[s.name] = Math.max(s.tier, Math.min(maxTier.value, tier))
}

function cast(s: (typeof tiers.value)[number]['spells'][number], withWound = false) {
  if (!canEdit.value || s.busy) return
  const notes: string[] = []
  if (s.tier === 0) notes.push(`Cast ${s.name} (cantrip).`)
  else if (s.usesMinions && withWound) {
    payBloodCast(sheet.value)
    notes.push(`Cast ${s.name} at tier ${s.at} · took 1 Wound (My Blood, My Power).`)
  } else if (s.usesMinions) {
    const n = payShadowExploit(sheet.value)
    notes.push(
      `Cast ${s.name} at tier ${s.at} · sacrifice ${n} shadow minion${n === 1 ? '' : 's'}.`,
    )
  } else if (s.usesPact) {
    const res = sheet.value.resource
    res.count += 1
    notes.push(`Cast ${s.name} at tier ${s.at}.`)
    if (res.count > pactLimit.value)
      notes.push(
        `Over your limit: your patron deals ${Math.floor(sheet.value.hpMax / 2)} damage to you.`,
      )
  } else {
    if (!spendMana(sheet.value, s.at)) return
    notes.push(`Cast ${s.name}${s.at > s.tier ? ` upcast to tier ${s.at}` : ''} · ${s.at} mana.`)
  }
  // Actions the turn can't cover carry over; Concentration starts once it is cast.
  const progress = castSpell(sheet.value, s.name, s.actions).trim()
  if (progress) notes.push(progress)
  if (sheet.value.dying) notes.push('Dying: DC 10 STR save or take 1 Wound.')
  say(notes.join(' '))
}
</script>

<template>
  <section class="panel stack" style="gap: 16px" aria-labelledby="sp-h">
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="sp-h">Spells</h2>
        <UiHelp label="About spells" :text="help" />
      </div>
      <span v-if="schools" class="small muted" style="font-size: 12px">{{ schools }}</span>
    </div>

    <div v-for="g in tiers" :key="g.tier" class="stack" style="gap: 8px">
      <div class="caps">{{ g.label }}</div>
      <div class="spell-grid">
        <details v-for="s in g.spells" :key="s.name" name="nimble-spell" class="tile spell">
          <summary class="spell__head">
            <strong>{{ s.name }}</strong>
            <span class="school" :class="`school--${s.school}`">{{ SCHOOL_LABELS[s.school] }}</span>
            <small>{{ s.cast }}</small>
          </summary>
          <div class="spell__body">
            <p><NimbleRulesText :text="s.desc" :key-value="keyValue" /></p>
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
                :disabled="!canEdit || s.short || s.busy"
                :title="
                  s.busy
                    ? `Still casting ${sheet.casting.spell}`
                    : s.short
                      ? 'Not enough mana'
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
                :disabled="!canEdit || s.busy"
                @click="cast(s, true)"
              >
                {{ s.bloodLabel }}
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
    <p v-if="!known.length" class="empty">No combat spells yet.</p>

    <div v-if="utility.length" class="stack" style="gap: 8px">
      <div class="caps">Utility spells</div>
      <details v-for="s in utility" :key="s.name" name="nimble-utility" class="tile utility">
        <summary>
          <strong>{{ s.name }}</strong>
          <span class="school" :class="`school--${s.school}`">{{ SCHOOL_LABELS[s.school] }}</span>
          <small>{{ s.cast }}</small>
        </summary>
        <p><NimbleRulesText :text="s.desc" :key-value="keyValue" /></p>
      </details>
    </div>
  </section>
</template>

<style scoped lang="scss">
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
