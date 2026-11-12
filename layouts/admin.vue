<script setup lang="ts">
const auth = useAuthStore()
const route = useRoute()

const links = computed(() => [
  { to: '/admin', label: 'Users' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/campaigns', label: 'Campaigns' },
  { to: '/admin/documents', label: 'Documents' },
  { to: '/admin/npcs', label: 'NPCs' },
])

/** Sections with sub-pages (NPCs → generator) stay highlighted on them. */
function isCurrent(to: string) {
  return to === '/admin' ? route.path === to : route.path === to || route.path.startsWith(`${to}/`)
}

const { openCount, refresh } = useOpenReports()
onMounted(refresh)
</script>

<template>
  <div class="admin">
    <aside class="admin__side">
      <NuxtLink to="/admin" class="admin__logo" aria-label="Lantern admin">
        <LanternLogo />
      </NuxtLink>
      <div class="eyebrow admin__tag">{{ auth.isAdmin ? 'Admin' : 'Moderator' }}</div>
      <nav aria-label="Admin" class="admin__nav">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :aria-current="isCurrent(link.to) ? 'page' : undefined"
        >
          <span>{{ link.label }}</span>
          <span v-if="link.to === '/admin/reports' && openCount > 0" class="badge badge--accent">
            {{ openCount }}
          </span>
        </NuxtLink>
      </nav>
      <NuxtLink to="/dashboard" class="btn btn--ghost btn--sm admin__back">
        Back to player view
      </NuxtLink>
    </aside>
    <main id="main" class="admin__main">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
.admin {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
}

.admin__side {
  background: var(--nav-bg);
  border-right: 1px solid var(--line);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.admin__logo {
  text-decoration: none;
  padding: 0 8px;
}

.admin__tag {
  padding: 0 8px 12px;
}

.admin__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;

  a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 8px;
    text-decoration: none;
    color: var(--page-soft);
    font-weight: 500;

    &:hover {
      background: var(--accent-tint);
    }

    &[aria-current='page'] {
      background: var(--panel-bg);
      color: var(--page-text);
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--accent);
    }
  }
}

.admin__main {
  min-width: 0;
}

@media (max-width: 860px) {
  .admin {
    grid-template-columns: 1fr;
  }

  .admin__side {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .admin__nav {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .admin__back {
    align-self: flex-start;
  }
}
</style>
