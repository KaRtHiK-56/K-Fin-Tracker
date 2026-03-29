import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

interface Props {
  children: React.ReactNode
}

const NAV = [
  {
    section: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: '🏠' }],
  },
  {
    section: 'Investments',
    items: [
      { label: 'Stocks', path: '/stocks', icon: '📈' },
      { label: 'Mutual Funds', path: '/mf', icon: '🎯' },
      { label: 'Gold', path: '/gold', icon: '🥇' },
      { label: 'FD / RD', path: '/bonds', icon: '🏦' },
    ],
  },
  {
    section: 'Tracking',
    items: [
      { label: 'Expenses', path: '/expenses', icon: '💸' },
      { label: 'Income', path: '/income', icon: '💰' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { label: 'SIP Calc', path: '/sip', icon: '🔄' },
      { label: 'Tax Planner', path: '/tax', icon: '🧾' },
    ],
  },
]

export default function Layout({ children }: Props) {
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [col, setCol] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const sideW = col ? 60 : 230

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-secondary)' }}>

      {/* Sidebar */}
      <aside
        style={{
          width: sideW,
          flexShrink: 0,
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          inset: '0 auto 0 0',
          zIndex: 200,
          transition: 'width .2s ease',
          overflow: 'hidden',
        }}
      >

        {/* Logo */}
        <div
          onClick={() => setCol((c) => !c)}
          style={{
            padding: col ? '18px 0' : '18px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: col ? 'center' : 'flex-start',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: 'var(--brand)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            ₹
          </div>

          {!col && (
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              K-<span style={{ color: 'var(--brand)' }}>Fin</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(({ section, items }) => (
            <div key={section} style={{ marginBottom: 16 }}>
              {!col && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px 6px' }}>
                  {section}
                </div>
              )}

              {items.map(({ label, path, icon }) => {
                const active = location.pathname === path

                return (
                  <div
                    key={path}
                    onClick={() => navigate(path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: col ? '10px 0' : '9px 10px',
                      justifyContent: col ? 'center' : 'flex-start',
                      borderRadius: 10,
                      cursor: 'pointer',
                      color: active ? 'var(--brand)' : 'var(--text-secondary)',
                      background: active ? 'var(--brand-pale)' : 'transparent',
                    }}
                  >
                    <span>{icon}</span>
                    {!col && <span>{label}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: '10px 8px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {[
            {
              icon: isDark ? '☀️' : '🌙',
              label: isDark ? 'Light Mode' : 'Dark Mode',
              fn: toggle,
            },
            { icon: '🚪', label: 'Sign Out', fn: handleSignOut },
          ].map(({ icon, label, fn }) => (
            <button
              key={label}
              onClick={fn}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: col ? '10px 0' : '9px 10px',
                justifyContent: col ? 'center' : 'flex-start',
                borderRadius: 10,
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <span>{icon}</span>
              {!col && <span>{label}</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          marginLeft: sideW,
          flex: 1,
          minWidth: 0,
          transition: 'margin-left .2s ease',
        }}
      >
        {children}
      </main>
    </div>
  )
}
