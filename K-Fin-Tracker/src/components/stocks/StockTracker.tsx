import { useState, useEffect, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler,
} from 'chart.js'
import {
  fetchMultipleQuotes, computePortfolioPnL, computeHealthScore,
  searchStocks, POPULAR_STOCKS,
} from '../../lib/stockApi'
import type { StockHolding, StockWithQuote, LiveQuote, SortField, SortDir } from '../../types'
import { useTheme } from '../../lib/ThemeContext'
import styles from './StockTracker.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

/* ── Demo data ─────────────────────────────────────────────────────────────── */
const DEMO: StockHolding[] = [
  { id:'1', user_id:'demo', symbol:'RELIANCE',   exchange:'NSE', company_name:'Reliance Industries', quantity:50,  avg_buy_price:2480, sector:'Energy',   buy_date:'2023-04-12', created_at:'', updated_at:'' },
  { id:'2', user_id:'demo', symbol:'TCS',        exchange:'NSE', company_name:'Tata Consultancy',    quantity:20,  avg_buy_price:3820, sector:'IT',       buy_date:'2023-01-08', created_at:'', updated_at:'' },
  { id:'3', user_id:'demo', symbol:'INFY',       exchange:'NSE', company_name:'Infosys Ltd',         quantity:40,  avg_buy_price:1540, sector:'IT',       buy_date:'2022-11-15', created_at:'', updated_at:'' },
  { id:'4', user_id:'demo', symbol:'HDFCBANK',   exchange:'NSE', company_name:'HDFC Bank',           quantity:35,  avg_buy_price:1620, sector:'Banking',  buy_date:'2023-06-20', created_at:'', updated_at:'' },
  { id:'5', user_id:'demo', symbol:'TITAN',      exchange:'NSE', company_name:'Titan Company',       quantity:25,  avg_buy_price:3200, sector:'Consumer', buy_date:'2023-08-01', created_at:'', updated_at:'' },
  { id:'6', user_id:'demo', symbol:'IRCTC',      exchange:'NSE', company_name:'IRCTC',               quantity:30,  avg_buy_price:780,  sector:'Travel',   buy_date:'2023-09-14', created_at:'', updated_at:'' },
  { id:'7', user_id:'demo', symbol:'WIPRO',      exchange:'NSE', company_name:'Wipro Ltd',           quantity:60,  avg_buy_price:510,  sector:'IT',       buy_date:'2022-07-05', created_at:'', updated_at:'' },
  { id:'8', user_id:'demo', symbol:'BAJFINANCE', exchange:'NSE', company_name:'Bajaj Finance',       quantity:10,  avg_buy_price:6800, sector:'NBFC',     buy_date:'2023-03-22', created_at:'', updated_at:'' },
]

const SECTOR_COLORS: Record<string, string> = {
  IT:'#8B5CF6', Banking:'#06B6D4', Energy:'#F59E0B',
  Consumer:'#10B981', NBFC:'#F472B6', Travel:'#EF4444',
  Pharma:'#34D399', Auto:'#FB923C', Other:'#94A3B8',
}

const SECTORS = ['IT','Banking','Energy','Consumer','NBFC','Pharma','Auto','Travel','Cement','FMCG','Infrastructure','Other']

interface FormData {
  symbol: string; company_name: string; exchange: 'NSE'|'BSE'
  quantity: string; avg_buy_price: string; buy_date: string
  sector: string; notes: string
}
const EMPTY: FormData = { symbol:'', company_name:'', exchange:'NSE', quantity:'', avg_buy_price:'', buy_date:'', sector:'IT', notes:'' }

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const fi  = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const fL  = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e7) return (n >= 0 ? '' : '-') + '₹' + (Math.abs(n)/1e7).toFixed(2) + 'Cr'
  if (a >= 1e5) return (n >= 0 ? '' : '-') + '₹' + (Math.abs(n)/1e5).toFixed(2) + 'L'
  return fi(n)
}

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function StockTracker() {
  const { isDark } = useTheme()
  const [holdings,    setHoldings]   = useState<StockHolding[]>(DEMO)
  const [quotes,      setQuotes]     = useState<Map<string, LiveQuote>>(new Map())
  const [loading,     setLoading]    = useState(true)
  const [refreshing,  setRefreshing] = useState(false)
  const [updatedAt,   setUpdatedAt]  = useState<Date | null>(null)
  const [sortField,   setSortField]  = useState<SortField>('current_value')
  const [sortDir,     setSortDir]    = useState<SortDir>('desc')
  const [filter,      setFilter]     = useState('')
  const [selected,    setSelected]   = useState<StockWithQuote | null>(null)
  const [showModal,   setShowModal]  = useState(false)
  const [editingId,   setEditingId]  = useState<string | null>(null)
  const [form,        setForm]       = useState<FormData>(EMPTY)
  const [searchQ,     setSearchQ]    = useState('')
  const [searchRes,   setSearchRes]  = useState<{ symbol: string; company_name: string; exchange: string }[]>([])
  const [dropOpen,    setDropOpen]   = useState(false)
  const [miniChart,   setMiniChart]  = useState<ChartJS | null>(null)

  /* Fetch quotes */
  const loadQuotes = useCallback(async (list: StockHolding[]) => {
    if (!list.length) { setLoading(false); return }
    try {
      const map = await fetchMultipleQuotes(list.map(h => ({ symbol: h.symbol, exchange: h.exchange })))
      setQuotes(map)
      setUpdatedAt(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadQuotes(holdings) }, [holdings, loadQuotes])

  /* Auto-refresh during market hours */
  useEffect(() => {
    const isOpen = () => {
      const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const m = ist.getHours() * 60 + ist.getMinutes()
      const d = ist.getDay()
      return d > 0 && d < 6 && m >= 555 && m <= 930
    }
    const id = setInterval(() => { if (isOpen()) loadQuotes(holdings) }, 60_000)
    return () => clearInterval(id)
  }, [holdings, loadQuotes])

  /* Enrich */
  const enrich = (h: StockHolding): StockWithQuote => {
    const quote = quotes.get(h.symbol)
    const ltp   = quote?.ltp ?? h.avg_buy_price
    const cv    = h.quantity * ltp
    const iv    = h.quantity * h.avg_buy_price
    return { ...h, quote, current_value: cv, invested_value: iv, pnl: cv - iv, pnl_pct: iv > 0 ? ((cv - iv) / iv) * 100 : 0 }
  }

  const enriched = holdings.map(enrich)
  const pnl      = computePortfolioPnL(holdings, quotes)
  const health   = computeHealthScore(holdings, quotes)

  /* Sorted + filtered rows */
  const rows = [...enriched]
    .filter(h =>
      h.symbol.toLowerCase().includes(filter.toLowerCase()) ||
      h.company_name.toLowerCase().includes(filter.toLowerCase()) ||
      (h.sector || '').toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const av = sortField === 'symbol' ? a.symbol.charCodeAt(0) : sortField === 'pnl' ? a.pnl : sortField === 'pnl_pct' ? a.pnl_pct : sortField === 'quantity' ? a.quantity : a.current_value
      const bv = sortField === 'symbol' ? b.symbol.charCodeAt(0) : sortField === 'pnl' ? b.pnl : sortField === 'pnl_pct' ? b.pnl_pct : sortField === 'quantity' ? b.quantity : b.current_value
      return sortDir === 'asc' ? av - bv : bv - av
    })

  /* Sector map */
  const sectorMap = new Map<string, number>()
  enriched.forEach(h => sectorMap.set(h.sector || 'Other', (sectorMap.get(h.sector || 'Other') || 0) + h.current_value))

  /* Handlers */
  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const handleSearch = async (q: string) => {
    setSearchQ(q)
    setForm(f => ({ ...f, symbol: q.toUpperCase(), company_name: '' }))
    if (q.length >= 2) {
      const res = await searchStocks(q)
      setSearchRes(res)
      setDropOpen(true)
    } else setDropOpen(false)
  }

  const pickStock = (s: { symbol: string; company_name: string; exchange: string }) => {
    setForm(f => ({ ...f, symbol: s.symbol, company_name: s.company_name, exchange: s.exchange as 'NSE' | 'BSE' }))
    setSearchQ(s.symbol)
    setDropOpen(false)
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...EMPTY, buy_date: new Date().toISOString().split('T')[0] })
    setSearchQ('')
    setShowModal(true)
  }

  const openEdit = (h: StockWithQuote) => {
    setEditingId(h.id)
    setForm({ symbol: h.symbol, company_name: h.company_name, exchange: h.exchange, quantity: String(h.quantity), avg_buy_price: String(h.avg_buy_price), buy_date: h.buy_date, sector: h.sector || 'IT', notes: h.notes || '' })
    setSearchQ(h.symbol)
    setShowModal(true)
  }

  const handleDelete = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const handleSubmit = () => {
    if (!form.symbol || !form.quantity || !form.avg_buy_price) return
    const base: StockHolding = {
      id: editingId || Date.now().toString(), user_id: 'demo',
      symbol: form.symbol.toUpperCase(), exchange: form.exchange,
      company_name: form.company_name || form.symbol,
      quantity: parseFloat(form.quantity), avg_buy_price: parseFloat(form.avg_buy_price),
      buy_date: form.buy_date, sector: form.sector, notes: form.notes,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    if (editingId) setHoldings(prev => prev.map(h => h.id === editingId ? base : h))
    else setHoldings(prev => [base, ...prev])
    setShowModal(false)
  }

  /* Mini sparkline data */
  const sparkData = (h: StockWithQuote) => {
    const ltp = h.quote?.ltp ?? h.avg_buy_price
    const pts = 30
    const data: number[] = Array.from({ length: pts }, (_, i) => {
      const t = i / (pts - 1)
      return +(h.avg_buy_price + (ltp - h.avg_buy_price) * t + (Math.random() - 0.48) * ltp * 0.015).toFixed(2)
    })
    data[pts - 1] = ltp
    const color = h.pnl >= 0 ? '#10B981' : '#EF4444'
    return {
      labels: data.map((_, i) => i),
      datasets: [{ data, borderColor: color, backgroundColor: color + '18', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }],
    }
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { display: false },
      y: {
        display: true,
        grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        ticks: { color: isDark ? '#6B6486' : '#8875B5', font: { size: 9 }, callback: (v: string | number) => '₹' + (Number(v) / 1000).toFixed(0) + 'K' },
      },
    },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { raw: unknown }) => fi(ctx.raw as number) } } },
  }

  const thC = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.07)'
  const bdC = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.05)'

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Stock Tracker</h1>
          <p className={styles.sub}>
            NSE / BSE · Live prices
            {updatedAt && <span className={styles.updated}> · Updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div className={styles.hActions}>
          <button
            className={`${styles.iconBtn} ${refreshing ? styles.spin : ''}`}
            onClick={() => { setRefreshing(true); loadQuotes(holdings) }}
            title="Refresh prices"
          >↻</button>
          <button className={styles.addBtn} onClick={openAdd}>＋ Add Stock</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className={styles.strip}>
        {[
          { label: 'Invested',    val: fL(pnl.totalInvested), color: 'var(--text-primary)' },
          { label: 'Current',     val: fL(pnl.currentValue),  color: 'var(--brand)' },
          { label: 'Total P&L',   val: (pnl.totalPnL >= 0 ? '+' : '') + fL(pnl.totalPnL) + ' (' + (pnl.totalPnLPct >= 0 ? '+' : '') + pnl.totalPnLPct.toFixed(1) + '%)', color: pnl.totalPnL >= 0 ? 'var(--pos)' : 'var(--neg)' },
          { label: "Today's P&L", val: (pnl.dayPnL >= 0 ? '+' : '') + fL(pnl.dayPnL) + ' (' + (pnl.dayPnLPct >= 0 ? '+' : '') + pnl.dayPnLPct.toFixed(2) + '%)', color: pnl.dayPnL >= 0 ? 'var(--pos)' : 'var(--neg)' },
        ].map(c => (
          <div key={c.label} className={styles.sCard}>
            <div className={styles.sLabel}>{c.label}</div>
            <div className={styles.sVal} style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}

        {/* Health score */}
        <div className={`${styles.sCard} ${styles.healthCard}`}>
          <div className={styles.sLabel}>Health Score</div>
          <div className={styles.healthRow}>
            <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="17" fill="none" stroke="var(--border)" strokeWidth="4"/>
                <circle cx="22" cy="22" r="17" fill="none"
                  stroke={health.overall >= 70 ? '#10B981' : health.overall >= 45 ? '#F59E0B' : '#EF4444'}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray="106.8"
                  strokeDashoffset={106.8 * (1 - health.overall / 100)}
                  transform="rotate(-90 22 22)"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                {health.overall}
              </div>
            </div>
            <div>
              <div style={{
                fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: health.risk_level === 'Low' ? 'var(--pos-bg)' : health.risk_level === 'Moderate' ? 'var(--gold-bg)' : 'var(--neg-bg)',
                color: health.risk_level === 'Low' ? 'var(--pos)' : health.risk_level === 'Moderate' ? 'var(--gold)' : 'var(--neg)',
              }}>{health.risk_level} Risk</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{health.sector_count} sectors</div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>

        {/* Table */}
        <div className={styles.tableCard}>
          <div className={styles.tableTop}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIco}>🔍</span>
              <input
                type="text" placeholder="Search symbol, company, sector…"
                value={filter} onChange={e => setFilter(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <span className={styles.hCount}>{enriched.length} holdings</span>
          </div>

          {loading ? (
            <div style={{ padding: '8px 20px' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ height: 38, borderRadius: 8, margin: '5px 0', background: `linear-gradient(90deg, var(--border) 25%, var(--bg-tertiary) 50%, var(--border) 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.3s infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Symbol',    field: 'symbol'        as SortField },
                      { label: 'Company',   field: null },
                      { label: 'Qty',       field: 'quantity'      as SortField },
                      { label: 'Avg Cost',  field: null },
                      { label: 'LTP',       field: null },
                      { label: 'Value',     field: 'current_value' as SortField },
                      { label: 'P&L',       field: 'pnl'           as SortField },
                      { label: 'P&L %',     field: 'pnl_pct'       as SortField },
                      { label: 'Sector',    field: null },
                      { label: '',          field: null },
                    ].map(({ label, field }) => (
                      <th key={label}
                        onClick={() => field && handleSort(field)}
                        style={{
                          textAlign: label === 'Company' || label === 'Symbol' || label === 'Sector' || label === '' ? 'left' : 'right',
                          fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: 'var(--text-tertiary)', padding: '9px 12px',
                          borderBottom: `1px solid var(--border)`,
                          background: thC,
                          cursor: field ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none',
                        }}
                      >
                        {label}{field && <span style={{ marginLeft: 3, opacity: 0.5, fontSize: 9 }}>{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(h => {
                    const sel = selected?.id === h.id
                    const sc  = SECTOR_COLORS[h.sector || 'Other'] || '#94A3B8'
                    return (
                      <tr key={h.id}
                        onClick={() => setSelected(sel ? null : h)}
                        style={{ cursor: 'pointer', background: sel ? 'var(--brand-pale)' : 'transparent', transition: 'background .1s' }}
                        onMouseOver={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = isDark ? 'rgba(124,58,237,0.06)' : '#F5F3FF' }}
                        onMouseOut={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                      >
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--brand)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>{h.symbol}</span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.company_name}</div>
                          {h.quote && <div style={{ fontSize: 10.5, color: h.quote.change_pct >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{h.quote.change_pct >= 0 ? '▲' : '▼'} {Math.abs(h.quote.change_pct).toFixed(2)}%</div>}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{h.quantity}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{fi(h.avg_buy_price)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5, color: h.quote ? (h.quote.change >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text-tertiary)' }}>
                          {h.quote ? fi(h.quote.ltp) : '···'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{fL(h.current_value)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5, color: h.pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                          {h.pnl >= 0 ? '+' : ''}{fL(h.pnl)}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: h.pnl_pct >= 0 ? 'var(--pos-bg)' : 'var(--neg-bg)', color: h.pnl_pct >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                            {h.pnl_pct >= 0 ? '↑' : '↓'} {Math.abs(h.pnl_pct).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: sc + '22', color: sc }}>{h.sector || 'Other'}</span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {[
                              { icon: '✏', fn: (e: React.MouseEvent) => { e.stopPropagation(); openEdit(h) } },
                              { icon: '🗑', fn: (e: React.MouseEvent) => { e.stopPropagation(); handleDelete(h.id) } },
                            ].map(({ icon, fn }) => (
                              <button key={icon} onClick={fn} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--trans)' }}
                                onMouseOver={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = 'var(--brand-pale)'; el.style.borderColor = 'var(--border-hover)' }}
                                onMouseOut={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent' }}
                              >{icon}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sector bar */}
          <div style={{ display: 'flex', height: 5, borderTop: '1px solid var(--border)' }}>
            {[...sectorMap.entries()].sort((a, b) => b[1] - a[1]).map(([s, v]) => (
              <div key={s} title={`${s}: ${((v / pnl.currentValue) * 100).toFixed(1)}%`}
                style={{ width: `${(v / pnl.currentValue) * 100}%`, background: SECTOR_COLORS[s] || '#94A3B8', transition: 'width .5s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
            {[...sectorMap.keys()].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: SECTOR_COLORS[s] || '#94A3B8' }} />
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className={`${styles.detail} slide-in`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>{selected.symbol}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{selected.company_name}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {selected.quote && (
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fi(selected.quote.ltp)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginTop: 2, color: selected.quote.change >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {selected.quote.change >= 0 ? '▲' : '▼'} {selected.quote.change >= 0 ? '+' : ''}{selected.quote.change.toFixed(2)} ({selected.quote.change_pct >= 0 ? '+' : ''}{selected.quote.change_pct.toFixed(2)}%)
                </div>
              </div>
            )}

            <div style={{ height: 120 }}>
              <Line key={selected.id} data={sparkData(selected)} options={chartOpts as never} />
            </div>

            {/* OHLC grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-tertiary)', borderRadius: 12, padding: 10 }}>
              {[
                { l: 'Open',      v: selected.quote ? fi(selected.quote.open)      : '—', c: '' },
                { l: 'High',      v: selected.quote ? fi(selected.quote.high)      : '—', c: 'var(--pos)' },
                { l: 'Low',       v: selected.quote ? fi(selected.quote.low)       : '—', c: 'var(--neg)' },
                { l: 'Prev Close',v: selected.quote ? fi(selected.quote.prev_close): '—', c: '' },
                { l: '52W High',  v: selected.quote?.week_52_high ? fi(selected.quote.week_52_high) : '—', c: 'var(--pos)' },
                { l: '52W Low',   v: selected.quote?.week_52_low  ? fi(selected.quote.week_52_low)  : '—', c: 'var(--neg)' },
                { l: 'P/E',       v: selected.quote?.pe_ratio ? selected.quote.pe_ratio.toFixed(1) : '—', c: '' },
                { l: 'Volume',    v: selected.quote ? (selected.quote.volume / 1e5).toFixed(1) + 'L' : '—', c: '' },
              ].map(({ l, v, c }) => (
                <div key={l}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: c || 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Holding block */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { l: 'Qty held',     v: `${selected.quantity} shares` },
                { l: 'Avg cost',     v: fi(selected.avg_buy_price) },
                { l: 'Invested',     v: fL(selected.invested_value) },
                { l: 'Current',      v: fL(selected.current_value), c: 'var(--brand)' },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--mono)', color: c || 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                <span>P&L</span>
                <span style={{ fontFamily: 'var(--mono)', color: selected.pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {selected.pnl >= 0 ? '+' : ''}{fL(selected.pnl)} ({selected.pnl_pct >= 0 ? '+' : ''}{selected.pnl_pct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => openEdit(selected)} style={{ flex: 1, padding: 8, borderRadius: 10, background: 'var(--brand-pale)', color: 'var(--brand)', border: '1px solid var(--border-hover)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)' }}>✏ Edit</button>
              <button onClick={() => handleDelete(selected.id)} style={{ flex: 1, padding: 8, borderRadius: 10, background: 'var(--neg-bg)', color: 'var(--neg)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)' }}>🗑 Remove</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bounce-in" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-hover)', borderRadius: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? 'Edit Holding' : 'Add Stock'}</h3>
              <button onClick={() => setShowModal(false)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>

            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Stock Symbol</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, padding: '0 12px', height: 38 }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>🔍</span>
                  <input
                    type="text" placeholder="Search NSE symbol or company…"
                    value={searchQ} onChange={e => handleSearch(e.target.value)}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)' }}
                    autoComplete="off"
                  />
                </div>
                {dropOpen && searchRes.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--border-hover)', borderRadius: 12, zIndex: 50, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    {searchRes.slice(0, 8).map(r => (
                      <div key={r.symbol} onClick={() => pickStock(r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, transition: 'var(--trans)' }}
                        onMouseOver={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--brand-pale)'}
                        onMouseOut={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                      >
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--brand)', padding: '1px 6px', borderRadius: 5 }}>{r.symbol}</span>
                        <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.exchange}</span>
                      </div>
                    ))}
                  </div>
                )}
                {dropOpen && searchRes.length === 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, zIndex: 50, marginTop: 4, padding: '10px 14px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                    No results — try popular stocks below
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {POPULAR_STOCKS.slice(0, 8).map(s => (
                        <span key={s.symbol} onClick={() => pickStock(s)}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--brand-pale)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }}
                        >{s.symbol}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Exchange + Sector */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Exchange', id: 'exch', val: form.exchange, opts: ['NSE', 'BSE'], onChange: (v: string) => setForm(f => ({ ...f, exchange: v as 'NSE'|'BSE' })) },
                  { label: 'Sector',   id: 'sec',  val: form.sector,   opts: SECTORS,        onChange: (v: string) => setForm(f => ({ ...f, sector: v })) },
                ].map(({ label, id, val, opts, onChange }) => (
                  <div key={id}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
                    <select value={val} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none', appearance: 'none' }}>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Qty + Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Quantity', placeholder: 'e.g. 50',   val: form.quantity,       key: 'quantity' as keyof FormData },
                  { label: 'Avg Buy Price (₹)', placeholder: 'e.g. 2480', val: form.avg_buy_price, key: 'avg_buy_price' as keyof FormData },
                ].map(({ label, placeholder, val, key }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
                    <input type="number" placeholder={placeholder} value={val}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>
                ))}
              </div>

              {/* Buy date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Buy Date</label>
                <input type="date" value={form.buy_date} max={new Date().toISOString().split('T')[0]}
                  onChange={e => setForm(f => ({ ...f, buy_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>

              {/* Preview */}
              {form.quantity && form.avg_buy_price && (
                <div style={{ background: 'var(--brand-pale)', border: '1px solid var(--border-hover)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--brand)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>💰 Investment: <strong style={{ color: 'var(--text-primary)' }}>{fL(parseFloat(form.quantity) * parseFloat(form.avg_buy_price))}</strong></span>
                  {quotes.get(form.symbol) && <span>📊 LTP: <strong style={{ color: 'var(--text-primary)' }}>{fi(quotes.get(form.symbol)!.ltp)}</strong></span>}
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Notes (optional)</label>
                <input type="text" placeholder="e.g. Long term hold" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ padding: '0 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={!form.symbol || !form.quantity || !form.avg_buy_price}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', opacity: (!form.symbol || !form.quantity || !form.avg_buy_price) ? 0.4 : 1 }}>
                {editingId ? '✏ Update' : '＋ Add Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
