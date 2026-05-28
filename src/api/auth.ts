const AUTH_URL = (import.meta.env.VITE_JKOS_AUTH_URL as string | undefined)
  ?? 'https://auth.jkos.net'
const APP_ORIGIN = (import.meta.env.VITE_APP_ORIGIN as string | undefined)
  ?? 'https://sylibos.jkos.net'

export interface JkosUser {
  id:         string
  email:      string
  name:       string
  avatar_url: string | null
  role:       string
}

export async function getMe(): Promise<JkosUser | null> {
  const res = await fetch(`${AUTH_URL}/auth/me`, { credentials: 'include' })
  if (res.ok) {
    const data = await res.json()
    return data.user as JkosUser
  }
  return null
}

export async function refreshToken(): Promise<boolean> {
  const res = await fetch(`${AUTH_URL}/auth/refresh`, {
    method:      'POST',
    credentials: 'include',
  })
  return res.ok
}

export function redirectToLogin(): void {
  window.location.href =
    `${AUTH_URL}/auth/login?redirect_to=${encodeURIComponent(APP_ORIGIN)}`
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
  window.location.href = AUTH_URL
}
