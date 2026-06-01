import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import { useTheme, SCHEMES, type SchemeId, type Scheme } from '../lib/theme'
import { logout, patchAuthProfile, AUTH_URL } from '../api/auth'
import type { JkosUser } from '../api/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || src[0].toUpperCase()
}

function schemePreviewVars(s: Scheme): React.CSSProperties {
  const dark = s.theme === 'dark'
  return {
    '--sc-paper':     dark ? '#121318'  : '#fbfaf7',
    '--sc-card':      dark ? '#1b1d24'  : '#ffffff',
    '--sc-ink':       dark ? '#eceae3'  : '#211c16',
    '--sc-blend':     dark ? 'screen'   : 'multiply',
    '--sc-accent':    dark ? `color-mix(in oklab, ${s.accent} 62%, #fff)` : s.accent,
    '--sc-on-accent': dark ? '#121318'  : '#ffffff',
  } as React.CSSProperties
}

function SchemeChip({ scheme, active, onPick }: {
  scheme: Scheme; active: boolean; onPick: (id: SchemeId) => void
}) {
  return (
    <button
      className={`scheme-chip${active ? ' active' : ''}`}
      style={schemePreviewVars(scheme)}
      onClick={() => onPick(scheme.id)}
      aria-pressed={active}
      title={scheme.name}
    >
      <span className="scheme-swatch">
        <span className="scheme-lines"><i /><i /><i /></span>
        <span className="scheme-chiprow">
          <span className="scheme-pill"><span /></span>
          <span className="scheme-card-dot" />
        </span>
      </span>
      <span className="scheme-foot">
        <span className="scheme-name">{scheme.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span className="scheme-mode">{scheme.theme}</span>
          <span className="scheme-check"><Icon name="check" size={11} strokeWidth={2.5} /></span>
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// ProfileMenu
// ---------------------------------------------------------------------------

export function ProfileMenu({ user }: { user: JkosUser | null }) {
  const [open, setOpen] = useState(false)
  const { scheme, setScheme } = useTheme()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  const handleSchemeChange = (id: SchemeId) => {
    setScheme(id)
    patchAuthProfile({ preferences: { scheme: id } }).catch(() => {})
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
  }

  if (!user) return null

  return (
    <div ref={wrapRef} className="profile-wrap">
      <button
        className="profile-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initials(user.name, user.email)}
      </button>

      {open && (
        <div className="profile-popup papered" role="menu" aria-label="Profile menu">
          {/* User identity */}
          <div className="profile-popup-identity">
            <div className="profile-avatar-lg" aria-hidden>
              {initials(user.name, user.email)}
            </div>
            <div className="profile-popup-meta">
              <span className="profile-popup-name">{user.name}</span>
              <span className="profile-popup-email">{user.email}</span>
            </div>
          </div>

          {/* Appearance */}
          <div className="profile-popup-section">
            <p className="profile-section-label">Appearance</p>
            <div className="scheme-grid">
              {SCHEMES.map(s => (
                <SchemeChip key={s.id} scheme={s} active={scheme === s.id} onPick={handleSchemeChange} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="profile-popup-actions">
            <a
              href={`${AUTH_URL}/auth/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="profile-action-link"
              onClick={() => setOpen(false)}
            >
              <Icon name="settings" size={14} />
              Manage Account
            </a>
            <button className="profile-action-signout" onClick={handleLogout}>
              <Icon name="logout" size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
