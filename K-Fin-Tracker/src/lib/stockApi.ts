// ─── K-Fin Tracker — Stock & Index Data Layer ────────────────────────────────
// Live quotes:  NSE proxy (military-jobye-haiqstudios-14f59639.koyeb.app)
// Historical:   Yahoo Finance v8 via multiple CORS proxies (fallback chain)
// RULE: Zero fabricated data. If fetch fails → return null / [].

import type { StockHolding, LiveQuote, HealthScore } from '../types'

const API_BASE = import.meta.env.VITE_STOCK_API_BASE
  || 'https://military-jobye-haiqstudios-14f59639.koyeb.app'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HistPoint { date: string; close: number }
export interface SearchResult { symbol: string; company_name: string; exchange: string }

// ─── Market hours IST ─────────────────────────────────────────────────────────
export function isMarketOpen(): boolean {
  const ist  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const mins = ist.getHours() * 60 + ist.getMinutes()
  const day  = ist.getDay()
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()
const histCache  = new Map<string, { data: HistPoint[]; ts: number }>()

// ─── Index definitions ────────────────────────────────────────────────────────
export const INDEX_TICKERS: Record<string, { label: string; yahoo: string; color: string }> = {
  NIFTY50:     { label: 'Nifty 50',           yahoo: '%5ENSEI',      color: '#06B6D4' },
  NIFTYNXT50:  { label: 'Nifty Next 50',      yahoo: '%5ENSMIDCP',   color: '#F59E0B' },
  NIFTY100:    { label: 'Nifty 100',          yahoo: '%5ECNX100',    color: '#10B981' },
  NIFTY150:    { label: 'Nifty 150',          yahoo: '%5ENSEI',      color: '#8B5CF6' },
  NIFTYMID50:  { label: 'Nifty Midcap 50',   yahoo: '%5ENISEMDCP50',color: '#F472B6' },
  NIFTYMID100: { label: 'Nifty Midcap 100',  yahoo: '%5ECNXMDCP100',color: '#FB923C' },
  NIFTYSML100: { label: 'Nifty Smallcap 100',yahoo: '%5ECNXSC',     color: '#34D399' },
  NIFTYSML250: { label: 'Nifty Smallcap 250',yahoo: '%5ECNXSC250',  color: '#60A5FA' },
}

export const INDEX_GROUPS = [
  { group: 'Broad Market', ids: ['NIFTY50','NIFTYNXT50','NIFTY100','NIFTY150'] },
  { group: 'Midcap',       ids: ['NIFTYMID50','NIFTYMID100'] },
  { group: 'Smallcap',     ids: ['NIFTYSML100','NIFTYSML250'] },
]

export const TIME_RANGES = [
  { id: '1M',  label: '1M',  period: '1mo',  interval: '1d'  },
  { id: '3M',  label: '3M',  period: '3mo',  interval: '1d'  },
  { id: '6M',  label: '6M',  period: '6mo',  interval: '1d'  },
  { id: '1Y',  label: '1Y',  period: '1y',   interval: '1wk' },
  { id: '3Y',  label: '3Y',  period: '3y',   interval: '1mo' },
  { id: '5Y',  label: '5Y',  period: '5y',   interval: '1mo' },
  { id: 'ALL', label: 'All', period: 'max',  interval: '1mo' },
]

export const POPULAR_STOCKS: SearchResult[] = [
  { symbol:'RELIANCE',   company_name:'Reliance Industries Ltd',      exchange:'NSE' },
  { symbol:'TCS',        company_name:'Tata Consultancy Services',     exchange:'NSE' },
  { symbol:'HDFCBANK',   company_name:'HDFC Bank Ltd',                 exchange:'NSE' },
  { symbol:'INFY',       company_name:'Infosys Ltd',                   exchange:'NSE' },
  { symbol:'ICICIBANK',  company_name:'ICICI Bank Ltd',                exchange:'NSE' },
  { symbol:'SBIN',       company_name:'State Bank of India',           exchange:'NSE' },
  { symbol:'BAJFINANCE', company_name:'Bajaj Finance Ltd',             exchange:'NSE' },
  { symbol:'BHARTIARTL', company_name:'Bharti Airtel Ltd',             exchange:'NSE' },
  { symbol:'WIPRO',      company_name:'Wipro Ltd',                     exchange:'NSE' },
  { symbol:'TITAN',      company_name:'Titan Company Ltd',             exchange:'NSE' },
  { symbol:'ITC',        company_name:'ITC Ltd',                       exchange:'NSE' },
  { symbol:'HINDZINC',   company_name:'Hindustan Zinc Ltd',            exchange:'NSE' },
  { symbol:'MOTHERSON',  company_name:'Samvardhana Motherson Intl',    exchange:'NSE' },
  { symbol:'TATAMOTORS', company_name:'Tata Motors Ltd',               exchange:'NSE' },
  { symbol:'TATAMTRDVR', company_name:'Tata Motors DVR',               exchange:'NSE' },
  { symbol:'MARUTI',     company_name:'Maruti Suzuki India',           exchange:'NSE' },
]

// ─── Live quote ───────────────────────────────────────────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {
  const key = `q:${symbol}:${exchange}`
  const hit = quoteCache.get(key)
  const ttl = isMarketOpen() ? 60_000 : 4 * 3600_000
  if (hit && Date.now() - hit.ts < ttl) return hit.data

  try {
    const sym = exchange === 'BSE' ? `${symbol}.BO` : symbol
    const url = `${API_BASE}/stock?symbol=${encodeURIComponent(sym)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()

    // Debug: log first quote response to console so we can see the actual structure
    if (import.meta.env.DEV || !quoteCache.size) {
      console.log(`[kfin] Quote response for ${symbol}:`, JSON.stringify(json).slice(0, 300))
    }

    // Proxy wraps in { status, data: {...} } — extract the data object
    const d = json?.data ?? json

    // Deep search for price across all known field names
    function getNum(...keys: string[]): number {
      for (const k of keys) {
        const v = d[k]
        if (v !== undefined && v !== null && isFinite(Number(v)) && Number(v) > 0) return Number(v)
      }
      return 0
    }

    const ltp = getNum(
      'regularMarketPrice', 'currentPrice', 'price',
      'lastPrice', 'close', 'previousClose'
    )
    if (!ltp) throw new Error(`No price in response. Keys: ${Object.keys(d).join(',')}`)

    const prev  = getNum('regularMarketPreviousClose', 'previousClose', 'prevClose') || ltp
    const open  = getNum('regularMarketOpen', 'open') || ltp
    const high  = getNum('regularMarketDayHigh', 'dayHigh', 'high') || ltp
    const low   = getNum('regularMarketDayLow', 'dayLow', 'low') || ltp
    const vol   = getNum('regularMarketVolume', 'volume') || 0
    const chg   = Number(d.regularMarketChange ?? d.change ?? (ltp - prev))
    const chgP  = Number(d.regularMarketChangePercent ?? d.changePercent ?? (prev > 0 ? ((ltp - prev) / prev) * 100 : 0))

    const quote: LiveQuote = {
      symbol,
      company_name: String(d.longName || d.shortName || d.companyName || d.name || symbol),
      exchange,
      ltp:          +ltp.toFixed(2),
      open:         +open.toFixed(2),
      high:         +high.toFixed(2),
      low:          +low.toFixed(2),
      prev_close:   +prev.toFixed(2),
      change:       +chg.toFixed(2),
      change_pct:   +chgP.toFixed(4),
      volume:       +vol,
      market_cap:   d.marketCap ? Number(d.marketCap) : undefined,
      pe_ratio:     d.trailingPE ? Number(d.trailingPE) : undefined,
      week_52_high: d.fiftyTwoWeekHigh ? Number(d.fiftyTwoWeekHigh) : undefined,
      week_52_low:  d.fiftyTwoWeekLow  ? Number(d.fiftyTwoWeekLow)  : undefined,
      last_updated: new Date().toISOString(),
    }

    quoteCache.set(key, { data: quote, ts: Date.now() })
    return quote
  } catch (e) {
    console.warn(`[kfin] Quote failed ${symbol}:`, e)
    return hit?.data ?? null
  }
}

// ─── Multiple quotes (batched) ────────────────────────────────────────────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  const BATCH  = 4  // keep parallel requests low to avoid rate limiting
  for (let i = 0; i < holdings.length; i += BATCH) {
    const batch   = holdings.slice(i, i + BATCH)
    const settled = await Promise.allSettled(
      batch.map(h => fetchLiveQuote(h.symbol, h.exchange))
    )
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        result.set(batch[idx].symbol, r.value)
      }
    })
    if (i + BATCH < holdings.length) await new Promise(r => setTimeout(r, 400))
  }
  return result
}

// ─── Yahoo Finance historical data ───────────────────────────────────────────
// Uses a chain of CORS proxies — tries each until one works
async function fetchYahooHistory(
  ticker: string,   // raw yahoo ticker e.g. "^NSEI" or "TATAMOTORS.NS"
  period: string,
  interval: string
): Promise<HistPoint[]> {
  const cacheKey = `h:${ticker}:${period}:${interval}`
  const hit = histCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < 6 * 3600_000) return hit.data

  // Yahoo Finance v8 chart URL
  const yfPath = `v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&events=history&includeAdjustedClose=true`

  // CORS proxy chain — try each until one succeeds
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/${yfPath}`)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://query2.finance.yahoo.com/${yfPath}`)}`,
    `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/${yfPath}`)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue

      let rawJson: unknown
      const text = await res.text()

      // allorigins wraps in { contents: "..." }
      if (proxyUrl.includes('allorigins')) {
        const wrap = JSON.parse(text)
        if (!wrap.contents) continue
        rawJson = JSON.parse(wrap.contents)
      } else {
        rawJson = JSON.parse(text)
      }

      const json   = rawJson as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }>; adjclose?: Array<{ adjclose?: number[] }> } }> } }
      const chart  = json?.chart?.result?.[0]
      if (!chart) continue

      const timestamps = chart.timestamp || []
      const closes     = chart.indicators?.quote?.[0]?.close || []
      const adjcloses  = chart.indicators?.adjclose?.[0]?.adjclose || closes

      const points: HistPoint[] = []
      for (let i = 0; i < timestamps.length; i++) {
        const c = adjcloses[i] ?? closes[i]
        if (!c || !isFinite(c) || c <= 0) continue
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        points.push({ date, close: +c.toFixed(2) })
      }
      points.sort((a, b) => a.date.localeCompare(b.date))
      if (!points.length) continue

      histCache.set(cacheKey, { data: points, ts: Date.now() })
      return points
    } catch { continue }
  }

  // All proxies failed
  console.warn(`Historical data unavailable for ${ticker}`)
  return hit?.data ?? []
}

// ─── Stock history ────────────────────────────────────────────────────────────
export async function fetchStockHistory(
  symbol: string, period: string, interval: string
): Promise<HistPoint[]> {
  return fetchYahooHistory(`${symbol}.NS`, period, interval)
}

// ─── Portfolio history — daily value = sum(qty × price) ──────────────────────
export async function fetchPortfolioHistory(
  holdings: StockHolding[],
  period:   string,
  interval: string
): Promise<HistPoint[]> {
  if (!holdings.length) return []

  // Fetch all stock histories in parallel
  const allHist = await Promise.all(
    holdings.map(h =>
      fetchStockHistory(h.symbol, period, interval)
        .then(pts => ({ h, pts, priceMap: new Map(pts.map(p => [p.date, p.close])) }))
    )
  )

  // Collect all trading dates across all stocks
  const allDates = [...new Set(allHist.flatMap(({ pts }) => pts.map(p => p.date)))].sort()
  if (!allDates.length) return []

  return allDates.map(date => {
    let totalValue = 0
    let covered = 0
    for (const { h, pts, priceMap } of allHist) {
      let price = priceMap.get(date)
      if (!price) {
        // Fill forward — use last available price before this date
        const prev = pts.filter(p => p.date <= date)
        price = prev.length ? prev[prev.length - 1].close : undefined
      }
      if (price && isFinite(price)) {
        totalValue += h.quantity * price
        covered++
      } else {
        // Fall back to avg_buy_price so the invested line stays accurate
        totalValue += h.quantity * h.avg_buy_price
        covered++
      }
    }
    return { date, close: +totalValue.toFixed(2) }
  }).filter(p => p.close > 0)
}

// ─── Index history ────────────────────────────────────────────────────────────
export async function fetchIndexHistory(
  indexId: string, period: string, interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx) return []
  // Decode %5E back to ^ for the actual ticker
  const ticker = decodeURIComponent(idx.yahoo)
  return fetchYahooHistory(ticker, period, interval)
}

// ─── Rebase to 100 ────────────────────────────────────────────────────────────
export function rebaseTo100(points: HistPoint[]): HistPoint[] {
  if (!points.length) return []
  const base = points[0].close
  if (!base || base <= 0) return []
  return points.map(p => ({ date: p.date, close: +((p.close / base) * 100).toFixed(3) }))
}

// ─── Search ───────────────────────────────────────────────────────────────────
export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (query.length < 2) return []
  try {
    const res  = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error()
    const json = await res.json()
    if (json.status !== 'success') return []
    return (json.results || []).slice(0, 10).map((r: { symbol: string; company_name?: string }) => ({
      symbol:       r.symbol.replace('.NS','').replace('.BO',''),
      company_name: r.company_name || r.symbol,
      exchange:     'NSE',
    }))
  } catch {
    return POPULAR_STOCKS.filter(s =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.company_name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10)
  }
}

// ─── Portfolio P&L — only real prices ────────────────────────────────────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes:   Map<string, LiveQuote>
) {
  let totalInvested = 0
  let currentValue  = 0
  let dayPnL        = 0
  const marketOpen  = isMarketOpen()

  holdings.forEach(h => {
    const invested = h.quantity * h.avg_buy_price
    totalInvested += invested
    const q = quotes.get(h.symbol)
    if (q && isFinite(q.ltp) && q.ltp > 0) {
      currentValue += h.quantity * q.ltp
      if (marketOpen && isFinite(q.change)) dayPnL += h.quantity * q.change
    } else {
      currentValue += invested  // no fake P&L when price unavailable
    }
  })

  const totalPnL    = currentValue - totalInvested
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const dayPnLPct   = (currentValue - dayPnL) > 0
    ? (dayPnL / (currentValue - dayPnL)) * 100 : 0

  return { totalInvested, currentValue, totalPnL, totalPnLPct, dayPnL, dayPnLPct }
}

// ─── Health score ─────────────────────────────────────────────────────────────
export function computeHealthScore(
  holdings: StockHolding[],
  quotes:   Map<string, LiveQuote>
): HealthScore {
  if (!holdings.length) return { overall:0, risk_level:'Low', top_holding_pct:0, sector_count:0 }
  const sectors  = new Set(holdings.map(h => h.sector || 'Other'))
  const vals     = holdings.map(h => h.quantity * (quotes.get(h.symbol)?.ltp ?? h.avg_buy_price))
  const totalVal = vals.reduce((s, v) => s + v, 0)
  const maxVal   = Math.max(...vals)
  const topPct   = totalVal > 0 ? (maxVal / totalVal) * 100 : 0
  const winners  = holdings.filter(h => (quotes.get(h.symbol)?.change_pct ?? 0) >= 0).length
  const overall  = Math.min(100, Math.round(
    Math.min(sectors.size * 12, 40) +
    Math.max(30 - topPct * 0.5, 0) +
    Math.min(holdings.length * 2, 20) +
    (holdings.length > 0 ? (winners / holdings.length) * 10 : 0)
  ))
  const risk_level = topPct > 50 ? 'Very High' : topPct > 35 ? 'High' : topPct > 20 ? 'Moderate' : 'Low'
  return { overall, risk_level, top_holding_pct: topPct, sector_count: sectors.size }
}
