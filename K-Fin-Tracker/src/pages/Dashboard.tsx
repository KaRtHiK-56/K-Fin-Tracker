import { useNavigate } from 'react-router-dom'

const cards = [
  { label: 'Total Net Worth', value: '—', sub: 'Add your holdings to begin', color: 'var(--brand)', icon: '💼' },
  { label: 'Total Invested',  value: '—', sub: 'Stocks + MF + Gold + FD',    color: 'var(--pos)',   icon: '📈' },
  { label: 'Total Returns',   value: '—', sub: 'Unrealised P&L',              color: 'var(--pos)',   icon: '💰' },
  { label: 'Liabilities',     value: '—', sub: 'Loans & EMIs',                color: 'var(--neg)',   icon: '🏦' },
]

const modules = [
  { label: 'Stock Tracker',  icon: '📈', path: '/stocks',   desc: 'NSE/BSE live prices, P&L, sector view' },
  { label: 'Mutual Funds',   icon: '🎯', path: '/mf',       desc: 'SIP tracker, NAV, XIRR' },
  { label: 'Gold Holdings',  icon: '🥇', path: '/gold',     desc: 'Physical, SGB, ETF tracking' },
  { label: 'FD / RD',        icon: '🏦', path: '/bonds',    desc: 'Maturity tracker, interest calculator' },
  { label: 'Expenses',       icon: '💸', path: '/expenses', desc: 'Monthly spend analysis' },
  { label: 'Income',         icon: '💰', path: '/income',   desc: 'Salary, freelance, dividends' },
  { label: 'SIP Calculator', icon: '🔄', path: '/sip',      desc: 'Future value projections' },
  { label: 'Tax Planner',    icon: '🧾', path: '/tax',      desc: '80C, 80D, LTCG optimiser' },
]

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '28px 28px 48px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px' }}>Portfolio Overview</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Welcome to K-Fin Tracker — your complete Indian finance dashboard
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 32 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '18px 20px', cursor: 'default',
            transition: 'var(--trans)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', color: c.color }}>
              {c.value}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Quick Access
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {modules.map(m => (
            <div
              key={m.path}
              onClick={() => navigate(m.path)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer',
                transition: 'var(--trans)',
              }}
              onMouseOver={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'var(--border-hover)'
                el.style.transform = 'translateY(-2px)'
                el.style.background = 'var(--bg-hover)'
              }}
              onMouseOut={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'var(--border)'
                el.style.transform = 'none'
                el.style.background = 'var(--bg-card)'
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase notice */}
      <div style={{
        marginTop: 32, padding: '14px 18px',
        background: 'var(--brand-pale)', border: '1px solid var(--border-hover)',
        borderRadius: 14, fontSize: 13, color: 'var(--brand)', lineHeight: 1.6,
      }}>
        <strong>Phase 1 live:</strong> Stock Tracker with NSE/BSE live prices is ready.
        Click <strong>Stocks</strong> in the sidebar to get started.
        More modules (Gold, MF, FD, Expenses) coming in Phase 2.
      </div>
    </div>
  )
}
