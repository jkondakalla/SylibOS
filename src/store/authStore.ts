import { create } from 'zustand'
import { getMe, refreshToken, redirectToLogin, getAuthProfile } from '../api/auth'
import { applyScheme } from '../lib/theme'
import type { JkosUser } from '../api/auth'
import type { SchemeId } from '../types'

interface AuthStore {
  user:   JkosUser | null
  status: 'loading' | 'ready' | 'unauthenticated'
  init:   () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user:   null,
  status: 'loading',

  init: async () => {
    try {
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

      // Non-blocking: fetch cross-app preferences and apply saved scheme
      getAuthProfile()
        .then(({ preferences }) => {
          if (preferences.scheme) applyScheme(preferences.scheme as SchemeId)
        })
        .catch(() => {}) // best-effort; local scheme stays if auth unreachable

    } catch {
      set({ status: 'unauthenticated' })
      redirectToLogin()
    }
  },
}))
