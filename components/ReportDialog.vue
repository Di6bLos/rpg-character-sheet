<script setup lang="ts">
// Flags an uploaded file for the moderators' review queue.
import { supabase } from '~/lib/supabase'
import type { Report } from '~/types'

export type ReportTarget = Pick<
  Report,
  'target_type' | 'target_id' | 'bucket' | 'file_path' | 'file_name' | 'where_label' | 'uploader_id'
>

const props = defineProps<{ target: ReportTarget | null }>()
const emit = defineEmits<{ close: [] }>()

const snackbar = useSnackbarStore()
const REASONS = ['Explicit imagery', 'Harassment', 'Spam', 'Other']
const reason = ref(REASONS[0]!)
const detail = ref('')
const sending = ref(false)

const open = computed({
  get: () => props.target !== null,
  set: (value) => {
    if (!value) emit('close')
  },
})

watch(
  () => props.target,
  () => {
    reason.value = REASONS[0]!
    detail.value = ''
  },
)

async function submit() {
  if (!props.target) return
  sending.value = true
  const text = detail.value.trim() ? `${reason.value}: ${detail.value.trim()}` : reason.value
  const { error } = await supabase
    .from('reports')
    // The server fills in the file details from the target itself (see the
    // reports_fill_details trigger); only the choice and the reason come from here.
    .insert({
      target_type: props.target.target_type,
      target_id: props.target.target_id,
      reason: text.slice(0, 200),
    })
  sending.value = false
  if (error?.code === '23505') snackbar.show('You already reported this file', 'info')
  else if (error) return snackbar.error(error, 'Could not send the report')
  else snackbar.show('Thanks. A moderator will review it.')
  emit('close')
}
</script>

<template>
  <UiDialog v-model="open" title="Report this file" width="480px">
    <form class="stack" @submit.prevent="submit">
      <p class="small" style="color: var(--page-soft)">
        <strong>{{ target?.file_name }}</strong> will be sent to the moderators. The uploader isn’t
        told who reported it.
      </p>
      <div class="field">
        <label for="report-reason">Reason</label>
        <select id="report-reason" v-model="reason" class="input">
          <option v-for="r in REASONS" :key="r">{{ r }}</option>
        </select>
      </div>
      <div class="field">
        <label for="report-detail">Anything else? (optional)</label>
        <textarea
          id="report-detail"
          v-model="detail"
          class="input"
          rows="2"
          style="min-height: 0"
          maxlength="160"
        />
      </div>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="btn btn--ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn" :disabled="sending">
          {{ sending ? 'Sending…' : 'Send report' }}
        </button>
      </div>
    </form>
  </UiDialog>
</template>
