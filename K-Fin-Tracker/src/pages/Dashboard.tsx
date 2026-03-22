import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '../lib/portfolioStore'

const fL = (n: number) => {
  if (!isFinite(n) || n === 0) return '₹0'
  const a = Math.abs(n)
  if (a >= 1e7) return (n < 0 ? '-' : '') + '₹' + (a/1e7).toFixed(2) + 'Cr'
  if (a >= 1e5) return (n < 0 ? '-' : '') + '₹' + (a/1e5).toFixed(2) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

const modules = [
  { label: 'Stock Tracker',  icon: '📈', path: '/stocks',   desc: 'NSE/BSE live prices, P&L, sector view', live: true },
  { label: 'Mutual Funds',   icon: '🎯', path: '/mf',       desc: 'SIP tracker, NAV, XIRR' },
  { label: 'Gold Holdings',  icon: '🥇', path: '/gold',     desc: 'Physical, SGB, ETF tracking' },
  { label: 'FD / RD',        icon: '🏦', path: '/bonds',    desc: 'Maturity tracker, interest calculator' },
  { label: 'Expenses',       icon: '💸', path: '/expenses', desc: 'Monthly spend analysis' },
  { label: 'Income',         icon: '💰', path: '/income',   desc: 'Salary, freelance, dividends' },
  { label: 'SIP Calculator', icon: '🔄', path: '/sip',      desc: 'Future value projections' },
  { label: 'Tax Planner',    icon: '🧾', path: '/tax',      desc: '80C, 80D, LTCG optimiser' },
]

export default function Dashboard() {
  const navigate  = useNavigate()
  const { holdings, snapshot } = usePortfolio()

  const invested = snapshot?.totalInvested  ?? 0
  const current  = snapshot?.currentValue   ?? 0
  const pnl      = snapshot?.totalPnL       ?? 0
  const pnlPct   = snapshot?.totalPnLPct    ?? 0
  const dayPnL   = snapshot?.dayPnL         ?? 0
  const dayPct   = snapshot?.dayPnLPct      ?? 0
  const hasData  = holdings.length > 0

  const cards = [
    {
      label: 'Total Invested',
      value: hasData ? fL(invested) : '—',
      sub:   hasData ? `${holdings.length} stock${holdings.length !== 1 ? 's' : ''}` : 'Add holdings in Stock Tracker',
      color: 'var(--text-primary)',
      icon:  '💼',
    },
    {
      label: 'Current Value',
      value: hasData && current !== invested ? fL(current) : hasData ? 'Loading…' : '—',
      sub:   hasData && current !== invested
        ? `${pnlPct >= 0 ? '▲' : '▼'} ${Math.abs(pnlPct).toFixed(2)}% overall`
        : 'Fetching live prices',
      color: 'var(--brand)',
      icon:  '📊',
    },
    {
      label: 'Total P&L',
      value: hasData && current !== invested ? (pnl >= 0 ? '+' : '') + fL(pnl) : hasData ? '—' : '—',
      sub:   hasData && current !== invested
        ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`
        : 'Awaiting live prices',
      color: pnl >= 0 ? 'var(--pos)' : 'var(--neg)',
      icon:  '💰',
    },
    {
      label: "Today's P&L",
      value: hasData && dayPnL !== 0 ? (dayPnL >= 0 ? '+' : '') + fL(dayPnL) : hasData ? '₹0' : '—',
      sub:   hasData && dayPnL !== 0
        ? `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% today`
        : hasData ? 'Market closed / no intraday data' : 'Add holdings first',
      color: dayPnL >= 0 ? 'var(--pos)' : 'var(--neg)',
      icon:  '📅',
    },
  ]

  return (
    <div style={{ padding: '28px 28px 48px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px' }}>Portfolio Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {hasData
              ? `${holdings.length} holdings · last updated ${snapshot?.lastUpdated ? new Date(snapshot.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}`
              : 'K-Fin Tracker — your complete Indian finance dashboard'}
          </p>
        </div>
        {hasData && (
          <button
            onClick={() => navigate('/stocks')}
            style={{ padding: '8px 18px', borderRadius: 10, background: 'var(--brand-pale)', border: '1px solid var(--border-hover)', color: 'var(--brand)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>
            View Stocks →
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 32 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '18px 20px',
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

      {/* Holdings breakdown (only when data exists) */}
      {hasData && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '20px 24px', marginBottom: 32,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Holdings Breakdown</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol','Company','Qty','Avg Cost','Sector'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map(h => (
                  <tr key={h.id}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>{h.symbol}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{h.company_name}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{h.quantity}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>₹{h.avg_buy_price.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--brand-pale)', color: 'var(--brand)' }}>{h.sector || 'Other'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Module grid */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Modules</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Click a module to get started</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {modules.map(m => (
          <div key={m.label}
            onClick={() => navigate(m.path)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '20px', cursor: 'pointer',
              transition: 'var(--trans)', position: 'relative', overflow: 'hidden',
            }}
            onMouseOver={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--border-hover)'; el.style.background = 'var(--brand-pale)' }}
            onMouseOut={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--border)'; el.style.background = 'var(--bg-card)' }}
          >
            {m.live && (
              <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'var(--pos-bg)', color: 'var(--pos)' }}>LIVE</div>
            )}
            <div style={{ fontSize: 28, marginBottom: 10 }}>{m.icon}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{m.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
