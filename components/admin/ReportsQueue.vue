<script setup lang="ts">
import type { ReportGroup } from '~/stores/admin'
import { plural, timeAgo } from '~/utils/format'

const admin = useAdminStore()
const snackbar = useSnackbarStore()
const busy = ref<string | null>(null)

const groups = computed(() => admin.groups())

async function act(group: ReportGroup, action: 'dismiss' | 'remove' | 'remove_restrict') {
  busy.value = group.key
  try {
    await admin.resolve(group, action)
    snackbar.show(
      action === 'dismiss'
        ? 'Report dismissed'
        : action === 'remove'
          ? 'File removed'
          : 'File removed and uploads restricted',
    )
  } catch (err) {
    snackbar.error(err, 'Could not resolve the report')
  } finally {
    busy.value = null
  }
}

async function view(group: ReportGroup) {
  if (!(await openFile(group.first.bucket, group.first.file_path))) {
    snackbar.show('Could not open the file', 'error')
  }
}
</script>

<template>
  <section class="panel panel--flush" aria-labelledby="rep-h">
    <div class="head">
      <h2 id="rep-h">Reported uploads</h2>
      <span class="small muted">Flagged by players for review</span>
    </div>
    <p v-if="!groups.length" class="none">No open reports.</p>
    <article v-for="g in groups" :key="g.key" class="report">
      <div class="report__body">
        <div>
          <button type="button" class="report__file" @click="view(g)">
            {{ g.first.file_name }}
          </button>
          <span class="muted"> in {{ g.first.where_label }}</span>
        </div>
        <div class="small" style="color: var(--page-soft)">
          Uploaded by
          <strong>@{{ g.first.uploader?.handle ?? 'deleted user' }}</strong>
          · {{ g.reasons.join('; ') }} · reported by {{ plural(g.reporters, 'player') }} ·
          {{ timeAgo(g.first.created_at) }}
        </div>
      </div>
      <div class="row" style="gap: 8px">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="busy === g.key"
          @click="act(g, 'dismiss')"
        >
          Dismiss
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="busy === g.key"
          @click="act(g, 'remove')"
        >
          Remove file
        </button>
        <button
          type="button"
          class="btn btn--danger btn--sm"
          :disabled="busy === g.key || !g.first.uploader_id"
          @click="act(g, 'remove_restrict')"
        >
          Remove &amp; restrict uploads
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped lang="scss">
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);

  h2 {
    font-size: 20px;
  }
}

.none {
  padding: 20px;
  color: var(--page-muted);
}

.report {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--track);

  &:last-child {
    border-bottom: 0;
  }
}

.report__body {
  flex: 1 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.report__file {
  padding: 0;
  border: 0;
  background: none;
  color: var(--page-text);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
  text-align: left;
}
</style>
