const AUTH_URL = (import.meta.env.VITE_JKOS_AUTH_URL as string | undefined)
  ?? 'https://auth.jkos.net'

export interface JkosUser {
  id:         string
  email:      string
  name:       string
  avatar_url: string | null
  role:       string
}

export async function getMe(): Promise<JkosUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  if (res.ok) {
    const data = await res.json()
    return data.user as JkosUser
  }
  // Distinguish server errors from auth failures — 5xx throws so callers
  // don't treat a broken backend as "not authenticated" and redirect to login
  if (res.status >= 500) throw new Error(`Auth check failed: ${res.status}`)
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
    `${AUTH_URL}/auth/login?redirect_to=${encodeURIComponent(window.location.href)}`
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
  window.location.href = `${AUTH_URL}/auth/login`
}

// ── Cross-app profile / preferences (auth.jkos.net) ──────────────────────────

export interface JkOSTheme {
  mode:      'light' | 'dark' | 'system'
  primary:   string   // single hex; CSS adapts for light/dark via color-mix()
  secondary: string
}

export interface EffectsPreferences {
  grain:         boolean
  grainStrength: number   // 0–1
  halation:      boolean
  scanLines:     boolean
  scanStrength:  number   // 0–1
  artifacts:     boolean
}

export interface LazurPreferences {
  url:   string
  model: string
}

export interface UserPreferences {
  scheme?:  string
  theme?:   JkOSTheme
  effects?: EffectsPreferences
  lazuros?: LazurPreferences
}

export const DEFAULT_THEME: JkOSTheme = {
  mode:      'system',
  primary:   '#ffb000',
  secondary: '#4ecdc4',
}

export const DEFAULT_EFFECTS: EffectsPreferences = {
  grain:         true,
  grainStrength: 0.35,
  halation:      true,
  scanLines:     false,
  scanStrength:  0.25,
  artifacts:     false,
}

// Migrate old 4-colour format → simplified single pair
export function normaliseTheme(raw: any): JkOSTheme {
  if (!raw) return DEFAULT_THEME
  if (raw.primary) return raw as JkOSTheme
  // old format: { dark: { primary, secondary }, light: { primary, secondary }, mode }
  return {
    mode:      raw.mode ?? 'system',
    primary:   raw.dark?.primary   ?? DEFAULT_THEME.primary,
    secondary: raw.dark?.secondary ?? DEFAULT_THEME.secondary,
  }
}

export interface AuthProfile {
  user: JkosUser
  preferences: UserPreferences
}

export async function getAuthProfile(): Promise<AuthProfile> {
  const res = await fetch(`${AUTH_URL}/auth/profile`, { credentials: 'include' })
  if (!res.ok) throw new Error('Profile fetch failed')
  return res.json()
}

export async function patchAuthProfile(
  patch: { name?: string; avatar_url?: string | null; preferences?: UserPreferences },
): Promise<void> {
  await fetch(`${AUTH_URL}/auth/profile`, {
    method:      'PATCH',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(patch),
  })
}

export { AUTH_URL }
