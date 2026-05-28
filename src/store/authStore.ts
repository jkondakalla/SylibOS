import { create } from 'zustand'
import { getMe, refreshToken, redirectToLogin } from '../api/auth'
import type { JkosUser } from '../api/auth'

interface AuthStore {
  user:   JkosUser | null
  status: 'loading' | 'ready' | 'unauthenticated'
  init:   () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user:   null,
  status: 'loading',

  init: async () => {
    let user = await getMe()

    if (!user) {
      const refreshed = await refreshToken()
      if (refreshed) user = await getMe()
    }

    if (!user) {
      set({ status: 'unauthenticated' })
      redirectToLogin()
      return
    }

    set({ user, status: 'ready' })
  },
}))
