// Redirects unauthenticated users to login for protected routes
export default defineNuxtRouteMiddleware(() => {
    const authStore = useAuthStore()

    if (!authStore.isAuthenticated) {
        return navigateTo('/')
    }
})
