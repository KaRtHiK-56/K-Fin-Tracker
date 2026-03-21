import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { supabase } from './lib/supabase'
import './styles/globals.css'

import Layout      from './components/layout/Layout'
import LoginPage   from './pages/LoginPage'
import Dashboard   from './pages/Dashboard'
import StockTracker from './components/stocks/StockTracker'

/* ── Piggy loader ─────────────────────────────────────────────────────────── */
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

/* ── Auth guard ───────────────────────────────────────────────────────────── */
function Protected({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) return <Loader />
  if (user === null) return <Navigate to="/login" replace />
  return <>{children}</>
}

/* ── Inner app (accesses theme context) ───────────────────────────────────── */
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

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
