import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'

const navLinks = [
  { to: '/', label: 'Today', end: true },
  { to: '/import', label: 'Import', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function Layout() {
  const { segments, hydrate } = useAppStore()
  const { status, init } = useAuthStore()

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (status === 'ready') hydrate()
  }, [status])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f0f13',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontFamily: 'monospace',
        fontSize: 13,
        letterSpacing: '0.08em',
      }}>
        {status === 'loading' ? 'VERIFYING SESSION…' : 'REDIRECTING…'}
      </div>
    )
  }

  const total = Object.keys(segments).length
  const done = Object.values(segments).filter(s => s.completedAt).length

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f13', color: '#e8e8ee' }}>
      <nav style={{
        background: '#18181f',
        borderBottom: '1px solid #2a2a35',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: '-0.02em', marginRight: 32, userSelect: 'none' }}>
          <span style={{ color: '#818cf8' }}>OCF</span> Study
        </span>

        <div style={{ display: 'flex', height: '100%' }}>
          {navLinks.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                height: 52,
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? '#fff' : '#6b7280',
                borderBottom: isActive ? '2px solid #818cf8' : '2px solid transparent',
                textDecoration: 'none',
                letterSpacing: '0.01em',
                transition: 'color 0.15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>

        {total > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{done}/{total} lessons</span>
            <div style={{ width: 80, height: 4, background: '#2a2a35', borderRadius: 2 }}>
              <div style={{ width: `${(done / total) * 100}%`, height: '100%', background: '#818cf8', borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  )
}
