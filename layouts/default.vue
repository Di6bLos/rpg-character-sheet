<script setup lang="ts">
const auth = useAuthStore()
const route = useRoute()
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const menuBtn = ref<HTMLButtonElement | null>(null)

/** Esc from the trigger or any menu item closes the menu and returns focus to the trigger. */
function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  menuBtn.value?.focus()
}

const links = [
  { to: '/dashboard', label: 'Dashboard', match: ['/dashboard'] },
  { to: '/characters', label: 'Characters', match: ['/characters', '/character'] },
  { to: '/campaigns', label: 'Campaigns', match: ['/campaigns', '/join'] },
  { to: '/library', label: 'Library', match: ['/library'] },
]

function isCurrent(match: string[]) {
  return match.some((m) => route.path === m || route.path.startsWith(m + '/'))
}

const initial = computed(() => (auth.profile?.display_name?.[0] ?? '?').toUpperCase())

// "Manual dice", for all the player's heroes; the menu stays open to show it.
const account = useAccountMenu()
const { ownDice, savingDice, toggleOwnDice } = account

async function signOut() {
  menuOpen.value = false
  await account.signOut()
}

// The phone battle board takes the whole screen and carries these links in its
// campaign menu, so the nav (which wraps to two rows on a phone) steps aside there.
const { layout } = useBoardLayout()
const phoneBattle = computed(() => layout.value === 'phone' && route.path.endsWith('/battle'))

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
  <div class="shell" :class="{ 'shell--phone': phoneBattle }">
    <a class="skip" :href="phoneBattle ? '#battle-content' : '#main'">Skip to content</a>
    <header v-if="!phoneBattle" class="topbar">
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
        <div ref="menuEl" class="account" @keydown.esc="closeMenu">
          <button
            ref="menuBtn"
            type="button"
            class="avatar account__btn"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            :aria-label="`Account menu, signed in as ${auth.profile?.display_name ?? 'player'}`"
            @click="menuOpen = !menuOpen"
          >
            {{ initial }}
          </button>
          <div v-if="menuOpen" class="account__menu panel" role="menu">
            <div class="account__who">
              <strong>{{ auth.profile?.display_name }}</strong>
              <span class="muted small">@{{ auth.profile?.handle }}</span>
            </div>
            <NuxtLink v-if="auth.isStaff" to="/admin" role="menuitem">Admin area</NuxtLink>
            <button
              type="button"
              role="menuitemcheckbox"
              class="account__toggle"
              :aria-checked="ownDice"
              :disabled="savingDice || auth.isSuspended"
              title="The app checks things off but rolls nothing; you roll at the table. For all your heroes."
              @click="toggleOwnDice"
            >
              Manual dice
              <span class="account__switch" aria-hidden="true"><span /></span>
            </button>
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

// The phone battle board is exactly the visible screen: 100vh is taller than that on
// phones while the browser bars show, which would let the page scroll.
.shell--phone {
  min-height: 0;
  height: 100dvh;
  overflow: hidden;
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

.account__toggle {
  justify-content: space-between;
  gap: 12px;

  &:disabled {
    cursor: progress;
  }
}

// A small switch drawn for the menu item (the item itself is the checkbox).
.account__switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--track);
  box-shadow: inset 0 0 0 1px var(--line-strong);
  transition: background 0.15s;

  span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--page-muted);
    transition: transform 0.15s;
  }

  [aria-checked='true'] > & {
    background: var(--accent);

    span {
      background: var(--on-accent);
      transform: translateX(14px);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .account__switch,
  .account__switch span {
    transition: none;
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
