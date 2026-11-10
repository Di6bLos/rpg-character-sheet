// Redirects unauthenticated users to login for protected routes
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/',
      query: to.fullPath === '/dashboard' ? {} : { next: to.fullPath },
    })
  }
})
