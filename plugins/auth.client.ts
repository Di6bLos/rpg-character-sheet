// Initialises the Supabase auth session before the app mounts so that
// route middleware has access to the authenticated state immediately.
export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()
  const { applySaved } = useTheme()
  applySaved()
  await authStore.init()
  applySaved()
  watch(() => [authStore.profile?.theme, authStore.profile?.accent], applySaved)

  // Journal entries and messages are announced on every screen while signed in.
  const notifications = useNotificationsStore()
  const site = useSiteStore()
  const aiKeys = useAiKeysStore()
  const npcs = useNpcStore()
  const router = useRouter()
  watch(
    () => authStore.userId,
    (id) => {
      notifications.stop()
      site.reset()
      aiKeys.reset()
      npcs.reset()
      if (id) {
        notifications.start(router)
        // Site switches (NPC pool, AI) gate parts of the UI; failures leave the defaults.
        site.fetch().catch(() => undefined)
      }
    },
    { immediate: true },
  )
  // Admins can flip the site switches at any time; pick changes up as people move around.
  router.afterEach(() => {
    if (authStore.userId) site.fetch().catch(() => undefined)
  })
})
