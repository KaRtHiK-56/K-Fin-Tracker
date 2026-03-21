import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { supabase } from './lib/supabase'
import './styles/globals.css'

import Layout       from './components/layout/Layout'
import LoginPage    from './pages/LoginPage'
import Dashboard    from './pages/Dashboard'
import StockTracker from './components/stocks/StockTracker'

// ── Your allowed email ────────────────────────────────────────────────────────
const ALLOWED_EMAIL = 'karthiksurya611@gmail.com'     // ← replace with your Gmail
const NTFY_TOPIC    = 'kfin-karthik-9876'       // ← replace with your ntfy topic

// ── Piggy loader ──────────────────────────────────────────────────────────────
function Loader() {
  const [frame, setFrame] = useState(0)
  const msgs = ['Loading your wealth…', 'Fetching market data…', 'Computing health score…', 'Almost ready!']
  useEffect(() => {
    const t = setInterval(() => setFrame(f => Math.min(f + 1, msgs.length - 1)), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <div style={{ fontSize: 72, animation: 'bounce 1.2s ease-in-out infinite' }}>🐷</div>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {msgs[frame]}
      </p>
      <div style={{ width: 200, height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: 'linear-gradient(90deg, var(--brand), var(--brand-l))',
          animation: 'loadFill 2.5s ease-in-out forwards',
        }} />
      </div>
    </div>
  )
}

// ── Alert helper ──────────────────────────────────────────────────────────────
function sendAlert(user: User) {
  if (user.email !== ALLOWED_EMAIL) {
    fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: {
        'Title': '⚠️ K-Fin Tracker — Unknown Login',
        'Priority': 'urgent',
        'Tags': 'warning,lock',
      },
      body: `Unknown login detected!\nEmail: ${user.email}\nTime: ${new Date().toLocaleString('en-IN')}\nUser ID: ${user.id}`,
    }).catch(() => {})  // silently ignore if ntfy is unreachable
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function Protected({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    // Check existing session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) sendAlert(data.user)
    })

    // Listen for auth state changes (new logins)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && session?.user) {
        sendAlert(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) return <Loader />
  if (user === null)      return <Navigate to="/login" replace />
  return <>{children}</>
}

// ── Inner app ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { theme, toggle } = useTheme()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Layout theme={theme} onThemeToggle={toggle}>
                <Dashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/stocks"
          element={
            <Protected>
              <Layout theme={theme} onThemeToggle={toggle}>
                <StockTracker />
              </Layout>
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
