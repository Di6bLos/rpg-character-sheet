<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'Reports · Lantern admin' })

const admin = useAdminStore()
const snackbar = useSnackbarStore()

onMounted(async () => {
  try {
    await admin.load()
  } catch (err) {
    snackbar.error(err, 'Could not load reports')
  }
})
</script>

<template>
  <div class="page" style="max-width: 1100px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>Reports</h1>
        <p>
          Files players flagged. Open one to check it, then dismiss the report or remove the file.
        </p>
      </div>
    </header>
    <AdminReportsQueue />
  </div>
</template>
