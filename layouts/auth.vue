<template>
  <main class="auth">
    <div class="auth__brand">
      <LanternLogo :size="36" />
      <p>Character sheets and campaign tools for your table.</p>
    </div>
    <div class="auth__card panel">
      <slot />
    </div>
  </main>
</template>

<style scoped lang="scss">
.auth {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 40px 16px;
}

.auth__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  color: var(--page-soft);
}

.auth__card {
  width: min(440px, 100%);
  padding: 32px;
}
</style>
