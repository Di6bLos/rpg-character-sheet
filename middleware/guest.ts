// Redirects authenticated users away from public pages (login, signup) to dashboard
export default defineNuxtRouteMiddleware(() => {
    const authStore = useAuthStore()

    if (authStore.isAuthenticated) {
        return navigateTo('/dashboard')
    }
})
