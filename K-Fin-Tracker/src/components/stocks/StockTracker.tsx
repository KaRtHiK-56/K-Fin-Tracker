import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler, ArcElement, Legend,
} from 'chart.js'
import {
  fetchLiveQuote, buildStubQuote, computePortfolioPnL, computeHealthScore,
  searchStocks, POPULAR_STOCKS, isMarketOpen,
  fetchPortfolioHistory, fetchIndexHistory, fetchIndexInvestedValue, rebaseTo100,
  clearQuoteCache, INDEX_TICKERS, INDEX_GROUPS, TIME_RANGES,
  type HistPoint,
} from '../../lib/stockApi'
import type { StockHolding, StockWithQuote, LiveQuote, SortField, SortDir } from '../../types'
import { useTheme } from '../../lib/ThemeContext'
import { usePortfolio } from '../../lib/portfolioStore'
import ImportModal from './ImportModal'
import styles from './StockTracker.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, ArcElement, Legend)

/* ── Sector colours ─────────────────────────────────────────────────────────── */
const SECTOR_COLORS: Record<string, string> = {
  IT: '#8B5CF6', Banking: '#06B6D4', Energy: '#F59E0B',
  Consumer: '#10B981', NBFC: '#F472B6', Travel: '#EF4444',
  Pharma: '#34D399', Auto: '#FB923C', Cement: '#60A5FA',
  FMCG: '#A78BFA', Infrastructure: '#34D399', Other: '#94A3B8',
}
const SECTORS = ['IT','Banking','Energy','Consumer','NBFC','Pharma','Auto','Travel','Cement','FMCG','Infrastructure','Other']


/* ── Health score tooltip content ──────────────────────────────────────────── */
const HEALTH_INFO = {
  formula: [
    { label: 'Diversification (max 40 pts)', desc: 'Number of sectors × 12. More sectors = lower risk of one sector crash wiping your portfolio.' },
    { label: 'Concentration (max 30 pts)', desc: 'Penalises if one stock is >20% of your portfolio. Top holding % × 0.5 deducted from 30.' },
    { label: 'Stock count (max 20 pts)', desc: 'Number of holdings × 2. More stocks = better spread of company-specific risk.' },
    { label: 'Green positions (max 10 pts)', desc: 'Ratio of stocks currently in profit. More winners = healthier portfolio momentum.' },
  ],
  risk: {
    Low: 'Top holding < 20% of portfolio. Well diversified, low chance of catastrophic loss.',
    Moderate: 'Top holding 20–35%. Reasonable diversification but one stock has notable influence on returns.',
    High: 'Top holding 35–50%. Significant concentration risk — one bad earnings call could heavily impact your portfolio.',
    'Very High': 'Top holding > 50%. Extremely concentrated. Consider rebalancing urgently.',
  },
}

/* ── Form types ─────────────────────────────────────────────────────────────── */
interface FormData {
  symbol: string; company_name: string; exchange: 'NSE' | 'BSE'
  quantity: string; avg_buy_price: string; buy_date: string
  sector: string; notes: string
}
const EMPTY: FormData = { symbol: '', company_name: '', exchange: 'NSE', quantity: '', avg_buy_price: '', buy_date: '', sector: 'IT', notes: '' }

/* ── Format helpers ─────────────────────────────────────────────────────────── */
const fi = (n: number) => '₹' + (isFinite(n) ? Math.round(n) : 0).toLocaleString('en-IN')
const fL = (n: number) => {
  if (!isFinite(n)) return '₹0'
  const a = Math.abs(n)
  if (a >= 1e7) return (n >= 0 ? '' : '-') + '₹' + (a / 1e7).toFixed(2) + 'Cr'
  if (a >= 1e5) return (n >= 0 ? '' : '-') + '₹' + (a / 1e5).toFixed(2) + 'L'
  return fi(n)
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function StockTracker() {
  const { isDark } = useTheme()
  // ── Global portfolio store — persists to localStorage, shared with Dashboard
  const { holdings, setHoldings, setSnapshot } = usePortfolio()
  const [quotes,     setQuotes]     = useState<Map<string, LiveQuote>>(new Map())
  const [loading,    setLoading]    = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(null)
  const [sortField,  setSortField]  = useState<SortField>('current_value')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [filter,     setFilter]     = useState('')
  const [selected,   setSelected]   = useState<StockWithQuote | null>(null)
  const [showModal,  setShowModal]  = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<FormData>(EMPTY)
  const [searchQ,    setSearchQ]    = useState('')
  const [searchRes,  setSearchRes]  = useState<typeof POPULAR_STOCKS>([])
  const [dropOpen,   setDropOpen]   = useState(false)
  const [showHealthInfo,   setShowHealthInfo]   = useState(false)
  const [benchmarkIndices, setBenchmarkIndices] = useState<string[]>(['NIFTY50'])
  const [timeRange,        setTimeRange]        = useState('1Y')
  const [portfolioHistory, setPortfolioHistory] = useState<HistPoint[]>([])
  const [indexHistories,   setIndexHistories]   = useState<Record<string, HistPoint[]>>({})
  const [histLoading,      setHistLoading]      = useState(false)
  const [histError,        setHistError]        = useState<string | null>(null)
  const [quoteError,       setQuoteError]       = useState<string | null>(null)
  const healthRef = useRef<HTMLDivElement>(null)

  /* ── Close health tooltip on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (healthRef.current && !healthRef.current.contains(e.target as Node)) {
        setShowHealthInfo(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Fetch quotes ── */
  const loadQuotes = useCallback(async (list: StockHolding[], forceRefresh = false) => {
    if (!list.length) { setLoading(false); setRefreshing(false); return }
    if (forceRefresh) clearQuoteCache()
    setQuoteError(null)

    let loaded = 0
    const results = await Promise.allSettled(
      list.map(h =>
        fetchLiveQuote(h.symbol, h.exchange).then(q => {
          if (q) {
            loaded++
            setQuotes(prev => {
              const next = new Map(prev)
              next.set(h.symbol, q)
              return next
            })
          }
          return q
        })
      )
    )

    const failed = results.filter(r => r.status === 'rejected' || !('value' in r) || !r.value).length
    if (loaded === 0) {
      setQuoteError(`Could not fetch prices. Check your connection. (${failed}/${list.length} failed)`)
    } else if (failed > 0) {
      console.warn(`[kfin] ${failed}/${list.length} quotes failed`)
    }

    setUpdatedAt(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [])

  // On mount / when holdings change:
  // 1. Immediately show CSV avg_buy_price as "current" — user sees data instantly
  // 2. Then fire live API to get real prices in background
  useEffect(() => {
    if (!holdings.length) return

    // Step 1: Build stub quotes from CSV data — instant display, no API needed
    setQuotes(prev => {
      const next = new Map(prev)
      holdings.forEach(h => {
        if (!next.has(h.symbol)) {
          next.set(h.symbol, buildStubQuote(
            h.symbol, h.exchange, h.avg_buy_price, h.company_name
          ))
        }
      })
      return next
    })
    setLoading(false)

    // Step 2: Fetch live prices in background
    loadQuotes(holdings)
  }, [holdings.length]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Auto-refresh during market hours ── */
  useEffect(() => {
    const isOpen = () => {
      const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const m = ist.getHours() * 60 + ist.getMinutes()
      const d = ist.getDay()
      return d > 0 && d < 6 && m >= 555 && m <= 930
    }
    const id = setInterval(() => { if (isOpen() && holdings.length) loadQuotes(holdings) }, 60_000)
    return () => clearInterval(id)
  }, [holdings, loadQuotes])

  /* ── Fetch real historical data ──────────────────────────────────────────
     Portfolio history:  real daily value of all holdings (qty × close price)
     Index history:      "if I invested ₹X in this index on my first buy date"
                         → shows apples-to-apples rupee comparison
  ── */
  useEffect(() => {
    if (!holdings.length) return

    const tr = TIME_RANGES.find(r => r.id === timeRange) || TIME_RANGES[3]
    const { period, interval } = tr

    setHistLoading(true)
    setHistError(null)

    ;(async () => {
      try {
        // ── Portfolio history: actual daily value ──────────────────────────
        const portHist = await fetchPortfolioHistory(holdings, period, interval)
        setPortfolioHistory(portHist)

        // ── Index history: "what if I bought index on each buy date" ────────
        // For each selected index, fetch its raw history then simulate
        // buying index units on each stock purchase date with that stock's ₹ amount.
        // This is the most accurate comparison possible.
        const newIdx: Record<string, HistPoint[]> = {}

        await Promise.all(
          benchmarkIndices.map(async (id) => {
            try {
              const idxHistory = await fetchIndexHistory(id, period, interval)
              if (!idxHistory.length) return

              const idxMap = new Map(idxHistory.map(p => [p.date, p.close]))

              // Find nearest index date for each buy event
              // Accumulate units bought on each date
              let totalUnits = 0
              const unitEvents: { date: string; units: number }[] = []

              for (const h of holdings) {
                const buyDate   = h.buy_date || idxHistory[0].date
                const amount    = h.quantity * h.avg_buy_price

                // Find index price on or just after buy date
                const buyIdx    = idxHistory.findIndex(p => p.date >= buyDate)
                const idxPrice  = buyIdx >= 0 ? idxHistory[buyIdx].close : idxHistory[0].close
                if (!idxPrice || idxPrice <= 0) continue

                const units = amount / idxPrice
                totalUnits += units
                unitEvents.push({ date: buyDate, units })
              }

              // Build daily ₹ value for the index simulation
              // For each date in chart: value = sum(units bought up to that date) × current_index_price
              // Only include dates from firstBuy onwards so the line starts where investment starts
              const firstBuy = holdings
                .map(h => h.buy_date || idxHistory[0].date)
                .filter(Boolean)
                .sort()[0] || idxHistory[0].date

              const result: HistPoint[] = idxHistory
                .filter(p => p.date >= firstBuy)   // start from first purchase date
                .map(p => {
                  const applicableUnits = unitEvents
                    .filter(e => e.date <= p.date)
                    .reduce((s, e) => s + e.units, 0)
                  if (applicableUnits <= 0) return null
                  return { date: p.date, close: +(applicableUnits * p.close).toFixed(2) }
                })
                .filter((p): p is HistPoint => p !== null)

              newIdx[id] = result
            } catch (e) {
              console.warn(`[kfin] index history failed ${id}:`, e)
            }
          })
        )

        setIndexHistories(newIdx)

        if (portHist.length === 0) {
          setHistError('Price history unavailable. Showing live prices only.')
        }
      } catch {
        setHistError('Could not load historical data.')
      } finally {
        setHistLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.map(h => h.symbol + h.buy_date).join(','), timeRange, benchmarkIndices.join(',')]
  )

  /* ── Enrich holdings with live data ── */
  const enrich = (h: StockHolding): StockWithQuote => {
    try {
      const quote  = quotes.get(h.symbol)
      const qty    = h.quantity || 0
      const avg    = h.avg_buy_price || 0
      const iv     = qty * avg

      // Only use live quote for current value — stub quotes (last_updated='csv')
      // exist only for table display, not for P&L calculation
      const isLive = quote && quote.last_updated !== 'csv' && isFinite(quote.ltp) && quote.ltp > 0
      const ltp    = isLive ? quote!.ltp : avg   // fall back to avg cost when no live price
      const cv     = qty * ltp
      const pnl    = isLive ? cv - iv : 0         // P&L is 0 until real price loads
      const pnl_pct = isLive && iv > 0 ? (pnl / iv) * 100 : 0

      return { ...h, quote, current_value: cv, invested_value: iv, pnl, pnl_pct }
    } catch {
      return { ...h, quote: undefined, current_value: 0, invested_value: 0, pnl: 0, pnl_pct: 0 }
    }
  }

  const enriched = holdings.map(enrich)
  const pnl      = computePortfolioPnL(holdings, quotes)
  const health   = computeHealthScore(holdings, quotes)
  const hasData  = holdings.length > 0

  // ── Sync live P&L snapshot to global store → Dashboard reads this ──────────
  useEffect(() => {
    if (!hasData) return
    setSnapshot({
      totalInvested: pnl.totalInvested,
      currentValue:  pnl.currentValue,
      totalPnL:      pnl.totalPnL,
      totalPnLPct:   pnl.totalPnLPct,
      dayPnL:        pnl.dayPnL,
      dayPnLPct:     pnl.dayPnLPct,
      lastUpdated:   new Date().toISOString(),
    })
  }, [pnl.totalInvested, pnl.currentValue, pnl.totalPnL, pnl.dayPnL])

  /* ── Sorted + filtered table rows ── */
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

  /* ── Sector allocation data ── */
  const sectorMap = new Map<string, number>()
  enriched.forEach(h => sectorMap.set(h.sector || 'Other', (sectorMap.get(h.sector || 'Other') || 0) + h.current_value))
  const sectorEntries = [...sectorMap.entries()].sort((a, b) => b[1] - a[1])

  /* ── P&L growth chart ────────────────────────────────────────────────────
     Shows two lines only:
       1. Portfolio value over time (₹) — from real historical prices
       2. Invested amount (flat ₹ line) — your actual cost basis
     The gap between them IS your P&L.
  ── */
  const pnlLineData = useMemo(() => {
    const totalInvested = pnl.totalInvested || 0
    if (totalInvested === 0) return null

    // Sort buy events chronologically
    const buyEvents = [...holdings]
      .map(h => ({ date: h.buy_date || '', amount: h.quantity * h.avg_buy_price }))
      .filter(e => e.date)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!buyEvents.length) return null

    const firstBuy = buyEvents[0].date
    const today    = new Date().toISOString().split('T')[0]

    // Build cumulative invested amount at any given date
    const cumulativeAt = (date: string) =>
      buyEvents.filter(e => e.date <= date).reduce((s, e) => s + e.amount, 0)

    // ── CASE 1: We have real portfolio history from the API ────────────────
    if (portfolioHistory.length > 0) {
      const n   = portfolioHistory.length
      const fmt = n > 90
        ? (d: string) => new Date(d).toLocaleDateString('en-IN', { month:'short', year:'2-digit' })
        : (d: string) => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })

      // The invested line must start from firstBuy, not from chart start
      // For dates before firstBuy, show 0 (no capital deployed yet)
      // For dates on/after firstBuy, show cumulative amount
      const invLine = portfolioHistory.map(p =>
        p.date >= firstBuy ? cumulativeAt(p.date) : 0
      )
      // If all buys happened before the chart window starts, show totalInvested as flat
      // (This is correct — all capital was deployed before the selected period)
      const allBeforeWindow = invLine.every(v => v === 0)
      const effInv = allBeforeWindow ? portfolioHistory.map(() => totalInvested) : invLine

      return {
        labels: portfolioHistory.map(p => fmt(p.date)),
        datasets: [
          {
            label: 'Portfolio Value (₹)',
            data:  portfolioHistory.map(p => p.close),
            borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.10)',
            fill: true, tension: 0.4, pointRadius: n > 60 ? 0 : 2, borderWidth: 2,
          },
          {
            label: `Cumulative Invested (${fL(totalInvested)})`,
            data:  effInv,
            borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)',
            fill: true, tension: 0.3, pointRadius: 0, borderDash: [5, 3], borderWidth: 2,
          },
        ],
      }
    }

    // ── CASE 2: No price history yet — build invested timeline from CSV ────
    // Generate weekly dates from FIRST BUY DATE to today
    const dates: string[] = []
    const cur = new Date(firstBuy)
    while (cur.toISOString().split('T')[0] <= today) {
      dates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 7)
    }
    if (dates[dates.length - 1] !== today) dates.push(today)

    const n   = dates.length
    const fmt = n > 52
      ? (s: string) => new Date(s).toLocaleDateString('en-IN', { month:'short', year:'2-digit' })
      : (s: string) => new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })

    return {
      labels: dates.map(fmt),
      datasets: [{
        label: `Cumulative Invested (${fL(totalInvested)})`,
        data:  dates.map(cumulativeAt),
        borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)',
        fill: true, tension: 0.3, pointRadius: 0, borderDash: [5, 3], borderWidth: 2,
      }],
    }
  }, [portfolioHistory, holdings, pnl.totalInvested, isDark])

  /* ── Benchmark comparison ────────────────────────────────────────────────
     Both portfolio and index values are in ACTUAL RUPEES (₹).
     Index value = "if you had invested ₹totalInvested in this index
                    on the date you made your first stock purchase"
     This gives a true apples-to-apples comparison.
  ── */
  const { benchmarkData, myReturn, primaryIndexReturn, beatingPrimary } = useMemo(() => {
    const empty = {
      benchmarkData: { labels: [] as string[], datasets: [] },
      myReturn: 0, primaryIndexReturn: 0, beatingPrimary: false,
    }
    if (!portfolioHistory.length) return empty
    // Check if we have any index data at all
    const hasAnyIndex = benchmarkIndices.some(id => (indexHistories[id]?.length || 0) > 1)

    // Find earliest date where we have BOTH portfolio AND at least one index
    const hasIndex = benchmarkIndices.some(id => (indexHistories[id]?.length || 0) > 1)
    const firstBuy = [...holdings]
      .map(h => h.buy_date || '').filter(Boolean).sort()[0] || portfolioHistory[0].date

    // Trim portfolioHistory to start from firstBuy
    const portTrimmed = portfolioHistory.filter(p => p.date >= firstBuy)
    if (!portTrimmed.length) return empty

    const n   = portTrimmed.length
    const fmt = n > 90
      ? (d: string) => new Date(d).toLocaleDateString('en-IN', { month:'short', year:'2-digit' })
      : (d: string) => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })

    const labels    = portTrimmed.map(p => fmt(p.date))
    const portFirst = portTrimmed[0].close
    const portLast  = portTrimmed[portTrimmed.length - 1].close
    const myRet     = portFirst > 0 ? ((portLast - portFirst) / portFirst) * 100 : 0

    // Build index datasets
    const indexDatasets = benchmarkIndices
      .filter(id => (indexHistories[id]?.length || 0) > 1)
      .map(id => {
        const idx    = INDEX_TICKERS[id]
        const idxPts = indexHistories[id]  // already trimmed from firstBuy in useEffect
        const idxMap = new Map(idxPts.map(p => [p.date, p.close]))

        // Align to portfolio trimmed dates with fill-forward
        const aligned: number[] = []
        let lastVal = idxPts[0]?.close || portFirst
        for (const { date } of portTrimmed) {
          const v = idxMap.get(date)
          if (v !== undefined && v > 0) { lastVal = v; aligned.push(v) }
          else { aligned.push(lastVal) }
        }

        return {
          label: idx.label,
          data:  aligned,
          borderColor: idx.color,
          backgroundColor: 'transparent',
          fill: false, tension: 0.4,
          pointRadius: n > 60 ? 0 : 2,
          borderWidth: 1.8,
        }
      })

    // Return calculation
    const primaryId  = benchmarkIndices.find(id => (indexHistories[id]?.length || 0) > 1)
    const primPts    = primaryId ? indexHistories[primaryId] : []
    const primFirst  = primPts[0]?.close || 1
    const primLast   = primPts[primPts.length - 1]?.close || primFirst
    const primRet    = primFirst > 0 ? ((primLast - primFirst) / primFirst) * 100 : 0

    return {
      benchmarkData: {
        labels,
        datasets: [
          {
            label: 'My Portfolio (₹)',
            data:  portTrimmed.map(p => p.close),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139,92,246,0.07)',
            fill: true, tension: 0.4,
            pointRadius: n > 60 ? 0 : 2,
            borderWidth: 2.5,
          },
          ...indexDatasets,
        ],
      },
      myReturn:           myRet,
      primaryIndexReturn: primRet,
      beatingPrimary:     myRet > primRet,
    }
  }, [portfolioHistory, indexHistories, benchmarkIndices])

  const lineOpts = (_yLabel: string) => ({
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        ticks: { color: isDark ? '#6B6486' : '#8875B5', font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        ticks: {
          color: isDark ? '#6B6486' : '#8875B5',
          font: { size: 10 },
          callback: (v: string | number) => fL(Number(v)),
        },
      },
    },
    plugins: {
      legend: {
        display: true, position: 'top' as const,
        labels: { color: isDark ? '#A89EC0' : '#4B3F72', font: { size: 11 }, boxWidth: 12, padding: 14 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw: unknown }) =>
            ` ${ctx.dataset.label}: ${fL(ctx.raw as number)}`,
        },
        mode: 'index' as const, intersect: false,
      },
    },
    interaction: { mode: 'index' as const, intersect: false },
  })

  /* ── Mini sparkline — draws prev_close→ltp arc when quote loaded ── */
  const sparkData = (h: StockWithQuote) => {
    const q      = h.quote
    const hasQ   = q && isFinite(q.ltp) && q.ltp > 0
    const ltp    = hasQ ? q!.ltp  : h.avg_buy_price
    const prev   = hasQ ? (q!.prev_close || h.avg_buy_price) : h.avg_buy_price
    const open   = hasQ ? (q!.open  || prev) : prev
    const high   = hasQ ? (q!.high  || Math.max(prev, ltp)) : ltp
    const low    = hasQ ? (q!.low   || Math.min(prev, ltp)) : ltp
    const color  = h.pnl > 0 ? '#10B981' : h.pnl < 0 ? '#EF4444' : '#8B5CF6'

    // 6 points showing open → high/low midpoints → close arc
    const data = hasQ
      ? [prev, open, (open + high) / 2, (open + low) / 2, (ltp + prev) / 2, ltp]
      : [h.avg_buy_price, h.avg_buy_price]  // flat when no data

    return {
      labels: data.map((_, i) => String(i)),
      datasets: [{
        data,
        borderColor: hasQ ? color : isDark ? '#2D2B3D' : '#D1D5DB',
        backgroundColor: hasQ ? color + '15' : 'transparent',
        fill: hasQ, tension: 0.5, pointRadius: 0, borderWidth: hasQ ? 2 : 1,
      }],
    }
  }

  const sparkOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { display: false }, y: { display: true, grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }, ticks: { color: isDark ? '#6B6486' : '#8875B5', font: { size: 9 }, callback: (v: string | number) => '₹' + (Number(v) / 1000).toFixed(0) + 'K' } } },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { raw: unknown }) => fi(ctx.raw as number) } } },
  }

  /* ── Handlers ── */
  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const handleSearch = async (q: string) => {
    setSearchQ(q)
    setForm(f => ({ ...f, symbol: q.toUpperCase(), company_name: '' }))
    if (q.length >= 2) { setSearchRes(await searchStocks(q)); setDropOpen(true) }
    else setDropOpen(false)
  }

  const pickStock = (s: typeof POPULAR_STOCKS[0]) => {
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
    else { setHoldings(prev => [base, ...prev]); setLoading(true) }
    setShowModal(false)
  }

  const handleImportDone = (imported: StockHolding[]) => {
    setHoldings(prev => {
      const existingSymbols = new Set(prev.map(h => h.symbol))
      const newOnes = imported.filter(h => !existingSymbols.has(h.symbol))
      const merged = imported.filter(h => existingSymbols.has(h.symbol)).map(imp => {
        const existing = prev.find(h => h.symbol === imp.symbol)!
        const totalQty = existing.quantity + imp.quantity
        const avgPrice = ((existing.quantity * existing.avg_buy_price) + (imp.quantity * imp.avg_buy_price)) / totalQty
        return { ...existing, quantity: totalQty, avg_buy_price: +avgPrice.toFixed(2) }
      })
      const unchanged = prev.filter(h => !imported.find(i => i.symbol === h.symbol))
      return [...unchanged, ...merged, ...newOnes]
    })
    setShowImport(false)
    setLoading(true)
  }

  /* ── CSS shorthands ── */
  const bdC = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.06)'
  const thC = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(124,58,237,0.04)'

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className={styles.page}>

      {/* ── PAGE HEADER ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Stock Tracker</h1>
          <p className={styles.sub}>
            NSE / BSE · Live prices
            {quotes.size > 0 && <span className={styles.updated}> · {quotes.size}/{holdings.length} quotes loaded</span>}
            {updatedAt && <span className={styles.updated}> · {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            {' '}
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99,
              background: isMarketOpen() ? 'var(--pos-bg)' : 'var(--gold-bg)',
              color: isMarketOpen() ? 'var(--pos)' : 'var(--gold)',
            }}>
              {isMarketOpen() ? '● Market Open' : '○ Market Closed'}
            </span>
          </p>
        </div>
        <div className={styles.hActions}>
          {hasData && (
            <button className={`${styles.iconBtn} ${refreshing ? styles.spin : ''}`}
              onClick={() => { setRefreshing(true); loadQuotes(holdings, true) }} title="Refresh prices — fetches current market prices">↻
            </button>
          )}
          <button className={styles.importBtn} onClick={() => setShowImport(true)}>⬆ Import CSV</button>
          <button className={styles.addBtn} onClick={openAdd}>＋ Add Stock</button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          EMPTY STATE
      ══════════════════════════════════════════════════════════════════ */}
      {!hasData && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📈</div>
          <h2 className={styles.emptyTitle}>No stocks added yet</h2>
          <p className={styles.emptyDesc}>
            Start building your portfolio by adding your first stock holding.<br />
            Track NSE &amp; BSE stocks with live prices, P&amp;L, and sector analysis.
          </p>
          <button className={styles.emptyBtn} onClick={openAdd}>＋ Add Your First Stock</button>
          <div className={styles.emptyHints}>
            <div className={styles.hint}><span>📊</span> Live NSE / BSE prices</div>
            <div className={styles.hint}><span>🏥</span> Portfolio health score</div>
            <div className={styles.hint}><span>🥧</span> Sector allocation chart</div>
            <div className={styles.hint}><span>📉</span> Benchmark vs Nifty 50</div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PORTFOLIO DATA (only shown when holdings exist)
      ══════════════════════════════════════════════════════════════════ */}
      {hasData && (
        <>
          {/* ── SUMMARY STRIP ── */}
          <div className={styles.strip}>
            {[
              { label: 'Invested',    val: fL(pnl.totalInvested), color: 'var(--text-primary)' },
              (() => {
                // Determine if we have live prices or only CSV stub prices
                const hasLive = [...quotes.values()].some(q => q.last_updated !== 'csv')
                const timeLabel = hasLive && updatedAt
                  ? `Live · ${updatedAt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })}`
                  : quoteError
                    ? 'Using last known price'
                    : 'Fetching live…'
                return { label: 'Current', val: fL(pnl.currentValue), sub: timeLabel, color: hasLive ? 'var(--brand)' : 'var(--text-secondary)' }
              })(),
              (() => {
                const hasLive = [...quotes.values()].some(q => q.last_updated !== 'csv')
                const pnlVal  = hasLive ? (pnl.totalPnL >= 0 ? '+' : '') + fL(pnl.totalPnL) : '—'
                const pnlSub  = hasLive
                  ? (pnl.totalPnLPct >= 0 ? '+' : '') + pnl.totalPnLPct.toFixed(2) + '% overall'
                  : quoteError ? quoteError : 'Awaiting live prices'
                return { label: 'Total P&L', val: pnlVal, sub: pnlSub, color: pnl.totalPnL >= 0 ? 'var(--pos)' : 'var(--neg)' }
              })(),
              (() => {
                const hasLive = [...quotes.values()].some(q => q.last_updated !== 'csv')
                const open    = isMarketOpen()
                const dayVal  = hasLive && open ? (pnl.dayPnL >= 0 ? '+' : '') + fL(pnl.dayPnL) : '—'
                const daySub  = !hasLive ? 'Awaiting live prices' : open ? (pnl.dayPnLPct >= 0 ? '+' : '') + pnl.dayPnLPct.toFixed(2) + '% today' : 'Market closed'
                return { label: open ? "Today's P&L" : "Last Session P&L", val: dayVal, sub: daySub, color: pnl.dayPnL >= 0 ? 'var(--pos)' : 'var(--neg)' }
              })(),
            ].map(c => (
              <div key={c.label} className={styles.sCard}>
                <div className={styles.sLabel}>{c.label}</div>
                <div className={styles.sVal} style={{ color: c.color }}>{c.val}</div>
                {c.sub && <div style={{ fontSize: 11.5, color: c.color, opacity: 0.8, marginTop: 2 }}>{c.sub}</div>}
              </div>
            ))}

            {/* Health score card */}
            <div className={`${styles.sCard} ${styles.healthCard}`} ref={healthRef}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div className={styles.sLabel} style={{ marginBottom: 0 }}>Health Score</div>
                {/* Info button */}
                <button
                  onClick={() => setShowHealthInfo(v => !v)}
                  style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border-hover)', background: 'var(--brand-pale)', color: 'var(--brand)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  title="How is this calculated?"
                >ⓘ</button>
              </div>

              <div className={styles.healthRow}>
                <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="17" fill="none" stroke="var(--border)" strokeWidth="4" />
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
                  <div style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: health.risk_level === 'Low' ? 'var(--pos-bg)' : health.risk_level === 'Moderate' ? 'var(--gold-bg)' : 'var(--neg-bg)', color: health.risk_level === 'Low' ? 'var(--pos)' : health.risk_level === 'Moderate' ? 'var(--gold)' : 'var(--neg)' }}>
                    {health.risk_level} Risk
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{health.sector_count} sectors</div>
                </div>
              </div>

              {/* ── HEALTH TOOLTIP PANEL ── */}
              {showHealthInfo && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  marginTop: 8, background: 'var(--bg-primary)',
                  border: '1px solid var(--border-hover)', borderRadius: 14,
                  padding: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                  width: 320,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                    How health score is calculated
                  </div>
                  {HEALTH_INFO.formula.map(f => (
                    <div key={f.label} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                      Risk levels explained
                    </div>
                    {Object.entries(HEALTH_INFO.risk).map(([level, desc]) => (
                      <div key={level} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, flexShrink: 0, marginTop: 1, background: level === 'Low' ? 'var(--pos-bg)' : level === 'Moderate' ? 'var(--gold-bg)' : 'var(--neg-bg)', color: level === 'Low' ? 'var(--pos)' : level === 'Moderate' ? 'var(--gold)' : 'var(--neg)' }}>
                          {level}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    Score is recalculated live every time prices refresh. Max score = 100.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── HOLDINGS TABLE + DETAIL ── */}
          <div className={styles.body}>
            <div className={styles.tableCard}>
              <div className={styles.tableTop}>
                <div className={styles.searchWrap}>
                  <span className={styles.searchIco}>🔍</span>
                  <input type="text" placeholder="Search symbol, company, sector…"
                    value={filter} onChange={e => setFilter(e.target.value)}
                    className={styles.searchInput} />
                </div>
                <span className={styles.hCount}>{enriched.length} holdings</span>
              </div>

              {loading ? (
                <div style={{ padding: '8px 20px' }}>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} style={{ height: 38, borderRadius: 8, margin: '5px 0', background: `linear-gradient(90deg, var(--border) 25%, var(--bg-tertiary) 50%, var(--border) 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.3s infinite' }} />
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'Symbol',   field: 'symbol'        as SortField, align: 'left' },
                          { label: 'Company',  field: null,            align: 'left' },
                          { label: 'Qty',      field: 'quantity'      as SortField, align: 'right' },
                          { label: 'Avg Cost', field: null,            align: 'right' },
                          { label: 'LTP',      field: null,            align: 'right' },
                          { label: 'Value',    field: 'current_value' as SortField, align: 'right' },
                          { label: 'P&L',      field: 'pnl'           as SortField, align: 'right' },
                          { label: 'P&L %',    field: 'pnl_pct'       as SortField, align: 'right' },
                          { label: 'Sector',   field: null,            align: 'left' },
                          { label: '',         field: null,            align: 'right' },
                        ].map(({ label, field, align }) => (
                          <th key={label}
                            onClick={() => field && handleSort(field)}
                            style={{ textAlign: align as 'left' | 'right', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', padding: '9px 12px', borderBottom: `1px solid var(--border)`, background: thC, cursor: field ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}
                          >
                            {label}{field && <span style={{ marginLeft: 3, opacity: 0.5, fontSize: 9 }}>{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(h => {
                        const sel = selected?.id === h.id
                        const sc = SECTOR_COLORS[h.sector || 'Other'] || '#94A3B8'
                        return (
                          <tr key={h.id} onClick={() => setSelected(sel ? null : h)}
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
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                              {h.quote && h.quote.ltp > 0
                                ? <span style={{ color: h.quote.change >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fi(h.quote.ltp)}</span>
                                : <span style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>···</span>
                              }
                            </td>
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{fL(h.current_value)}</td>
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                              {h.quote && h.quote.ltp > 0
                                ? <span style={{ color: h.pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{h.pnl >= 0 ? '+' : ''}{fL(h.pnl)}</span>
                                : <span style={{ color: 'var(--text-muted)' }}>···</span>
                              }
                            </td>
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}`, textAlign: 'right' }}>
                              {h.quote && h.quote.ltp > 0
                                ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: h.pnl_pct >= 0 ? 'var(--pos-bg)' : 'var(--neg-bg)', color: h.pnl_pct >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                    {h.pnl_pct >= 0 ? '↑' : '↓'} {Math.abs(h.pnl_pct).toFixed(2)}%
                                  </span>
                                : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>···</span>
                              }
                            </td>
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: sc + '22', color: sc }}>{h.sector || 'Other'}</span>
                            </td>
                            <td style={{ padding: '10px 12px', borderBottom: `1px solid ${bdC}` }}>
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                {[{ icon: '✏', fn: (e: React.MouseEvent) => { e.stopPropagation(); openEdit(h) } }, { icon: '🗑', fn: (e: React.MouseEvent) => { e.stopPropagation(); handleDelete(h.id) } }].map(({ icon, fn }) => (
                                  <button key={icon} onClick={fn}
                                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}
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
            </div>

            {/* ── DETAIL PANEL ── */}
            {selected && (
              <div className={`${styles.detail} slide-in`}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>{selected.symbol}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{selected.company_name}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</button>
                </div>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  {selected.quote && selected.quote.last_updated !== 'csv' ? (
                    <>
                      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                        {fi(selected.quote.ltp)}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: selected.quote.change >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                        {selected.quote.change >= 0 ? '▲' : '▼'} {selected.quote.change >= 0 ? '+' : ''}{selected.quote.change.toFixed(2)} ({selected.quote.change_pct >= 0 ? '+' : ''}{selected.quote.change_pct.toFixed(2)}%)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                        Updated {new Date(selected.quote.last_updated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </>
                  ) : (
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-tertiary)' }}>
                        {fi(selected.avg_buy_price)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Avg cost · live price loading…
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ height: 120 }}>
                  <Line key={selected.id} data={sparkData(selected)} options={sparkOpts as never} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-tertiary)', borderRadius: 12, padding: 10 }}>
                  {[
                    { l: 'Open',      v: selected.quote?.last_updated !== 'csv' && selected.quote ? fi(selected.quote.open) : '—', c: '' },
                    { l: 'High',      v: selected.quote?.last_updated !== 'csv' && selected.quote ? fi(selected.quote.high) : '—', c: 'var(--pos)' },
                    { l: 'Low',       v: selected.quote?.last_updated !== 'csv' && selected.quote ? fi(selected.quote.low) : '—', c: 'var(--neg)' },
                    { l: 'Prev Close',v: selected.quote?.last_updated !== 'csv' && selected.quote ? fi(selected.quote.prev_close) : '—', c: '' },
                    { l: '52W High',  v: selected.quote?.week_52_high ? fi(selected.quote.week_52_high) : '—', c: 'var(--pos)' },
                    { l: '52W Low',   v: selected.quote?.week_52_low  ? fi(selected.quote.week_52_low)  : '—', c: 'var(--neg)' },
                    { l: 'P/E',       v: selected.quote?.pe_ratio ? selected.quote.pe_ratio.toFixed(1) : '—', c: '' },
                    { l: 'Volume',    v: selected.quote?.last_updated !== 'csv' && selected.quote?.volume ? (selected.quote.volume / 1e5).toFixed(1) + 'L' : '—', c: '' },
                  ].map(({ l, v, c }) => (
                    <div key={l}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: c || 'var(--text-primary)' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { l: 'Qty held', v: `${selected.quantity} shares`, c: '' },
                    { l: 'Avg cost', v: fi(selected.avg_buy_price), c: '' },
                    { l: 'Invested', v: fL(selected.invested_value), c: '' },
                    { l: 'Current',  v: selected.quote ? fL(selected.current_value) : '···', c: selected.quote?.last_updated === 'csv' ? 'var(--text-secondary)' : 'var(--brand)' },
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

          {/* ══════════════════════════════════════════════════════════════════
              CHARTS ROW 1 — Allocation + P&L Line
          ══════════════════════════════════════════════════════════════════ */}
          <div className={styles.chartsRow}>

            {/* ── SECTOR ALLOCATION — Fixed layout, no overlap ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <div className={styles.chartTitle}>Sector Allocation</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sectorEntries.length} sectors</div>
              </div>
              {/* Donut on top, legend below — prevents overlap */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
                  <Doughnut
                    data={{
                      labels: sectorEntries.map(([s]) => s),
                      datasets: [{
                        data: sectorEntries.map(([, v]) => v),
                        backgroundColor: sectorEntries.map(([s]) => SECTOR_COLORS[s] || '#94A3B8'),
                        borderWidth: 2,
                        borderColor: isDark ? '#111118' : '#ffffff',
                        hoverOffset: 6,
                      }],
                    }}
                    options={{
                      cutout: '68%',
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: ctx => {
                              const pct = pnl.currentValue > 0 ? ((ctx.raw as number / pnl.currentValue) * 100).toFixed(1) : '0'
                              return ` ${ctx.label}: ${pct}% (${fL(ctx.raw as number)})`
                            },
                          },
                        },
                      },
                      animation: { animateRotate: true, duration: 900 },
                    }}
                  />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-primary)' }}>{sectorEntries.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>sectors</span>
                  </div>
                </div>
                {/* Legend — full width below chart, no overlap */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sectorEntries.map(([s, v]) => {
                    const pct = pnl.currentValue > 0 ? (v / pnl.currentValue) * 100 : 0
                    const color = SECTOR_COLORS[s] || '#94A3B8'
                    return (
                      <div key={s}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
                            {s}
                          </span>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{fL(v)}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 42, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 99, transition: 'width .8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── P&L LINE CHART ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <div className={styles.chartTitle}>Portfolio Growth</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Invested: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fL(pnl.totalInvested)}</span></span>
                  <span style={{ color: 'var(--text-tertiary)' }}>Current: <span style={{ color: 'var(--pos)', fontWeight: 600 }}>{fL(pnl.currentValue)}</span></span>
                </div>
              </div>
              <div style={{ height: 220 }}>
                {histLoading ? (
                  <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--text-tertiary)', fontSize:13 }}>
                    <div style={{ animation:'spin .8s linear infinite', fontSize:22 }}>⚙</div>
                    Loading price history…
                  </div>
                ) : !pnlLineData ? (
                  <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)', fontSize:13 }}>
                    Price history unavailable — live P&amp;L still shown above
                  </div>
                ) : (
                  <Line data={pnlLineData} options={lineOpts('₹') as never} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Invested: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fL(pnl.totalInvested)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Current: <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                    {quotes.size > 0 ? fL(pnl.currentValue) : <span style={{ color: 'var(--text-muted)' }}>Fetching prices…</span>}
                  </span>
                </div>
                {quotes.size > 0 && pnl.totalPnL !== 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    P&L: <span style={{ color: pnl.totalPnL >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>
                      {pnl.totalPnL >= 0 ? '+' : ''}{fL(pnl.totalPnL)} ({pnl.totalPnLPct >= 0 ? '+' : ''}{pnl.totalPnLPct.toFixed(2)}%)
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {quotes.size}/{holdings.length} live prices loaded
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              CHARTS ROW 2 — Benchmark Comparison (interactive)
          ══════════════════════════════════════════════════════════════════ */}
          <div className={styles.chartCardFull}>

            {/* Title + beating badge */}
            <div className={styles.chartHead}>
              <div>
                <div className={styles.chartTitle}>Portfolio vs Benchmark</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Simulates buying the selected index on each of your stock purchase dates with the same ₹ amounts — vs your actual portfolio performance
                </div>
              </div>
              {portfolioHistory.length > 0 && (
                <div style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  background: beatingPrimary ? 'var(--pos-bg)' : 'var(--neg-bg)',
                  color: beatingPrimary ? 'var(--pos)' : 'var(--neg)',
                }}>
                  {beatingPrimary
                    ? `🏆 Beating ${benchmarkIndices.length > 0 ? INDEX_TICKERS[benchmarkIndices[0]]?.label : 'Benchmark'}`
                    : `📉 Lagging ${benchmarkIndices.length > 0 ? INDEX_TICKERS[benchmarkIndices[0]]?.label : 'Benchmark'}`}
                </div>
              )}
            </div>

            {/* ── TIME RANGE SELECTOR ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginRight: 4 }}>Period:</span>
              {TIME_RANGES.map(r => (
                <button key={r.id} onClick={() => setTimeRange(r.id)}
                  style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    fontFamily: 'var(--font)', transition: 'all .12s',
                    background: timeRange === r.id ? 'var(--brand)' : 'transparent',
                    borderColor: timeRange === r.id ? 'var(--brand)' : 'var(--border)',
                    color: timeRange === r.id ? '#fff' : 'var(--text-secondary)',
                  }}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* ── INDEX SELECTOR ── */}
            <div style={{ marginBottom: 14 }}>
              {INDEX_GROUPS.map(group => (
                <div key={group.group} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                    {group.group}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {group.ids.map(id => {
                      const idx = INDEX_TICKERS[id]
                      const active = benchmarkIndices.includes(id)
                      return (
                        <button key={id}
                          onClick={() => {
                            setBenchmarkIndices(prev =>
                              prev.includes(id)
                                ? prev.filter(x => x !== id)
                                : [...prev, id]
                            )
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 11px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                            cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font)', transition: 'all .12s',
                            background: active ? idx.color + '20' : 'transparent',
                            borderColor: active ? idx.color + '80' : 'var(--border)',
                            color: active ? idx.color : 'var(--text-secondary)',
                          }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? idx.color : 'var(--border)', display: 'inline-block', flexShrink: 0 }} />
                          {idx.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* ── CHART ── */}
            {histLoading && (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 24, animation: 'spin .8s linear infinite', display: 'inline-block' }}>⚙</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Fetching real market data…</div>
              </div>
            )}
            {histError && (
              <div style={{ padding: '12px 14px', background: 'var(--gold-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 12.5, color: 'var(--gold)', marginBottom: 12 }}>
                ⚠ {histError}
              </div>
            )}
            {!histLoading && (
            <div style={{ height: 300 }}>
              <Line data={benchmarkData} options={{
                responsive: true, maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
                    ticks: { color: isDark ? '#6B6486' : '#8875B5', font: { size: 10 }, maxTicksLimit: 12 },
                  },
                  y: {
                    grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
                    ticks: {
                      color: isDark ? '#6B6486' : '#8875B5',
                      font: { size: 10 },
                      callback: (v: string | number) => fL(Number(v)),
                    },
                    title: {
                      display: true,
                      text: 'Value (₹) — same initial investment',
                      color: isDark ? '#6B6486' : '#8875B5',
                      font: { size: 10 },
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: true, position: 'top',
                    labels: { color: isDark ? '#A89EC0' : '#4B3F72', font: { size: 11 }, boxWidth: 12, padding: 16 },
                  },
                  tooltip: {
                    callbacks: {
                      title: (items) => items[0]?.label || '',
                      label: (ctx) => ` ${ctx.dataset.label}: ${fL(Number(ctx.raw))}`,
                    },
                    mode: 'index' as const,
                    intersect: false,
                  },
                },
                interaction: { mode: 'index' as const, intersect: false },
              } as never} />
            </div>
            )}

            {/* ── COMPARISON STAT CARDS ── */}
            {portfolioHistory.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(1 + benchmarkIndices.filter(id => indexHistories[id]?.length).length, 4)}, 1fr)`, gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                {/* My portfolio card */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #8B5CF6' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>My Portfolio</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: myReturn >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {myReturn >= 0 ? '+' : ''}{myReturn.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
                    {portfolioHistory.length > 0 ? fL(portfolioHistory[portfolioHistory.length-1].close) : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{timeRange} return</div>
                </div>
                {/* Index cards — only show indices with real data */}
                {benchmarkIndices.filter(id => (indexHistories[id]?.length || 0) > 0).map(id => {
                  const idx     = INDEX_TICKERS[id]
                  const idxPts  = indexHistories[id]
                  const first   = idxPts[0]?.close || 1
                  const last    = idxPts[idxPts.length-1]?.close || first
                  const ret     = first > 0 ? ((last - first) / first) * 100 : 0
                  const alpha   = myReturn - ret
                  return (
                    <div key={id} style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${idx.color}` }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{idx.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: ret >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                        {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
                        {fL(last)} <span style={{ fontSize: 10 }}>(if invested {fL(first)})</span>
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        <span style={{ color: alpha >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600, fontSize: 12 }}>
                          {alpha >= 0 ? '▲' : '▼'} Alpha {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, padding: '8px 0 0', borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
              Index lines show: "If you had invested {fL(pnl.totalInvested)} in this index on your first purchase date, what would it be worth?" · Data from Yahoo Finance · Delayed ~15 min
            </div>
          </div>
        </>
      )}

      {/* ── IMPORT MODAL ── */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImportDone} />}

      {/* ══════════════════════════════════════════════════════════════════
          ADD / EDIT MODAL
      ══════════════════════════════════════════════════════════════════ */}
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
                  <input type="text" placeholder="Search NSE symbol or company…"
                    value={searchQ} onChange={e => handleSearch(e.target.value)}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)' }}
                    autoComplete="off" />
                </div>
                {dropOpen && searchRes.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--border-hover)', borderRadius: 12, zIndex: 50, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    {searchRes.slice(0, 8).map(r => (
                      <div key={r.symbol} onClick={() => pickStock(r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, transition: 'background .1s' }}
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
                    No results — try:
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {POPULAR_STOCKS.slice(0, 10).map(s => (
                        <span key={s.symbol} onClick={() => pickStock(s)}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--brand-pale)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }}>{s.symbol}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Exchange + Sector */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Exchange', val: form.exchange, opts: ['NSE', 'BSE'], key: 'exchange' },
                  { label: 'Sector',   val: form.sector,   opts: SECTORS,        key: 'sector' },
                ].map(({ label, val, opts, key }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
                    <select value={val} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none', appearance: 'none' }}>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Qty + Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Quantity', ph: 'e.g. 50',   key: 'quantity' },
                  { label: 'Avg Buy Price (₹)', ph: 'e.g. 2480', key: 'avg_buy_price' },
                ].map(({ label, ph, key }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
                    <input type="number" placeholder={ph} value={form[key as keyof FormData]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                ))}
              </div>

              {/* Buy date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Buy Date</label>
                <input type="date" value={form.buy_date} max={new Date().toISOString().split('T')[0]}
                  onChange={e => setForm(f => ({ ...f, buy_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }} />
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
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--inp-bg)', border: '1px solid var(--inp-border)', borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text-primary)', outline: 'none' }} />
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
