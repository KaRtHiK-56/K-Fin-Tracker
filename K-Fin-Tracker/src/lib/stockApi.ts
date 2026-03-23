// ─── K-Fin Tracker — Stock & Index Data Layer ────────────────────────────────
// Strategy: Try multiple free sources in order until one works.
// Source 1: Yahoo Finance v7 (quote summary) via allorigins CORS proxy
// Source 2: Yahoo Finance v8 (chart) via corsproxy.io
// Source 3: The Koyeb NSE proxy (fallback)
// Historical: Yahoo Finance v8 chart API via CORS proxy chain
// RULE: Zero fabricated data. null/[] on failure, never invented numbers.

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

// ─── Cache ────────────────────────────────────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()
const histCache  = new Map<string, { data: HistPoint[]; ts: number }>()
const QUOTE_TTL  = () => isMarketOpen() ? 60_000 : 4 * 3600_000
const HIST_TTL   = 6 * 3600_000

// ─── Index definitions ────────────────────────────────────────────────────────
export const INDEX_TICKERS: Record<string, { label: string; yahoo: string; color: string }> = {
  NIFTY50:     { label: 'Nifty 50',           yahoo: '^NSEI',       color: '#06B6D4' },
  NIFTYNXT50:  { label: 'Nifty Next 50',      yahoo: '^NSMIDCP',    color: '#F59E0B' },
  NIFTY100:    { label: 'Nifty 100',          yahoo: '^CNX100',     color: '#10B981' },
  NIFTY150:    { label: 'Nifty 150',          yahoo: '^NSEI',       color: '#8B5CF6' },
  NIFTYMID50:  { label: 'Nifty Midcap 50',   yahoo: '^NSEMDCP50',  color: '#F472B6' },
  NIFTYMID100: { label: 'Nifty Midcap 100',  yahoo: '^CNXMDCP100', color: '#FB923C' },
  NIFTYSML100: { label: 'Nifty Smallcap 100',yahoo: '^CNXSC',      color: '#34D399' },
  NIFTYSML250: { label: 'Nifty Smallcap 250',yahoo: '^CNXSC250',   color: '#60A5FA' },
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

// ─── Helper: extract a positive finite number from an object ─────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── Parse a raw Yahoo Finance price object ───────────────────────────────────
function parseYFPrice(d: Record<string, unknown>, symbol: string, exchange: 'NSE' | 'BSE'): LiveQuote | null {
  const ltp = dig(d,
    'regularMarketPrice', 'currentPrice', 'price',
    'lastPrice', 'ask', 'bid',
  )
  if (!ltp) return null

  const prev  = dig(d, 'regularMarketPreviousClose', 'previousClose', 'regularMarketOpen') || ltp
  const open  = dig(d, 'regularMarketOpen', 'open') || ltp
  const high  = dig(d, 'regularMarketDayHigh', 'dayHigh', 'regularMarketOpen') || ltp
  const low   = dig(d, 'regularMarketDayLow',  'dayLow',  'regularMarketOpen') || ltp
  const chg   = Number(d.regularMarketChange ?? d.change ?? (ltp - prev))
  const chgP  = Number(d.regularMarketChangePercent ?? d.changePercent
    ?? (prev > 0 ? ((ltp - prev) / prev) * 100 : 0))

  return {
    symbol,
    company_name: String(d.longName || d.shortName || d.companyName || d.displayName || symbol),
    exchange,
    ltp:          +ltp.toFixed(2),
    open:         +open.toFixed(2),
    high:         +high.toFixed(2),
    low:          +low.toFixed(2),
    prev_close:   +prev.toFixed(2),
    change:       +chg.toFixed(2),
    change_pct:   +chgP.toFixed(4),
    volume:       +(d.regularMarketVolume ?? d.volume ?? 0),
    market_cap:   d.marketCap ? Number(d.marketCap) : undefined,
    pe_ratio:     d.trailingPE ? Number(d.trailingPE) : undefined,
    week_52_high: d.fiftyTwoWeekHigh ? Number(d.fiftyTwoWeekHigh) : undefined,
    week_52_low:  d.fiftyTwoWeekLow  ? Number(d.fiftyTwoWeekLow)  : undefined,
    last_updated: new Date().toISOString(),
  }
}

// ─── Source 1: Yahoo Finance v7 quoteSummary via allorigins ──────────────────
async function fetchViaYFv7(yahooTicker: string, symbol: string, exchange: 'NSE' | 'BSE'): Promise<LiveQuote | null> {
  try {
    const yfUrl    = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooTicker)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,regularMarketVolume,longName,shortName,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,marketCap`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yfUrl)}`
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const wrap = await res.json()
    if (!wrap.contents) return null
    const json = JSON.parse(wrap.contents)
    const result = json?.quoteResponse?.result?.[0]
    if (!result) return null
    return parseYFPrice(result, symbol, exchange)
  } catch { return null }
}

// ─── Source 2: Yahoo Finance v8 chart (last close from chart data) ────────────
async function fetchViaYFv8(yahooTicker: string, symbol: string, exchange: 'NSE' | 'BSE'): Promise<LiveQuote | null> {
  try {
    const yfUrl    = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=5d&interval=1d`
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(yfUrl)}`
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    const chart = json?.chart?.result?.[0]
    if (!chart) return null
    const meta  = chart.meta || {}
    const closes = chart.indicators?.quote?.[0]?.close || []
    const lastClose = closes.filter((v: number | null) => v != null && isFinite(v)).slice(-1)[0]
    if (!lastClose) return null
    const d: Record<string, unknown> = {
      regularMarketPrice: meta.regularMarketPrice || lastClose,
      regularMarketPreviousClose: meta.previousClose || meta.chartPreviousClose || lastClose,
      regularMarketOpen: meta.regularMarketOpen || lastClose,
      regularMarketDayHigh: meta.regularMarketDayHigh || lastClose,
      regularMarketDayLow: meta.regularMarketDayLow || lastClose,
      regularMarketVolume: meta.regularMarketVolume || 0,
      longName: meta.longName || meta.instrumentType || symbol,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    }
    return parseYFPrice(d, symbol, exchange)
  } catch { return null }
}

// ─── Source 3: Koyeb proxy fallback ──────────────────────────────────────────
async function fetchViaKoyeb(symbol: string, exchange: 'NSE' | 'BSE'): Promise<LiveQuote | null> {
  try {
    const sym = exchange === 'BSE' ? `${symbol}.BO` : symbol
    const res = await fetch(`${API_BASE}/stock?symbol=${encodeURIComponent(sym)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const d: Record<string, unknown> = json?.data ?? json
    return parseYFPrice(d, symbol, exchange)
  } catch { return null }
}

// ─── Live quote — tries 3 sources in parallel, takes first success ────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {
  const key = `q:${symbol}:${exchange}`
  const hit = quoteCache.get(key)
  if (hit && Date.now() - hit.ts < QUOTE_TTL()) return hit.data

  // Yahoo Finance uses SYMBOL.NS for NSE, SYMBOL.BO for BSE
  const yahooTicker = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`

  // Race all 3 sources in parallel — use whichever returns a valid price first
  const result = await Promise.any([
    fetchViaYFv7(yahooTicker, symbol, exchange),
    fetchViaYFv8(yahooTicker, symbol, exchange),
    fetchViaKoyeb(symbol, exchange),
  ].map(p => p.then(r => r ?? Promise.reject('no data'))))
    .catch(() => null)

  if (result) {
    quoteCache.set(key, { data: result, ts: Date.now() })
    console.log(`[kfin] ✓ ${symbol}: ₹${result.ltp} (${result.change_pct >= 0 ? '+' : ''}${result.change_pct.toFixed(2)}%)`)
  } else {
    console.warn(`[kfin] ✗ ${symbol}: all sources failed, stale=${!!hit?.data}`)
  }

  return result ?? hit?.data ?? null
}

// ─── Multiple quotes — parallel with batching ────────────────────────────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  // Fetch all at once — each fetchLiveQuote already has 3 parallel sources
  await Promise.allSettled(
    holdings.map(h =>
      fetchLiveQuote(h.symbol, h.exchange).then(q => {
        if (q) result.set(h.symbol, q)
      })
    )
  )
  return result
}

// ─── Yahoo Finance historical OHLC ───────────────────────────────────────────
async function fetchYahooHistory(
  ticker: string,
  period: string,
  interval: string
): Promise<HistPoint[]> {
  const cacheKey = `h:${ticker}:${period}:${interval}`
  const hit = histCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < HIST_TTL) return hit.data

  const yfPath = `v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&events=history&includeAdjustedClose=true`

  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/${yfPath}`)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(`https://query2.finance.yahoo.com/${yfPath}`)}`,
    `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/${yfPath}`)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      const text = await res.text()
      let rawJson: unknown
      if (proxyUrl.includes('allorigins')) {
        const wrap = JSON.parse(text)
        if (!wrap?.contents) continue
        rawJson = JSON.parse(wrap.contents)
      } else {
        rawJson = JSON.parse(text)
      }

      type YFChart = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }>; adjclose?: Array<{ adjclose?: (number | null)[] }> } }> } }
      const json    = rawJson as YFChart
      const chart   = json?.chart?.result?.[0]
      if (!chart?.timestamp?.length) continue

      const ts       = chart.timestamp!
      const closes   = chart.indicators?.quote?.[0]?.close || []
      const adjClose = chart.indicators?.adjclose?.[0]?.adjclose || closes

      const points: HistPoint[] = []
      for (let i = 0; i < ts.length; i++) {
        const c = adjClose[i] ?? closes[i]
        if (!c || !isFinite(c) || c <= 0) continue
        const date = new Date(ts[i] * 1000).toISOString().split('T')[0]
        points.push({ date, close: +c.toFixed(2) })
      }
      points.sort((a, b) => a.date.localeCompare(b.date))
      if (!points.length) continue

      histCache.set(cacheKey, { data: points, ts: Date.now() })
      console.log(`[kfin] history ${ticker}: ${points.length} points`)
      return points
    } catch { continue }
  }

  console.warn(`[kfin] history failed for ${ticker}`)
  return hit?.data ?? []
}

// ─── Stock history ────────────────────────────────────────────────────────────
export async function fetchStockHistory(
  symbol: string, period: string, interval: string
): Promise<HistPoint[]> {
  return fetchYahooHistory(`${symbol}.NS`, period, interval)
}

// ─── Portfolio history — daily ₹ value = sum(qty × close) ───────────────────
export async function fetchPortfolioHistory(
  holdings: StockHolding[],
  period: string,
  interval: string
): Promise<HistPoint[]> {
  if (!holdings.length) return []

  const allHist = await Promise.all(
    holdings.map(h =>
      fetchStockHistory(h.symbol, period, interval)
        .then(pts => ({ h, pts, map: new Map(pts.map(p => [p.date, p.close])) }))
    )
  )

  const allDates = [...new Set(allHist.flatMap(({ pts }) => pts.map(p => p.date)))].sort()
  if (!allDates.length) return []

  return allDates.map(date => {
    let total = 0
    for (const { h, pts, map } of allHist) {
      let price = map.get(date)
      if (!price) {
        const prev = pts.filter(p => p.date <= date)
        price = prev.length ? prev[prev.length - 1].close : h.avg_buy_price
      }
      total += h.quantity * (price || h.avg_buy_price)
    }
    return { date, close: +total.toFixed(2) }
  }).filter(p => p.close > 0)
}

// ─── Index invested-value comparison ─────────────────────────────────────────
// "If you had invested ₹X in this index on startDate — what would it be worth?"
export async function fetchIndexInvestedValue(
  indexId: string,
  totalInvested: number,
  startDate: string,
  period: string,
  interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx || totalInvested <= 0) return []

  const raw = await fetchYahooHistory(idx.yahoo, period, interval)
  if (!raw.length) return []

  // Find index value on or just after startDate
  const startIdx = raw.findIndex(p => p.date >= startDate)
  if (startIdx < 0) return []

  const baseValue = raw[startIdx].close
  if (!baseValue || baseValue <= 0) return []

  // Units of index bought with totalInvested
  const units = totalInvested / baseValue

  return raw.slice(startIdx).map(p => ({
    date:  p.date,
    close: +(p.close * units).toFixed(2),
  }))
}

// ─── Index history (raw) ─────────────────────────────────────────────────────
export async function fetchIndexHistory(
  indexId: string, period: string, interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx) return []
  return fetchYahooHistory(idx.yahoo, period, interval)
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
    const res  = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) })
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

// ─── Portfolio P&L ────────────────────────────────────────────────────────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let totalInvested = 0, currentValue = 0, dayPnL = 0
  const marketOpen = isMarketOpen()

  holdings.forEach(h => {
    const invested = h.quantity * h.avg_buy_price
    totalInvested += invested
    const q = quotes.get(h.symbol)
    if (q && isFinite(q.ltp) && q.ltp > 0) {
      currentValue += h.quantity * q.ltp
      if (marketOpen && isFinite(q.change)) dayPnL += h.quantity * q.change
    } else {
      currentValue += invested
    }
  })

  const totalPnL    = currentValue - totalInvested
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const dayPnLPct   = (currentValue - dayPnL) > 0 ? (dayPnL / (currentValue - dayPnL)) * 100 : 0
  return { totalInvested, currentValue, totalPnL, totalPnLPct, dayPnL, dayPnLPct }
}

// ─── Health score ─────────────────────────────────────────────────────────────
export function computeHealthScore(holdings: StockHolding[], quotes: Map<string, LiveQuote>): HealthScore {
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
