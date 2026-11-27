<script setup lang="ts">
// The 5e sheet's Reactions, a panel of their own as on the Nimble and PF2e sheets: the
// Opportunity Attack (one melee attack when a creature leaves your reach, SRD 5.2.1 p. 15) and
// the other reaction attacks (Riposte with its die, Retaliation, Soul of Vengeance…) with the
// hero's automatic riders; what meets an attack before it's known to hit (Defensive Duelist,
// Combat Inspiration, a Luck Point; utils/dnd5eDefense.ts); reaction spells (Shield,
// Counterspell, Hellish Rebuke…) cast through useDnd5eCasting; and the hero's other reaction
// features, feats and options (Cutting Words, Warding Flare…). Reactions that cut a hit's
// damage (Uncanny Dodge, Parry…) sit beside Hit points instead. One Reaction a round, back at
// the start of your turn. Results nothing else claims show here.
import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome, sign } from '~/utils/dice'
import { rollAttack5e, weaponAttack, weaponDef } from '~/utils/dnd5eAttacks'
import {
  DND5E_GUARDS,
  type Dnd5eReactionAttack,
  acReactions,
  reactionAttacks,
  useAcReaction,
} from '~/utils/dnd5eDefense'
import { attackRiders, defaultRiders, riderPlan } from '~/utils/dnd5eRiders'
import { payCost, spendUses } from '~/utils/dnd5ePlay'
import { levelName } from '~/utils/dnd5eSpells'
import { tipText } from '~/utils/ruleTips'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultFor, unclaimed } = useResultOwner()
const { data, columns, entries, target, attackMode } = useDnd5eSheet()
const casting = useDnd5eCasting()
const typed = useTypedRoll()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const ready = computed(() => sheet.value.turn?.reaction !== false)

const weapons = computed(() =>
  sheet.value.weapons.map((w, i) => {
    const def = weaponDef(w, data.value?.weapons ?? [])
    const ranged = def ? def.type === 'Ranged' : /\d+\s*\/\s*\d+/.test(w.range)
    return { w, i, def, ranged }
  }),
)
const attacks = computed(() => reactionAttacks(sheet.value, level.value))
const picked = ref<Record<string, number>>({})
const usable = (r: Dnd5eReactionAttack) => weapons.value.filter((x) => x.ranged === !!r.ranged)
const why = (r: Dnd5eReactionAttack) =>
  usable(r).length ? r.why : r.ranged ? 'No ranged weapon' : 'No melee weapon'

/** One attack as a Reaction: Riposte adds its Superiority Die, the hero's auto riders ride along. */
function reactionAttack(r: Dnd5eReactionAttack) {
  const list = usable(r)
  const m = list.find((x) => x.i === picked.value[r.key]) ?? list[0]
  const key = `rea:${r.key}`
  if (!canEdit.value || !m || why(r)) return
  const plan = weaponAttack(sheet.value, level.value, m.w, m.def, {
    key,
    target: target.value,
    columns: columns.value,
  })
  typed.run(key, r.name, () => {
    payCost(sheet.value, level.value, 'reaction')
    if (r.spend) spendUses(sheet.value, r.spend)
    const ctx = { columns: columns.value, mode: attackMode.value }
    const riders = riderPlan(
      sheet.value,
      level.value,
      plan,
      defaultRiders(attackRiders(sheet.value, level.value, plan, ctx)),
      ctx,
    )
    if (r.dice) riders.parts.push({ dice: r.dice, type: plan.type, label: r.name })
    const res = rollAttack5e(
      sheet.value,
      { ...plan, name: `${r.name} (${m.w.name})` },
      { mode: attackMode.value, target: target.value, riders },
    )
    claim(key, () => say(res.line))
    showOutcome({ label: r.name, total: res.damage, detail: res.line })
  })
  attackMode.value = 'normal'
}

const spells = computed(() =>
  casting.spells.value.filter((r) => !r.book && casting.defOf(r.slug)?.activation === 'reaction'),
)
const own = computed(() => entries.value.filter((e) => e.cost === 'reaction'))
const guardNames = new Set([
  ...DND5E_GUARDS.map((g) => g.name),
  'Riposte',
  'Retaliation',
  'Soul of Vengeance',
  'Bloodthirst',
  'Masterful Shots',
])
const shown = computed(() =>
  own.value.filter((e) => !guardNames.has(e.name.split(': ').pop() ?? e.name)),
)
const meet = computed(() => acReactions(sheet.value, level.value))
const meetResult = computed(() => meet.value.map((m) => resultFor(`rea:${m.key}`)).find(Boolean))

function meetAttack(key: string) {
  if (canEdit.value) claim(`rea:${key}`, () => say(useAcReaction(sheet.value, level.value, key)))
}
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="rea-h">
    <UiFold name="Reactions" :open="!sheet.turn?.active" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="rea-h">Reactions</h2>
        <UiHelp
          label="About reactions"
          text="One Reaction a round, on any turn, when its trigger happens; it comes back at the start of your turn (SRD 5.2.1 p. 13). Using one here, a reaction spell, Uncanny Dodge beside Hit points or an Opportunity Attack spends it; the Turn panel's ↺ shows it and gives it back."
        />
      </div>
      <span class="small" :class="ready ? 'rea-ready' : 'muted'">{{
        ready ? 'Reaction ready' : 'Reaction used'
      }}</span>
    </div>
    <div class="rows">
      <div v-for="r in attacks" :key="r.key" class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px">{{ r.name }}</strong>
          <span class="small muted">{{ r.note }}</span>
          <span class="row" style="gap: 6px">
            <Dnd5eCostPill cost="reaction" />
            <small v-if="r.spend" class="muted"
              >1 {{ r.spend }}{{ r.dice ? ` (+${r.dice})` : '' }}</small
            >
          </span>
        </div>
        <select
          v-if="usable(r).length > 1"
          class="input input--sm"
          :aria-label="`Weapon for ${r.name}`"
          :value="picked[r.key] ?? usable(r)[0]?.i"
          @change="
            picked = { ...picked, [r.key]: Number(($event.target as HTMLSelectElement).value) }
          "
        >
          <option v-for="m in usable(r)" :key="m.i" :value="m.i">
            {{ m.w.name }}
            {{ sign(weaponAttack(sheet, level, m.w, m.def, { key: 'x' }).test.bonus) }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || !!why(r)"
          @click="reactionAttack(r)"
        >
          {{ why(r) || 'Attack' }}
        </button>
        <NimbleDiceEntry
          v-if="typed.prompt(`rea:${r.key}`)"
          :label="typed.prompt(`rea:${r.key}`)"
          action="Roll"
          :disabled="!canEdit"
          @submit="typed.submit"
        />
        <p v-if="resultFor(`rea:${r.key}`)" class="roll-status" role="status">
          {{ resultFor(`rea:${r.key}`) }}
        </p>
      </div>
      <div v-for="r in spells" :key="r.slug" class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px"
            ><SheetRuleTip
              :title="r.name"
              :text="tipText(casting.defOf(r.slug)?.text ?? casting.defOf(r.slug)?.summary ?? '')"
              >{{ r.name }}</SheetRuleTip
            ></strong
          >
          <span class="small muted"
            >{{ levelName(r.level) }} · {{ casting.defOf(r.slug)?.trigger }}</span
          >
          <Dnd5eCostPill cost="reaction" />
        </div>
        <select
          v-if="casting.options(r).length > 1"
          class="input input--sm"
          :aria-label="`Cast ${r.name} with`"
          :value="casting.option(r)?.key"
          @change="casting.choose(r, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in casting.options(r)" :key="o.key" :value="o.key">
            {{ o.label }}{{ o.left !== undefined ? ` (${o.left} left)` : '' }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || !!casting.why(r)"
          @click="casting.cast(r)"
        >
          {{ casting.why(r) || 'Cast' }}
        </button>
        <p v-if="resultFor(`spell:${r.slug}`)" class="roll-status" role="status">
          {{ resultFor(`spell:${r.slug}`) }}
        </p>
      </div>
      <div v-if="meet.length" class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px">When an attack comes at you</strong>
          <span class="small muted"
            >Before you know it hits: more AC against it, or Disadvantage on it. Reactions that cut
            the damage are beside Hit points.</span
          >
        </div>
        <div class="row" style="gap: 6px; flex-wrap: wrap">
          <button
            v-for="m in meet"
            :key="m.key"
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || !!m.why"
            :title="m.why ? `${m.why}\n${m.note}` : m.note"
            @click="meetAttack(m.key)"
          >
            {{ m.name }}{{ m.ac ? ` +${m.ac}` : '' }}
          </button>
        </div>
        <p v-if="meetResult" class="roll-status" role="status">{{ meetResult }}</p>
      </div>
      <Dnd5eEntryCard v-for="e in shown" :key="e.key" :entry="e" />
    </div>
    <p v-if="unclaimed" class="roll-status" role="status" aria-live="polite">{{ unclaimed }}</p>
  </section>
</template>

<style scoped lang="scss">
.rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.attack {
  gap: 8px;
  padding: 14px;
}

.rea-ready {
  font-weight: 700;
  color: var(--accent-text);
}
</style>
