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
  const router = useRouter()
  watch(
    () => authStore.userId,
    (id) => {
      notifications.stop()
      if (id) notifications.start(router)
    },
    { immediate: true },
  )
})
