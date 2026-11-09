// Admin area: signed-in admins and moderators only.
export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) return navigateTo('/')
  if (!authStore.isStaff) return navigateTo('/dashboard')
})
