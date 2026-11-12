<script setup lang="ts">
import type {
  ModerationEvent,
  PermissionFlag,
  RestrictionReason,
  StaffUser,
  UserRole,
} from '~/types'
import { shortDate } from '~/utils/format'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'Users · Lantern admin' })

const auth = useAuthStore()
const admin = useAdminStore()
const snackbar = useSnackbarStore()

const filter = ref<'all' | 'restricted' | 'suspended' | 'staff'>('all')
const q = ref('')
const selectedId = ref<string | null>(null)
const history = ref<ModerationEvent[]>([])
const busy = ref(false)

const REASONS: RestrictionReason[] = ['Explicit content', 'Harassment', 'Spam', 'Other']
const PERMISSIONS: { flag: PermissionFlag; label: string }[] = [
  { flag: 'can_create_campaigns', label: 'Create campaigns' },
  { flag: 'can_upload_documents', label: 'Upload documents & images' },
  { flag: 'can_post_journal', label: 'Post to campaign journals' },
  { flag: 'can_send_messages', label: 'Send messages' },
]

onMounted(async () => {
  try {
    await admin.load()
  } catch (err) {
    snackbar.error(err, 'Could not load users')
  }
})

function isRestricted(u: StaffUser) {
  return !(
    u.can_create_campaigns &&
    u.can_upload_documents &&
    u.can_post_journal &&
    u.can_send_messages
  )
}
function statusOf(u: StaffUser) {
  return u.suspended ? 'suspended' : isRestricted(u) ? 'restricted' : 'active'
}
/** Moderators can act on members only; nobody acts on themselves. */
function canModerate(u: StaffUser) {
  return u.id !== auth.userId && (auth.isAdmin || u.role === 'member')
}

const stats = computed(() => [
  { label: 'Members', value: admin.users.length },
  { label: 'Restricted', value: admin.users.filter((u) => !u.suspended && isRestricted(u)).length },
  { label: 'Suspended', value: admin.users.filter((u) => u.suspended).length },
  { label: 'Open reports', value: admin.groups().length },
])

const filters = computed(() => [
  { id: 'all' as const, label: 'All' },
  { id: 'restricted' as const, label: 'Restricted' },
  { id: 'suspended' as const, label: 'Suspended' },
  { id: 'staff' as const, label: 'Staff' },
])

const shown = computed(() => {
  const term = q.value.trim().toLowerCase()
  return admin.users.filter((u) => {
    if (filter.value === 'restricted' && !(isRestricted(u) && !u.suspended)) return false
    if (filter.value === 'suspended' && !u.suspended) return false
    if (filter.value === 'staff' && u.role === 'member') return false
    return (
      !term ||
      u.display_name.toLowerCase().includes(term) ||
      u.handle.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    )
  })
})

const detail = computed(() => admin.users.find((u) => u.id === selectedId.value) ?? null)

async function loadHistory() {
  history.value = detail.value ? await admin.history(detail.value.id).catch(() => []) : []
}
watch(selectedId, loadHistory)

async function run(action: () => Promise<void>, done: string) {
  busy.value = true
  try {
    await action()
    await loadHistory()
    snackbar.show(done)
  } catch (err) {
    snackbar.error(err, 'Could not save the change')
  } finally {
    busy.value = false
  }
}

function setFlag(u: StaffUser, flag: PermissionFlag, value: boolean) {
  void run(
    () => admin.setPermission(u.id, flag, value, value ? null : (u.restriction_reason ?? 'Other')),
    `${u.display_name}: permission ${value ? 'restored' : 'turned off'}`,
  )
}

function setRole(u: StaffUser, event: Event) {
  const role = (event.target as HTMLSelectElement).value as UserRole
  void run(() => admin.setRole(u.id, role), `${u.display_name} is now ${role}`)
}

function setReason(u: StaffUser, event: Event) {
  const reason = (event.target as HTMLSelectElement).value as RestrictionReason | ''
  void run(() => admin.setReason(u.id, reason), 'Restriction reason updated')
}

const suspendOpen = ref(false)
function confirmSuspend() {
  const u = detail.value
  suspendOpen.value = false
  if (!u) return
  void run(
    () => admin.setSuspended(u.id, !u.suspended),
    u.suspended ? `${u.display_name}’s suspension was lifted` : `${u.display_name} was suspended`,
  )
}
</script>

<template>
  <div class="page" style="max-width: 1320px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>User management</h1>
        <p>Assign roles, review reports and limit what an account can do.</p>
      </div>
    </header>

    <div class="stats">
      <div v-for="s in stats" :key="s.label" class="panel stat">
        <div class="eyebrow">{{ s.label }}</div>
        <div class="stat__v">{{ s.value }}</div>
      </div>
    </div>

    <AdminSiteFeatures />

    <AdminReportsQueue />

    <div class="split">
      <section class="panel panel--flush users" aria-labelledby="users-h">
        <div class="head">
          <h2 id="users-h">Users</h2>
          <div class="row" style="gap: 8px">
            <div class="chips" role="group" aria-label="Filter users">
              <button
                v-for="f in filters"
                :key="f.id"
                type="button"
                class="chip"
                :aria-pressed="filter === f.id"
                @click="filter = f.id"
              >
                {{ f.label }}
              </button>
            </div>
            <label for="user-q" class="sr-only">Search users</label>
            <input
              id="user-q"
              v-model="q"
              class="input"
              type="search"
              placeholder="Search users"
              style="width: 200px"
            />
          </div>
        </div>
        <div
          v-if="admin.loading && !admin.users.length"
          class="spinner"
          role="status"
          aria-label="Loading users"
        />
        <div
          v-else
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Table, scroll sideways for more"
        >
          <table class="table" style="min-width: 680px; font-size: 14px">
            <thead>
              <tr>
                <th scope="col" style="padding-left: 20px">User</th>
                <th scope="col">Role</th>
                <th scope="col">Create campaigns</th>
                <th scope="col">Upload docs</th>
                <th scope="col">Status</th>
                <th scope="col" style="text-align: right; padding-right: 20px">Manage</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in shown" :key="u.id" :class="{ 'is-selected': u.id === selectedId }">
                <td style="padding-left: 20px">
                  <div class="row" style="flex-wrap: nowrap">
                    <span class="avatar">{{ (u.display_name[0] ?? '?').toUpperCase() }}</span>
                    <div class="stack" style="gap: 0; min-width: 0">
                      <strong
                        >{{ u.display_name }}{{ u.id === auth.userId ? ' (you)' : '' }}</strong
                      >
                      <span class="small muted" style="font-size: 12px">
                        @{{ u.handle
                        }}{{
                          u.open_reports
                            ? ` · ${u.open_reports} open report${u.open_reports === 1 ? '' : 's'}`
                            : ''
                        }}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <select
                    class="input role"
                    :value="u.role"
                    :aria-label="`Role for ${u.display_name}`"
                    :disabled="busy || !auth.isAdmin || u.id === auth.userId"
                    @change="setRole(u, $event)"
                  >
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="member">Member</option>
                  </select>
                </td>
                <td>
                  <UiSwitch
                    :model-value="u.can_create_campaigns"
                    :label="`${u.display_name} can create campaigns`"
                    hide-label
                    :disabled="busy || !canModerate(u)"
                    @update:model-value="setFlag(u, 'can_create_campaigns', $event)"
                  />
                </td>
                <td>
                  <UiSwitch
                    :model-value="u.can_upload_documents"
                    :label="`${u.display_name} can upload documents`"
                    hide-label
                    :disabled="busy || !canModerate(u)"
                    @update:model-value="setFlag(u, 'can_upload_documents', $event)"
                  />
                </td>
                <td>
                  <span
                    class="badge"
                    :class="`badge--${statusOf(u)}`"
                    style="text-transform: capitalize"
                    >{{ statusOf(u) }}</span
                  >
                </td>
                <td style="text-align: right; padding-right: 20px">
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :aria-pressed="u.id === selectedId"
                    @click="selectedId = u.id"
                  >
                    Manage
                  </button>
                </td>
              </tr>
              <tr v-if="!shown.length">
                <td colspan="6" class="muted" style="padding: 24px 20px">No users match.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside v-if="detail" class="panel detail" :aria-label="`Manage ${detail.display_name}`">
        <div class="row" style="flex-wrap: nowrap">
          <span class="avatar" style="width: 48px; height: 48px; font-size: 18px">{{
            (detail.display_name[0] ?? '?').toUpperCase()
          }}</span>
          <div class="stack grow" style="gap: 0">
            <strong style="font-size: 18px">{{ detail.display_name }}</strong>
            <span class="small muted" style="font-size: 13px"
              >@{{ detail.handle }} · joined {{ shortDate(detail.created_at) }}</span
            >
            <span class="small muted" style="font-size: 13px; overflow-wrap: anywhere">{{
              detail.email
            }}</span>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--icon"
            aria-label="Close panel"
            @click="selectedId = null"
          >
            ×
          </button>
        </div>
        <div class="counts">
          <div>
            <strong>{{ detail.campaigns }}</strong
            ><span>Campaigns</span>
          </div>
          <div>
            <strong>{{ detail.uploads }}</strong
            ><span>Uploads</span>
          </div>
          <div>
            <strong>{{ detail.open_reports }}</strong
            ><span>Reports</span>
          </div>
        </div>

        <p v-if="!canModerate(detail)" class="notice">
          {{
            detail.id === auth.userId
              ? 'You can’t change your own permissions.'
              : 'Only an admin can moderate staff accounts.'
          }}
        </p>

        <div class="stack" style="gap: 4px">
          <div class="caps">Permissions</div>
          <UiSwitch
            v-for="p in PERMISSIONS"
            :key="p.flag"
            :model-value="detail[p.flag]"
            :label="p.label"
            :disabled="busy || !canModerate(detail)"
            @update:model-value="setFlag(detail, p.flag, $event)"
          />
        </div>

        <div class="field">
          <label for="reason">Restriction reason</label>
          <select
            id="reason"
            class="input"
            :value="detail.restriction_reason ?? ''"
            :disabled="busy || !canModerate(detail)"
            @change="setReason(detail, $event)"
          >
            <option value="">None</option>
            <option v-for="r in REASONS" :key="r">{{ r }}</option>
          </select>
          <span class="hint">The user sees this reason where the restricted action would be.</span>
        </div>

        <div class="stack" style="gap: 8px">
          <div class="caps">Moderation history</div>
          <p v-if="!history.length" class="small muted">No actions yet.</p>
          <div v-for="h in history" :key="h.id" class="history">
            <span>{{ shortDate(h.created_at) }}</span>
            <span>{{ h.action }}</span>
          </div>
        </div>

        <button
          v-if="auth.isAdmin && detail.id !== auth.userId"
          type="button"
          class="btn btn--block"
          :class="detail.suspended ? 'btn--ghost' : 'btn--danger'"
          :disabled="busy"
          @click="suspendOpen = true"
        >
          {{ detail.suspended ? 'Lift suspension' : 'Suspend account' }}
        </button>
      </aside>
    </div>

    <p class="legend small muted">
      <strong>Admin</strong> manages everything. <strong>Moderator</strong> reviews reports and
      restricts members. <strong>Member</strong> plays and, if allowed, runs campaigns. Game Master
      is set per campaign, not here.
    </p>

    <UiDialog
      v-model="suspendOpen"
      :title="
        detail?.suspended
          ? `Lift ${detail?.display_name}’s suspension?`
          : `Suspend ${detail?.display_name}?`
      "
      alert
      width="460px"
    >
      <p v-if="detail?.suspended">
        They’ll be able to make changes again, within their permissions.
      </p>
      <p v-else>
        They can still sign in and read their content, but can’t create, edit, upload, post or join
        anything.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="suspendOpen = false">Cancel</button>
        <button
          type="button"
          class="btn"
          :class="{ 'btn--danger': !detail?.suspended }"
          @click="confirmSuspend"
        >
          {{ detail?.suspended ? 'Lift suspension' : 'Suspend account' }}
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.stat {
  padding: 18px 20px;
}

.stat__v {
  font-family: var(--font-heading);
  font-size: 32px;
  font-weight: 700;
  margin-top: 4px;
}

.split {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.users {
  flex: 999 1 600px;
  min-width: 0;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);

  h2 {
    font-size: 20px;
  }
}

tr.is-selected td {
  background: var(--accent-tint);
}

.role {
  min-width: 118px;
  width: auto;
}

.detail {
  flex: 1 1 340px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 24px;
}

.counts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 6px;
    border-radius: min(var(--radius-panel), 10px);
    background: var(--field);
    border: 1px solid var(--line);
  }

  strong {
    font-size: 20px;
  }

  span {
    font-size: 12px;
    color: var(--page-muted);
  }
}

.history {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 10px;
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px solid var(--track);

  span:first-child {
    color: var(--page-muted);
  }
}

.legend strong {
  color: var(--page-text);
}

@media (max-width: 1000px) {
  .detail {
    position: static;
  }
}
</style>
