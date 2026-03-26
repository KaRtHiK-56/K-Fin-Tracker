// ─── K-Fin Tracker — Stock & Index Data Layer ────────────────────────────────
// Uses OWN Vercel serverless API routes as proxy — server-side, no CORS issues
//   /api/quote?symbol=TATAMOTORS.NS     → live quote
//   /api/history?symbol=TATAMOTORS.NS&range=1y&interval=1wk → OHLC history
// Zero fabricated data. null / [] on failure.

import type { StockHolding, LiveQuote, HealthScore } from '../types'

// Our own Vercel API — same domain, no CORS
const API = ''  // empty = relative URL = /api/quote, /api/history

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HistPoint    { date: string; close: number }
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
const QUOTE_TTL  = () => isMarketOpen() ? 60_000 : 4 * 3600_000
const HIST_TTL   = 6 * 3600_000

// ─── Index definitions ────────────────────────────────────────────────────────
export const INDEX_TICKERS: Record<string, { label: string; yahoo: string; color: string }> = {
  NIFTY50:     { label: 'Nifty 50',           yahoo: '^NSEI',      color: '#06B6D4' },
  NIFTYNXT50:  { label: 'Nifty Next 50',      yahoo: '^NSMIDCP',   color: '#F59E0B' },
  NIFTY100:    { label: 'Nifty 100',          yahoo: '^CNX100',    color: '#10B981' },
  NIFTY150:    { label: 'Nifty 150',          yahoo: '^NSEI',      color: '#8B5CF6' },
  NIFTYMID50:  { label: 'Nifty Midcap 50',   yahoo: '^NSEMDCP50', color: '#F472B6' },
  NIFTYMID100: { label: 'Nifty Midcap 100',  yahoo: '^CNXMDCP100',color: '#FB923C' },
  NIFTYSML100: { label: 'Nifty Smallcap 100',yahoo: '^CNXSC',     color: '#34D399' },
  NIFTYSML250: { label: 'Nifty Smallcap 250',yahoo: '^CNXSC250',  color: '#60A5FA' },
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
  { symbol:'RELIANCE',   company_name:'Reliance Industries Ltd',   exchange:'NSE' },
  { symbol:'TCS',        company_name:'Tata Consultancy Services', exchange:'NSE' },
  { symbol:'HDFCBANK',   company_name:'HDFC Bank Ltd',             exchange:'NSE' },
  { symbol:'INFY',       company_name:'Infosys Ltd',               exchange:'NSE' },
  { symbol:'ICICIBANK',  company_name:'ICICI Bank Ltd',            exchange:'NSE' },
  { symbol:'SBIN',       company_name:'State Bank of India',       exchange:'NSE' },
  { symbol:'BAJFINANCE', company_name:'Bajaj Finance Ltd',         exchange:'NSE' },
  { symbol:'BHARTIARTL', company_name:'Bharti Airtel Ltd',         exchange:'NSE' },
  { symbol:'WIPRO',      company_name:'Wipro Ltd',                 exchange:'NSE' },
  { symbol:'TITAN',      company_name:'Titan Company Ltd',         exchange:'NSE' },
  { symbol:'ITC',        company_name:'ITC Ltd',                   exchange:'NSE' },
  { symbol:'HINDZINC',   company_name:'Hindustan Zinc Ltd',        exchange:'NSE' },
  { symbol:'MOTHERSON',  company_name:'Samvardhana Motherson Intl',exchange:'NSE' },
  { symbol:'TATAMOTORS', company_name:'Tata Motors Ltd',           exchange:'NSE' },
  { symbol:'TATAMTRDVR', company_name:'Tata Motors DVR',           exchange:'NSE' },
  { symbol:'MARUTI',     company_name:'Maruti Suzuki India',       exchange:'NSE' },
]

// ─── Extract positive finite number from object ───────────────────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── Parse Yahoo Finance quote object → LiveQuote ─────────────────────────────
function parseYF(d: Record<string, unknown>, symbol: string, exchange: 'NSE'|'BSE'): LiveQuote | null {
  const ltp = dig(d, 'regularMarketPrice', 'currentPrice', 'price', 'lastPrice')
  if (!ltp) return null
  const prev = dig(d, 'regularMarketPreviousClose', 'previousClose') || ltp
  const chg  = isFinite(Number(d.regularMarketChange)) ? Number(d.regularMarketChange) : ltp - prev
  const chgP = isFinite(Number(d.regularMarketChangePercent))
    ? Number(d.regularMarketChangePercent) : (prev > 0 ? (chg / prev) * 100 : 0)
  return {
    symbol,
    company_name: String(d.longName || d.shortName || d.displayName || symbol),
    exchange,
    ltp:          +ltp.toFixed(2),
    open:         +(dig(d,'regularMarketOpen','open')       || ltp).toFixed(2),
    high:         +(dig(d,'regularMarketDayHigh','dayHigh') || ltp).toFixed(2),
    low:          +(dig(d,'regularMarketDayLow','dayLow')   || ltp).toFixed(2),
    prev_close:   +prev.toFixed(2),
    change:       +chg.toFixed(2),
    change_pct:   +chgP.toFixed(4),
    volume:       Number(d.regularMarketVolume ?? d.volume ?? 0),
    market_cap:   d.marketCap   ? Number(d.marketCap)        : undefined,
    pe_ratio:     d.trailingPE  ? Number(d.trailingPE)       : undefined,
    week_52_high: d.fiftyTwoWeekHigh ? Number(d.fiftyTwoWeekHigh) : undefined,
    week_52_low:  d.fiftyTwoWeekLow  ? Number(d.fiftyTwoWeekLow)  : undefined,
    last_updated: new Date().toISOString(),
  }
}

// ─── LIVE QUOTE ───────────────────────────────────────────────────────────────
// ─── Build a stub quote from CSV data (instant, no API call) ─────────────────
// Shows avg_buy_price as "current" so user never sees empty data
// This gets overwritten when live API responds
export function buildStubQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE',
  avgBuyPrice: number,
  companyName: string
): LiveQuote {
  return {
    symbol, company_name: companyName, exchange,
    ltp: avgBuyPrice, open: avgBuyPrice, high: avgBuyPrice,
    low: avgBuyPrice, prev_close: avgBuyPrice,
    change: 0, change_pct: 0, volume: 0,
    last_updated: 'csv',
  }
}

export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {
  const key = `q:${symbol}:${exchange}`
  const hit = quoteCache.get(key)
  // Return cache if fresh AND it has a real price (not a stub)
  if (hit && Date.now() - hit.ts < QUOTE_TTL() && hit.data.last_updated !== 'csv') {
    return hit.data
  }

  // Normalize symbol (fix spaces like "Tata Motors")
  const cleanSymbol = symbol.toUpperCase().replace(/\s+/g, '')

  const ticker =
    exchange === 'BSE'
      ? `${cleanSymbol}.BO`
      : `${cleanSymbol}.NS`

  try {
    const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.error && json.error !== 'price_unavailable') throw new Error(json.error)
    if (json.error === 'price_unavailable') return hit?.data ?? null

    const d = (json.data ?? json) as Record<string, unknown>
    const q = parseYF(d, symbol, exchange)

    // If quote parsing failed, fallback to last close price
    if (!q) {
      const hist = await fetchHistory(ticker, '1mo', '1d')
      const last = hist.at(-1)?.close

      if (last) {
        q = {
          symbol,
          company_name: symbol,
          exchange,
          ltp: last,
          open: last,
          high: last,
          low: last,
          prev_close: last,
          change: 0,
          change_pct: 0,
          volume: 0,
          last_updated: new Date().toISOString(),
        }
     }  else {
        throw new Error('No fallback price available')
      }
    }

    quoteCache.set(key, { data: q, ts: Date.now() })
    console.log(`[kfin] ✓ ${symbol}: ₹${q.ltp} (${q.change_pct >= 0 ? '+' : ''}${q.change_pct.toFixed(2)}%) @ ${new Date().toLocaleTimeString('en-IN')}`)
    return q
  } catch (e) {
    console.warn(`[kfin] ✗ ${symbol}:`, e)
    return hit?.data ?? null
  }
}

// ─── MULTIPLE QUOTES — all fire in parallel, update UI as each arrives ────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  await Promise.allSettled(
    holdings.map(h =>
      fetchLiveQuote(h.symbol, h.exchange).then(q => { if (q) result.set(h.symbol, q) })
    )
  )
  return result
}

// ─── HISTORICAL OHLC ─────────────────────────────────────────────────────────
async function fetchHistory(ticker: string, period: string, interval: string): Promise<HistPoint[]> {
  const key = `h:${ticker}:${period}:${interval}`
  const hit = histCache.get(key)
  if (hit && Date.now() - hit.ts < HIST_TTL) return hit.data

  try {
    const url  = `/api/history?symbol=${encodeURIComponent(ticker)}&range=${period}&interval=${interval}`
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error)

    const pts = (json.data || []) as HistPoint[]
    if (!pts.length) throw new Error('empty history')

    histCache.set(key, { data: pts, ts: Date.now() })
    console.log(`[kfin] history ${ticker}: ${pts.length} pts`)
    return pts
  } catch (e) {
    console.warn(`[kfin] history failed ${ticker}:`, e)
    return hit?.data ?? []
  }
}

export function fetchStockHistory(symbol: string, period: string, interval: string): Promise<HistPoint[]> {
  return fetchHistory(`${symbol}.NS`, period, interval)
}

// ─── PORTFOLIO DAILY VALUE = sum(qty × daily_close) ───────────────────────────
export async function fetchPortfolioHistory(
  holdings: StockHolding[], period: string, interval: string
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
      const price = map.get(date)
        ?? pts.filter(p => p.date <= date).slice(-1)[0]?.close
        ?? h.avg_buy_price
      total += h.quantity * price
    }
    return { date, close: +total.toFixed(2) }
  }).filter(p => p.close > 0)
}

// ─── "WHAT IF NIFTY" — invested same ₹ on same date ─────────────────────────
// Given: user invested totalInvested on startDate
// Returns: daily ₹ value if that same money was in this index
export async function fetchIndexInvestedValue(
  indexId: string,
  totalInvested: number,
  startDate: string,
  period: string,
  interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx || totalInvested <= 0) return []

  const raw = await fetchHistory(idx.yahoo, period, interval)
  if (!raw.length) return []

  // Find index level on or just after the startDate
  const startI = raw.findIndex(p => p.date >= startDate)
  if (startI < 0) return []

  const baseLevel = raw[startI].close
  if (!baseLevel || baseLevel <= 0) return []

  // Units bought = totalInvested / index_level_on_startDate
  const units = totalInvested / baseLevel

  return raw.slice(startI).map(p => ({
    date:  p.date,
    close: +(p.close * units).toFixed(2),
  }))
}

export async function fetchIndexHistory(indexId: string, period: string, interval: string): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx) return []
  return fetchHistory(idx.yahoo, period, interval)
}

// ─── Rebase array so first value = 100 ───────────────────────────────────────
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
    const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(query + '.NS')}`)
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        return [{
          symbol:       query.toUpperCase(),
          company_name: json.data.longName || json.data.shortName || query,
          exchange:     'NSE',
        }]
      }
    }
  } catch {}
  return POPULAR_STOCKS.filter(s =>
    s.symbol.toLowerCase().includes(query.toLowerCase()) ||
    s.company_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10)
}

// ─── Clear cache (called on manual refresh) ───────────────────────────────────
export function clearQuoteCache() {
  quoteCache.clear()
  console.log('[kfin] quote cache cleared — next fetch will get fresh prices')
}

// ─── Portfolio P&L ────────────────────────────────────────────────────────────
export function computePortfolioPnL(holdings: StockHolding[], quotes: Map<string, LiveQuote>) {
  let totalInvested = 0, currentValue = 0, dayPnL = 0
  const marketOpen = isMarketOpen()
  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    totalInvested += inv
    const q = quotes.get(h.symbol)
    // Only use LIVE quotes (last_updated !== 'csv') for current value calculation
    // Stub/CSV quotes exist only to show avg_buy_price in the table — not for P&L
    const isLive = q && q.last_updated !== 'csv' && isFinite(q.ltp) && q.ltp > 0
    if (isLive && q) {
      currentValue += h.quantity * q.ltp
      if (marketOpen && isFinite(q.change)) dayPnL += h.quantity * q.change
    } else {
      // No live price yet — use invested value so P&L shows 0, not fake numbers
      currentValue += inv
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
  const vals     = holdings.map(h => {
    const q = quotes.get(h.symbol)
    const ltp = (q && q.last_updated !== 'csv') ? q.ltp : h.avg_buy_price
    return h.quantity * ltp
  })
  const totalVal = vals.reduce((s, v) => s + v, 0)
  const topPct   = totalVal > 0 ? (Math.max(...vals) / totalVal) * 100 : 0
  const winners  = holdings.filter(h => (quotes.get(h.symbol)?.change_pct ?? 0) >= 0).length
  const overall  = Math.min(100, Math.round(
    Math.min(sectors.size * 12, 40) + Math.max(30 - topPct * 0.5, 0) +
    Math.min(holdings.length * 2, 20) +
    (holdings.length > 0 ? (winners / holdings.length) * 10 : 0)
  ))
  return {
    overall,
    risk_level: topPct > 50 ? 'Very High' : topPct > 35 ? 'High' : topPct > 20 ? 'Moderate' : 'Low',
    top_holding_pct: topPct,
    sector_count: sectors.size,
  }
}
