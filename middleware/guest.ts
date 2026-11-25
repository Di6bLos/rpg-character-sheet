// Redirects authenticated users away from public pages (login, signup) to dashboard,
// and a reset link's session to /reset-password
export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore()

  if (authStore.recovering) return navigateTo('/reset-password')
  if (authStore.isAuthenticated) {
    return navigateTo('/dashboard')
  }
})
