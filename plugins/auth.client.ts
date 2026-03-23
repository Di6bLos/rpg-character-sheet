// Initialises the Supabase auth session before the app mounts so that
// route middleware has access to the authenticated state immediately.
export default defineNuxtPlugin(async () => {
    const authStore = useAuthStore()
    await authStore.init()
})
