<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppBar from '~/components/AppBar.vue'
import PdfViewer from '~/components/PdfViewer.vue'
import { useAdminStore } from '~/stores/admin'
import { useDocumentStore } from '~/stores/document'
import { useAuthStore } from '~/stores/auth'
import { useSnackbarStore } from '~/stores/snackbar'
import type { AdminProfile, Group, DocumentFile } from '~/types'

definePageMeta({ middleware: [] })
useHead({ title: 'Admin' })

const adminStore = useAdminStore()
const documentStore = useDocumentStore()
const authStore = useAuthStore()
const snackbar = useSnackbarStore()

const activeTab = ref('users')

// ── Admin login ────────────────────────────────────────────────────────────────
const loginEmail = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const showPassword = ref(false)

async function handleAdminLogin() {
    loginError.value = ''
    loginLoading.value = true
    try {
        await authStore.login(loginEmail.value, loginPassword.value)
        await loadAdminData()
    } catch (e) {
        loginError.value = e instanceof Error ? e.message : 'Invalid email or password.'
    } finally {
        loginLoading.value = false
    }
}

// ── Users tab ─────────────────────────────────────────────────────────────────
const groupFilter = ref<string[]>([])

const filteredProfiles = computed(() => {
    if (groupFilter.value.length === 0) return adminStore.allProfiles
    return adminStore.allProfiles.filter((p) =>
        p.groups.some((g) => groupFilter.value.includes(g.id)),
    )
})

const userHeaders = [
    { title: 'User', key: 'display_name', sortable: true },
    { title: 'Status', key: 'is_active', sortable: false },
    { title: 'Groups', key: 'groups', sortable: false },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// Invite user dialog
const inviteDialog = ref(false)
const inviteEmail = ref('')
const inviting = ref(false)

function openInviteDialog() {
    inviteEmail.value = ''
    inviteDialog.value = true
}

async function confirmInvite() {
    if (!inviteEmail.value) return
    inviting.value = true
    try {
        await adminStore.inviteUser(inviteEmail.value)
        inviteDialog.value = false
        snackbar.show('Invitation sent', 'success')
    } catch {
        snackbar.show('Failed to send invitation', 'error')
    } finally {
        inviting.value = false
    }
}

// Delete user dialog
const deleteUserDialog = ref(false)
const userToDelete = ref<AdminProfile | null>(null)
const deletingUser = ref(false)

function openDeleteUserDialog(profile: AdminProfile) {
    userToDelete.value = profile
    deleteUserDialog.value = true
}

async function confirmDeleteUser() {
    if (!userToDelete.value) return
    deletingUser.value = true
    try {
        await adminStore.deleteUser(userToDelete.value.id)
        snackbar.show('User deleted', 'success')
        deleteUserDialog.value = false
        userToDelete.value = null
    } catch {
        snackbar.show('Failed to delete user', 'error')
    } finally {
        deletingUser.value = false
    }
}

async function toggleActive(profile: AdminProfile) {
    try {
        if (profile.is_active) {
            await adminStore.deactivateUser(profile.id)
            snackbar.show('User deactivated', 'success')
        } else {
            await adminStore.reactivateUser(profile.id)
            snackbar.show('User reactivated', 'success')
        }
    } catch {
        snackbar.show('Failed to update user status', 'error')
    }
}

// Group management dialog
const groupsDialog = ref(false)
const newGroupName = ref('')
const creatingGroup = ref(false)

async function createGroup() {
    if (!newGroupName.value.trim()) return
    creatingGroup.value = true
    try {
        await adminStore.createGroup(newGroupName.value.trim())
        newGroupName.value = ''
        snackbar.show('Group created', 'success')
    } catch {
        snackbar.show('Failed to create group', 'error')
    } finally {
        creatingGroup.value = false
    }
}

async function removeGroup(group: Group) {
    try {
        await adminStore.deleteGroup(group.id)
        snackbar.show(`Group "${group.name}" deleted`, 'success')
    } catch {
        snackbar.show('Failed to delete group', 'error')
    }
}

async function toggleUserGroup(profile: AdminProfile, group: Group) {
    const inGroup = profile.groups.some((g) => g.id === group.id)
    try {
        if (inGroup) {
            await adminStore.removeUserFromGroup(profile.id, group.id)
        } else {
            await adminStore.assignUserToGroup(profile.id, group.id)
        }
    } catch {
        snackbar.show('Failed to update group membership', 'error')
    }
}

function isInGroup(profile: AdminProfile, groupId: string) {
    return profile.groups.some((g) => g.id === groupId)
}

// ── Documents tab ──────────────────────────────────────────────────────────────
const uploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadSizeError = ref('')
const deleteDocDialog = ref(false)
const docToDelete = ref<DocumentFile | null>(null)
const viewerDialog = ref(false)
const viewerUrl = ref('')
const viewerFilename = ref('')

const MAX_FILE_SIZE = 50 * 1024 * 1024

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString()
}

function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'mdi-file-pdf-box'
    if (ext === 'doc' || ext === 'docx') return 'mdi-file-word'
    if (ext === 'xls' || ext === 'xlsx') return 'mdi-file-excel'
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') return 'mdi-file-image'
    return 'mdi-file'
}

function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    uploadFile.value = input.files?.[0] ?? null
    uploadSizeError.value =
        uploadFile.value && uploadFile.value.size > MAX_FILE_SIZE
            ? 'File exceeds the 50 MB limit'
            : ''
}

function openUploadDialog() {
    uploadFile.value = null
    uploadSizeError.value = ''
    uploadDialog.value = true
}

async function confirmUpload() {
    if (!uploadFile.value) return
    if (uploadFile.value.size > MAX_FILE_SIZE) {
        uploadSizeError.value = 'File exceeds the 50 MB limit'
        return
    }
    uploading.value = true
    try {
        await documentStore.uploadDocument(uploadFile.value)
        uploadDialog.value = false
        snackbar.show('Document uploaded', 'success')
    } catch {
        snackbar.show('Upload failed', 'error')
    } finally {
        uploading.value = false
    }
}

async function downloadDoc(path: string, name: string) {
    try {
        await documentStore.downloadDocument(path, name)
    } catch {
        snackbar.show('Download failed', 'error')
    }
}

async function openDocument(doc: DocumentFile) {
    const ext = doc.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
        try {
            viewerUrl.value = await documentStore.getSignedUrl(doc.path)
            viewerFilename.value = doc.displayName
            viewerDialog.value = true
        } catch {
            snackbar.show('Failed to open document', 'error')
        }
    } else {
        await downloadDoc(doc.path, doc.name)
    }
}

function openDeleteDocDialog(doc: DocumentFile) {
    docToDelete.value = doc
    deleteDocDialog.value = true
}

async function confirmDeleteDoc() {
    if (!docToDelete.value) return
    try {
        await documentStore.deleteDocument(docToDelete.value.path)
        snackbar.show('Document deleted', 'success')
    } catch {
        snackbar.show('Delete failed', 'error')
    } finally {
        deleteDocDialog.value = false
        docToDelete.value = null
    }
}

// ── Inbox tab ──────────────────────────────────────────────────────────────────
const categoryFilter = ref<string>('all')

const categoryOptions = [
    { title: 'All', value: 'all' },
    { title: 'Comment', value: 'comment' },
    { title: 'Bug', value: 'bug' },
    { title: 'Feature Request', value: 'feature_request' },
]

const filteredFeedback = computed(() => {
    if (categoryFilter.value === 'all') return adminStore.feedback
    return adminStore.feedback.filter((f) => f.category === categoryFilter.value)
})

const feedbackHeaders = [
    { title: 'Category', key: 'category', sortable: true },
    { title: 'Message', key: 'message', sortable: false },
    { title: 'Date', key: 'created_at', sortable: true },
]

function categoryColor(category: string): string {
    if (category === 'bug') return 'error'
    if (category === 'feature_request') return 'warning'
    return 'info'
}

function categoryLabel(category: string): string {
    if (category === 'bug') return 'Bug'
    if (category === 'feature_request') return 'Feature Request'
    return 'Comment'
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function loadAdminData() {
    await Promise.all([
        adminStore.fetchAllProfiles(),
        adminStore.fetchGroups(),
        adminStore.fetchFeedback(),
        documentStore.fetchDocuments(),
    ])
}

onMounted(async () => {
    if (authStore.isAuthenticated && authStore.isAdmin) {
        await loadAdminData()
    }
})
</script>

<template>
    <!-- ── Admin login ── -->
    <template v-if="!authStore.isAuthenticated">
        <v-main>
            <v-container class="d-flex align-center justify-center" style="min-height: 100vh">
                <v-card width="400" elevation="4">
                    <v-card-title class="d-flex align-center gap-2 pt-6 px-6">
                        <v-icon color="primary" size="28">mdi-shield-crown</v-icon>
                        <span class="text-h6">Admin Login</span>
                    </v-card-title>
                    <v-card-text class="px-6 pb-2">
                        <v-alert
                            v-if="loginError"
                            type="error"
                            class="mb-4"
                            :text="loginError"
                            density="compact"
                        />
                        <v-text-field
                            v-model="loginEmail"
                            label="Email"
                            type="email"
                            variant="outlined"
                            class="mb-3"
                            autocomplete="email"
                            @keyup.enter="handleAdminLogin"
                        />
                        <v-text-field
                            v-model="loginPassword"
                            label="Password"
                            :type="showPassword ? 'text' : 'password'"
                            variant="outlined"
                            autocomplete="current-password"
                            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                            @click:append-inner="showPassword = !showPassword"
                            @keyup.enter="handleAdminLogin"
                        />
                    </v-card-text>
                    <v-card-actions class="px-6 pb-6">
                        <v-btn
                            color="primary"
                            variant="flat"
                            block
                            size="large"
                            :loading="loginLoading"
                            :disabled="!loginEmail || !loginPassword"
                            @click="handleAdminLogin"
                        >
                            Sign In
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-container>
        </v-main>
    </template>

    <!-- ── Admin dashboard ── -->
    <template v-else>
    <AppBar />
    <v-main>
        <v-container>
            <v-row align="center" class="mb-2">
                <v-col cols="auto">
                    <v-btn
                        icon
                        variant="text"
                        :to="{ name: 'dashboard' }"
                        aria-label="Back to Dashboard"
                    >
                        <v-icon>mdi-arrow-left</v-icon>
                    </v-btn>
                </v-col>
                <v-col>
                    <h1 class="text-h5">Admin Dashboard</h1>
                </v-col>
            </v-row>
            <v-tabs v-model="activeTab" class="mb-4">
                <v-tab value="users" prepend-icon="mdi-account-group">Users</v-tab>
                <v-tab value="documents" prepend-icon="mdi-bookshelf">Documents</v-tab>
                <v-tab value="inbox" prepend-icon="mdi-inbox">Inbox</v-tab>
            </v-tabs>

            <v-tabs-window v-model="activeTab">
                <!-- ── Users Tab ── -->
                <v-tabs-window-item value="users">
                    <v-row align="center" class="mb-4">
                        <v-col cols="12" sm="5" md="4">
                            <v-select
                                v-model="groupFilter"
                                :items="adminStore.groups"
                                item-title="name"
                                item-value="id"
                                label="Filter by group"
                                variant="outlined"
                                density="compact"
                                multiple
                                clearable
                                chips
                                hide-details
                            />
                        </v-col>
                        <v-spacer />
                        <v-col cols="auto">
                            <v-btn
                                variant="outlined"
                                prepend-icon="mdi-account-group-outline"
                                class="mr-2"
                                @click="groupsDialog = true"
                            >
                                Groups
                            </v-btn>
                            <v-btn
                                color="primary"
                                prepend-icon="mdi-email-plus"
                                @click="openInviteDialog"
                            >
                                Invite User
                            </v-btn>
                        </v-col>
                    </v-row>

                    <v-alert
                        v-if="adminStore.error"
                        type="error"
                        class="mb-4"
                        :text="adminStore.error"
                        aria-live="polite"
                    >
                        <template #append>
                            <v-btn
                                variant="text"
                                size="small"
                                @click="adminStore.fetchAllProfiles()"
                            >
                                Retry
                            </v-btn>
                        </template>
                    </v-alert>

                    <v-data-table
                        v-if="!adminStore.error"
                        :headers="userHeaders"
                        :items="filteredProfiles"
                        :loading="adminStore.loading"
                        item-value="id"
                    >
                        <template #item.display_name="{ item }">
                            <div class="d-flex align-center gap-3 py-2">
                                <v-avatar color="primary" size="36">
                                    <span class="text-body-2 font-weight-bold">
                                        {{ item.display_name?.[0]?.toUpperCase() ?? '?' }}
                                    </span>
                                </v-avatar>
                                <span>{{ item.display_name }}</span>
                            </div>
                        </template>

                        <template #item.is_active="{ item }">
                            <v-chip
                                :color="item.is_active ? 'success' : 'grey'"
                                size="small"
                                variant="tonal"
                            >
                                {{ item.is_active ? 'Active' : 'Inactive' }}
                            </v-chip>
                        </template>

                        <template #item.groups="{ item }">
                            <div class="d-flex flex-wrap gap-1 py-1">
                                <v-chip
                                    v-for="group in item.groups"
                                    :key="group.id"
                                    size="x-small"
                                    variant="outlined"
                                    color="primary"
                                >
                                    {{ group.name }}
                                </v-chip>
                                <span v-if="item.groups.length === 0" class="text-medium-emphasis text-caption">—</span>
                            </div>
                        </template>

                        <template #item.actions="{ item }">
                            <v-menu>
                                <template #activator="{ props }">
                                    <v-btn
                                        v-bind="props"
                                        icon
                                        variant="text"
                                        size="small"
                                        :disabled="item.id === authStore.profile?.id"
                                        :aria-label="`Actions for ${item.display_name}`"
                                    >
                                        <v-icon>mdi-dots-vertical</v-icon>
                                    </v-btn>
                                </template>
                                <v-list density="compact" min-width="180">
                                    <v-list-item
                                        v-if="adminStore.groups.length > 0"
                                        prepend-icon="mdi-account-group"
                                        title="Manage Groups"
                                    >
                                        <v-menu activator="parent" :close-on-content-click="false">
                                            <v-list density="compact" min-width="160">
                                                <v-list-item
                                                    v-for="group in adminStore.groups"
                                                    :key="group.id"
                                                    :title="group.name"
                                                    :prepend-icon="isInGroup(item, group.id) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"
                                                    @click="toggleUserGroup(item, group)"
                                                />
                                            </v-list>
                                        </v-menu>
                                    </v-list-item>
                                    <v-list-item
                                        :prepend-icon="item.is_active ? 'mdi-account-cancel' : 'mdi-account-check'"
                                        :title="item.is_active ? 'Deactivate' : 'Reactivate'"
                                        @click="toggleActive(item)"
                                    />
                                    <v-divider />
                                    <v-list-item
                                        prepend-icon="mdi-delete"
                                        title="Delete"
                                        base-color="error"
                                        @click="openDeleteUserDialog(item)"
                                    />
                                </v-list>
                            </v-menu>
                        </template>
                    </v-data-table>
                </v-tabs-window-item>

                <!-- ── Documents Tab ── -->
                <v-tabs-window-item value="documents">
                    <v-row align="center" class="mb-4">
                        <v-spacer />
                        <v-col cols="auto">
                            <v-btn
                                color="primary"
                                prepend-icon="mdi-upload"
                                @click="openUploadDialog"
                            >
                                Upload
                            </v-btn>
                        </v-col>
                    </v-row>

                    <v-alert
                        v-if="documentStore.error"
                        type="error"
                        class="mb-4"
                        :text="documentStore.error"
                    />

                    <v-progress-linear
                        v-if="documentStore.loading"
                        indeterminate
                        color="primary"
                        class="mb-4"
                    />

                    <v-list v-if="documentStore.documents.length > 0" lines="two">
                        <v-list-item
                            v-for="doc in documentStore.documents"
                            :key="doc.path"
                            :prepend-icon="getFileIcon(doc.name)"
                            :title="doc.displayName"
                            :subtitle="`${formatSize(doc.size)} · ${formatDate(doc.created_at)}`"
                            style="cursor: pointer"
                            @click="openDocument(doc)"
                        >
                            <template #append>
                                <v-btn
                                    icon
                                    variant="text"
                                    :aria-label="`Download ${doc.name}`"
                                    @click.stop="downloadDoc(doc.path, doc.name)"
                                >
                                    <v-icon>mdi-download</v-icon>
                                </v-btn>
                                <v-btn
                                    icon
                                    variant="text"
                                    color="error"
                                    :aria-label="`Delete ${doc.name}`"
                                    @click.stop="openDeleteDocDialog(doc)"
                                >
                                    <v-icon>mdi-delete</v-icon>
                                </v-btn>
                            </template>
                        </v-list-item>
                    </v-list>

                    <div
                        v-else-if="!documentStore.loading && !documentStore.error"
                        class="text-center mt-8"
                    >
                        <v-icon size="80" color="grey">mdi-bookshelf</v-icon>
                        <p class="text-body-1 mt-4">No documents yet. Upload the first file!</p>
                        <v-btn
                            color="primary"
                            prepend-icon="mdi-upload"
                            class="mt-4"
                            @click="openUploadDialog"
                        >
                            Upload
                        </v-btn>
                    </div>
                </v-tabs-window-item>

                <!-- ── Inbox Tab ── -->
                <v-tabs-window-item value="inbox">
                    <v-row align="center" class="mb-4">
                        <v-col cols="12" sm="4" md="3">
                            <v-select
                                v-model="categoryFilter"
                                :items="categoryOptions"
                                item-title="title"
                                item-value="value"
                                label="Filter by category"
                                variant="outlined"
                                density="compact"
                                hide-details
                            />
                        </v-col>
                    </v-row>

                    <v-data-table
                        v-if="filteredFeedback.length > 0"
                        :headers="feedbackHeaders"
                        :items="filteredFeedback"
                        item-value="id"
                    >
                        <template #item.category="{ item }">
                            <v-chip
                                :color="categoryColor(item.category)"
                                size="small"
                                variant="flat"
                                class="text-white"
                            >
                                {{ categoryLabel(item.category) }}
                            </v-chip>
                        </template>
                        <template #item.created_at="{ item }">
                            {{ formatDate(item.created_at) }}
                        </template>
                    </v-data-table>

                    <div v-else class="text-center mt-8">
                        <v-icon size="80" color="grey">mdi-inbox-outline</v-icon>
                        <p class="text-body-1 mt-4">No feedback yet.</p>
                    </div>
                </v-tabs-window-item>
            </v-tabs-window>
        </v-container>
    </v-main>

    <!-- PDF Viewer -->
    <v-dialog v-model="viewerDialog" fullscreen>
        <PdfViewer
            v-if="viewerDialog"
            :url="viewerUrl"
            :filename="viewerFilename"
            @close="viewerDialog = false"
        />
    </v-dialog>

    <!-- Upload Document Dialog -->
    <v-dialog v-model="uploadDialog" max-width="480">
        <v-card title="Upload Document">
            <v-card-text>
                <v-file-input
                    label="Choose file"
                    variant="outlined"
                    accept=".pdf,application/pdf,.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
                    hint="Accepted: PDF, Word, Excel, images · Max 50 MB"
                    persistent-hint
                    :model-value="uploadFile ? [uploadFile] : []"
                    :error-messages="uploadSizeError"
                    @change="onFileChange"
                />
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="uploadDialog = false">Cancel</v-btn>
                <v-btn
                    color="primary"
                    :disabled="!uploadFile || !!uploadSizeError"
                    :loading="uploading"
                    @click="confirmUpload"
                >
                    Upload
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Delete Document Dialog -->
    <v-dialog v-model="deleteDocDialog" max-width="400">
        <v-card title="Delete Document">
            <v-card-text>
                Are you sure you want to delete
                <strong>{{ docToDelete?.displayName }}</strong>? This cannot be undone.
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="deleteDocDialog = false">Cancel</v-btn>
                <v-btn color="error" @click="confirmDeleteDoc">Delete</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Invite User Dialog -->
    <v-dialog v-model="inviteDialog" max-width="440">
        <v-card title="Invite User">
            <v-card-text>
                <v-text-field
                    v-model="inviteEmail"
                    label="Email address"
                    type="email"
                    variant="outlined"
                    autofocus
                    @keyup.enter="confirmInvite"
                />
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="inviteDialog = false">Cancel</v-btn>
                <v-btn
                    color="primary"
                    :disabled="!inviteEmail"
                    :loading="inviting"
                    @click="confirmInvite"
                >
                    Send Invite
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Delete User Dialog -->
    <v-dialog v-model="deleteUserDialog" max-width="440" role="alertdialog">
        <v-card title="Delete User Account">
            <v-card-text>
                This will permanently delete
                <strong>{{ userToDelete?.display_name }}</strong>'s account, characters, and all
                associated data. This cannot be undone.
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="deleteUserDialog = false">Cancel</v-btn>
                <v-btn color="error" :loading="deletingUser" @click="confirmDeleteUser">
                    Delete
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Manage Groups Dialog -->
    <v-dialog v-model="groupsDialog" max-width="480">
        <v-card title="Manage Groups">
            <v-card-text>
                <v-list v-if="adminStore.groups.length > 0" density="compact" class="mb-4">
                    <v-list-item
                        v-for="group in adminStore.groups"
                        :key="group.id"
                        :title="group.name"
                        prepend-icon="mdi-account-group-outline"
                    >
                        <template #append>
                            <v-btn
                                icon
                                variant="text"
                                color="error"
                                size="small"
                                :aria-label="`Delete group ${group.name}`"
                                @click="removeGroup(group)"
                            >
                                <v-icon>mdi-delete</v-icon>
                            </v-btn>
                        </template>
                    </v-list-item>
                </v-list>
                <p v-else class="text-medium-emphasis text-body-2 mb-4">No groups yet.</p>
                <v-text-field
                    v-model="newGroupName"
                    label="New group name"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @keyup.enter="createGroup"
                />
            </v-card-text>
            <v-card-actions>
                <v-btn
                    color="primary"
                    :disabled="!newGroupName.trim()"
                    :loading="creatingGroup"
                    @click="createGroup"
                >
                    Create Group
                </v-btn>
                <v-spacer />
                <v-btn variant="text" @click="groupsDialog = false">Done</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
    </template>
    <!-- ── end admin dashboard ── -->
</template>
