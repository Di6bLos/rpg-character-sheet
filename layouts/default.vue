<script setup lang="ts">
const auth = useAuthStore()
const route = useRoute()
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)

const links = [
  { to: '/dashboard', label: 'Dashboard', match: ['/dashboard'] },
  { to: '/characters', label: 'Characters', match: ['/characters', '/character'] },
  { to: '/campaigns', label: 'Campaigns', match: ['/campaigns', '/join'] },
  { to: '/library', label: 'Library', match: ['/library'] },
  { to: '/settings', label: 'Settings', match: ['/settings'] },
]

function isCurrent(match: string[]) {
  return match.some((m) => route.path === m || route.path.startsWith(m + '/'))
}

const initial = computed(() => (auth.profile?.display_name?.[0] ?? '?').toUpperCase())

async function signOut() {
  menuOpen.value = false
  await auth.logout()
  await navigateTo('/')
}

function onDocClick(event: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(event.target as Node)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)
</script>

<template>
  <div class="shell">
    <a class="skip" href="#main">Skip to content</a>
    <header class="topbar">
      <div class="topbar__inner">
        <NuxtLink to="/dashboard" class="topbar__logo" aria-label="Lantern dashboard">
          <LanternLogo />
        </NuxtLink>
        <nav aria-label="Primary" class="topbar__nav">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :aria-current="isCurrent(link.match) ? 'page' : undefined"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
        <div ref="menuEl" class="account">
          <button
            type="button"
            class="avatar account__btn"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            :aria-label="`Account menu, signed in as ${auth.profile?.display_name ?? 'player'}`"
            @click="menuOpen = !menuOpen"
            @keydown.esc="menuOpen = false"
          >
            {{ initial }}
          </button>
          <div v-if="menuOpen" class="account__menu panel" role="menu">
            <div class="account__who">
              <strong>{{ auth.profile?.display_name }}</strong>
              <span class="muted small">@{{ auth.profile?.handle }}</span>
            </div>
            <NuxtLink v-if="auth.isStaff" to="/admin" role="menuitem">Admin area</NuxtLink>
            <NuxtLink to="/settings" role="menuitem">Settings</NuxtLink>
            <button type="button" role="menuitem" @click="signOut">Sign out</button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="auth.isSuspended" class="suspended" role="alert">
      Your account is suspended. You can read your content but can’t make changes. Contact an admin
      if you think this is a mistake.
    </div>

    <main id="main" class="shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__main {
  flex: 1;
}

.skip {
  position: absolute;
  left: 12px;
  top: -60px;
  padding: 10px 16px;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: 8px;
  z-index: 100;
  font-weight: 600;

  &:focus {
    top: 12px;
  }
}

.topbar {
  border-bottom: 1px solid var(--line);
  background: var(--nav-bg);
}

.topbar__inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 12px clamp(16px, 4vw, 40px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.topbar__logo {
  text-decoration: none;
  display: inline-flex;
}

.topbar__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 15px;
  font-weight: 500;

  a {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    text-decoration: none;
    color: var(--page-soft);

    &:hover {
      color: var(--page-text);
    }

    &[aria-current='page'] {
      color: var(--page-text);
      font-weight: 600;
      box-shadow: inset 0 -2px 0 var(--accent);
    }
  }
}

.account {
  position: relative;
}

.account__btn {
  border: 0;
  width: 44px;
  height: 44px;
}

.account__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 220px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);

  a,
  button {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--page-text);
    text-decoration: none;
    text-align: left;
    border-radius: min(var(--radius-control), 8px);

    &:hover {
      background: var(--accent-tint);
    }
  }
}

.account__who {
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--line);
}

.suspended {
  background: var(--danger-bg);
  color: var(--danger-text);
  padding: 12px clamp(16px, 4vw, 40px);
  text-align: center;
  font-size: 15px;
}

@media (max-width: 720px) {
  .topbar__nav {
    order: 3;
    width: 100%;
    justify-content: space-between;
    gap: 0;

    a {
      padding: 0 8px;
      white-space: nowrap;
    }
  }
}
</style>
