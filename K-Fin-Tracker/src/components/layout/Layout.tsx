import { useState } from 'react' 
import { useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import type { Theme } from '../../types'
import { useTheme } from '../../lib/ThemeContext'

interface Props { children: React.ReactNode; theme: Theme; onThemeToggle: () => void }

const NAV = [
  { section: 'Overview',     items: [
    { label: 'Dashboard',    path: '/dashboard', icon: '🏠' },
  ]},
  { section: 'Investments',  items: [
    { label: 'Stocks',       path: '/stocks',    icon: '📈' },
    { label: 'Mutual Funds', path: '/mf',        icon: '🎯' },
    { label: 'Gold',         path: '/gold',      icon: '🥇' },
    { label: 'FD / RD',      path: '/bonds',     icon: '🏦' },
  ]},
  { section: 'Tracking',     items: [
    { label: 'Expenses',     path: '/expenses',  icon: '💸' },
    { label: 'Income',       path: '/income',    icon: '💰' },
  ]},
  { section: 'Tools',        items: [
    { label: 'SIP Calc',     path: '/sip',       icon: '🔄' },
    { label: 'Tax Planner',  path: '/tax',       icon: '🧾' },
  ]},
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isDark, toggle } = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [col, setCol] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const sideW = col ? 60 : 230

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-secondary)' }}>

      {/* Sidebar */}
      <aside style={{
        width: sideW, flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0',
        zIndex: 200, transition: 'width .2s ease', overflow: 'hidden',
      }}>

        {/* Logo */}
        <div
          onClick={() => setCol(c => !c)}
          style={{
            padding: col ? '18px 0' : '18px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            justifyContent: col ? 'center' : 'flex-start',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <div style={{
            width: 36, height: 36, background: 'var(--brand)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0,
            boxShadow: '0 0 16px var(--brand-glow)',
          }}>₹</div>
          {!col && (
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
              K-<span style={{ color: 'var(--brand)' }}>Fin</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(({ section, items }) => (
            <div key={section} style={{ marginBottom: 16 }}>
              {!col && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  padding: '0 8px 6px',
                }}>{section}</div>
              )}
              {items.map(({ label, path, icon }) => {
                const active = location.pathname === path
                return (
                  <div
                    key={path}
                    onClick={() => navigate(path)}
                    title={col ? label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: 9, padding: col ? '10px 0' : '9px 10px',
                      justifyContent: col ? 'center' : 'flex-start',
                      borderRadius: 10, cursor: 'pointer',
                      fontSize: 13.5, fontWeight: active ? 600 : 400,
                      color: active ? 'var(--brand)' : 'var(--text-secondary)',
                      background: active ? 'var(--brand-pale)' : 'transparent',
                      border: `1px solid ${active ? 'var(--border-hover)' : 'transparent'}`,
                      marginBottom: 2, transition: 'var(--trans)',
                    }}
                    onMouseOver={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-tertiary)' }}
                    onMouseOut={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                    {!col && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { icon: isDark ? '☀️' : '🌙', label: isDark ? 'Light Mode' : 'Dark Mode', fn: onThemeToggle },
            { icon: '🚪', label: 'Sign Out', fn: handleSignOut },
          ].map(({ icon, label, fn }) => (
            <button key={label} onClick={fn} title={col ? label : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: col ? '10px 0' : '9px 10px',
              justifyContent: col ? 'center' : 'flex-start',
              width: '100%', border: '1px solid transparent',
              borderRadius: 10, background: 'transparent', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 13.5,
              fontFamily: 'var(--font)', transition: 'var(--trans)',
            }}
              onMouseOver={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'var(--bg-tertiary)'
                el.style.color = 'var(--text-primary)'
              }}
              onMouseOut={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'transparent'
                el.style.color = 'var(--text-tertiary)'
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {!col && <span>{label}</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: sideW, flex: 1, minWidth: 0, transition: 'margin-left .2s ease' }}>
        {children}
      </main>
    </div>
  )
}
