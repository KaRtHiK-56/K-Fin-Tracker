import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signInWithGoogle } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { toggle, isDark } = useTheme()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate('/dashboard', { replace: true })
    })
  }, [navigate])

  const features = ['📈 NSE/BSE Live', '🥇 Gold Tracker', '🎯 Mutual Funds', '🏦 FD / RD', '💸 Expenses']

  return (
    <div style={{
      minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.18) 0%, transparent 60%), var(--bg-primary)'
        : 'radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.07) 0%, transparent 60%), var(--bg-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative',
    }}>

      {/* Theme toggle */}
      <button onClick={toggle} style={{
        position: 'absolute', top: 20, right: 20,
        width: 38, height: 38, borderRadius: 10,
        border: '1px solid var(--border)', background: 'transparent',
        color: 'var(--text-secondary)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, transition: var(--trans),
      }}>
        {isDark ? '☀️' : '🌙'}
      </button>

      {/* Card */}
      <div className="fade-up" style={{
        width: '100%', maxWidth: 420,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 24, padding: '40px 36px',
        boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.4)' : '0 24px 64px rgba(124,58,237,0.08)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 60, height: 60, background: 'var(--brand)',
            borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: '#fff',
            margin: '0 auto 14px',
            boxShadow: '0 0 28px var(--brand-glow)',
          }}>₹</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
            K-Fin Tracker
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>
            Your complete Indian finance dashboard
          </p>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginBottom: 28 }}>
          {features.map(f => (
            <span key={f} style={{
              padding: '4px 11px', borderRadius: 99,
              fontSize: 11.5, fontWeight: 500,
              background: 'var(--brand-pale)', color: 'var(--brand)',
              border: '1px solid var(--border-hover)',
            }}>{f}</span>
          ))}
        </div>

        {/* Google button */}
        <button onClick={signInWithGoogle} style={{
          width: '100%', padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
          border: '1px solid var(--border)',
          borderRadius: 12,
          fontSize: 14.5, fontWeight: 600,
          color: 'var(--text-primary)', cursor: 'pointer',
          transition: 'var(--trans)', fontFamily: 'var(--font)',
        }}
          onMouseOver={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
          }}
          onMouseOut={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'none'
          }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p style={{
          textAlign: 'center', fontSize: 11.5,
          color: 'var(--text-muted)', marginTop: 20, lineHeight: 1.6,
        }}>
          Your data is stored securely. We never share your financial data.
        </p>
      </div>
    </div>
  )
}
