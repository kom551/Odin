import { createRouter, createWebHistory } from 'vue-router'

import { getAccessToken } from '@/api/token'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/user/TasksView.vue'),
      meta: { title: '任务大厅' },
    },
    {
      path: '/access',
      name: 'access',
      component: () => import('@/views/AccessCodeView.vue'),
      meta: { title: '访问码登录', public: true },
    },
    {
      // 兼容旧地址：/tasks → 首页
      path: '/tasks',
      redirect: '/',
    },
    {
      path: '/tasks/:id',
      name: 'task-detail',
      component: () => import('@/views/user/TaskDetailView.vue'),
      props: true,
      meta: { title: '任务详情' },
    },
    {
      path: '/father',
      name: 'admin-home',
      component: () => import('@/views/admin/AdminHomeView.vue'),
      meta: { title: '管理页面' },
    },
    {
      path: '/father/tasks',
      name: 'admin-tasks',
      component: () => import('@/views/admin/AdminTasksView.vue'),
      meta: { title: '任务管理' },
    },
    {
      path: '/father/tasks/:id',
      name: 'admin-task-detail',
      component: () => import('@/views/admin/AdminTaskDetailView.vue'),
      props: true,
      meta: { title: '验收详情' },
    },
    {
      path: '/father/access-codes',
      name: 'admin-access-codes',
      component: () => import('@/views/admin/AdminAccessCodesView.vue'),
      meta: { title: '访问码管理' },
    },
  ],
})

/** 登录守卫：首页/任务页必须先持有设备令牌；管理端在 /father 下，仅 ADMIN_KEY 鉴权 */
router.beforeEach((to) => {
  if (to.meta.public) return true
  if (to.path.startsWith('/father')) return true
  if (!getAccessToken()) {
    return { path: '/access', query: { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title
  if (typeof title === 'string' && title) document.title = title
})

export default router
