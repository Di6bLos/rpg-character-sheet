import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/views/SignUpView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/character/new',
      name: 'character-new',
      component: () => import('@/views/CharacterNewView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/character/:id',
      name: 'character-view',
      component: () => import('@/views/CharacterView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/character/:id/edit',
      name: 'character-edit',
      component: () => import('@/views/CharacterEditView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/documents',
      name: 'documents',
      component: () => import('@/views/DocumentsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) return { name: 'login' }
  if ((to.name === 'login' || to.name === 'signup') && authStore.isAuthenticated)
    return { name: 'dashboard' }
})

export default router
