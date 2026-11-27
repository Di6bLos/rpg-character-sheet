<script setup lang="ts">
// The 5e sheet's Reactions, a panel of their own as on the Nimble and PF2e sheets: the
// Opportunity Attack (one melee attack when a creature leaves your reach, SRD 5.2.1 p. 15),
// reaction spells (Shield, Counterspell, Hellish Rebuke…) cast through useDnd5eCasting, and the
// hero's reaction features, feats and options (Uncanny Dodge, Parry, Riposte, Sentinel…). One
// Reaction a round, back at the start of your turn. Results nothing else claims show here.
// The logic is useDnd5eReactions, shared with the battle board's action tiles.
import { sign } from '~/utils/dice'
import { weaponAttack } from '~/utils/dnd5eAttacks'
import { levelName } from '~/utils/dnd5eSpells'
import { tipText } from '~/utils/ruleTips'

const {
  canEdit,
  resultFor,
  unclaimed,
  casting,
  typed,
  sheet,
  level,
  ready,
  melee,
  picked,
  oaWhy,
  opportunity,
  spells,
  own,
} = useDnd5eReactions()
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
      <div class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px">Opportunity Attack</strong>
          <span class="small muted"
            >One melee attack when a creature you can see leaves your reach.</span
          >
          <Dnd5eCostPill cost="reaction" />
        </div>
        <select
          v-if="melee.length > 1"
          v-model.number="picked"
          class="input input--sm"
          aria-label="Weapon for the Opportunity Attack"
        >
          <option v-for="(m, k) in melee" :key="m.i" :value="k">
            {{ m.w.name }}
            {{ sign(weaponAttack(sheet, level, m.w, m.def, { key: 'x' }).test.bonus) }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || !!oaWhy"
          @click="opportunity"
        >
          {{ oaWhy || 'Attack' }}
        </button>
        <NimbleDiceEntry
          v-if="typed.prompt('rea:oa')"
          :label="typed.prompt('rea:oa')"
          action="Roll"
          :disabled="!canEdit"
          @submit="typed.submit"
        />
        <p v-if="resultFor('rea:oa')" class="roll-status" role="status">
          {{ resultFor('rea:oa') }}
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
      <Dnd5eEntryCard v-for="e in own" :key="e.key" :entry="e" />
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
