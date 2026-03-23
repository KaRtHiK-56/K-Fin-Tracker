// ─── K-Fin Tracker — Stock & Index Data Layer ────────────────────────────────
// Live quotes:   Yahoo Finance via CORS proxies (no API key needed)
// Historical:    Yahoo Finance v8 chart via CORS proxy chain
// IMPORTANT: Uses only ES2017 features — no Promise.any, no AbortSignal.timeout

import type { StockHolding, LiveQuote, HealthScore } from '../types'

const API_BASE = import.meta.env.VITE_STOCK_API_BASE
  || 'https://military-jobye-haiqstudios-14f59639.koyeb.app'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HistPoint   { date: string; close: number }
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

// ─── Timeout wrapper (ES2017 compatible — no AbortSignal.timeout) ─────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ])
}

// ─── Extract positive finite number from an object ────────────────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── Build a LiveQuote from a raw YF data object ──────────────────────────────
function parseYF(d: Record<string, unknown>, symbol: string, exchange: 'NSE'|'BSE'): LiveQuote | null {
  const ltp = dig(d, 'regularMarketPrice', 'currentPrice', 'price', 'lastPrice', 'ask')
  if (!ltp) return null
  const prev = dig(d, 'regularMarketPreviousClose', 'previousClose') || ltp
  const chg  = isFinite(Number(d.regularMarketChange))  ? Number(d.regularMarketChange)  : ltp - prev
  const chgP = isFinite(Number(d.regularMarketChangePercent)) ? Number(d.regularMarketChangePercent) : (prev > 0 ? (chg / prev) * 100 : 0)
  return {
    symbol,
    company_name: String(d.longName || d.shortName || d.displayName || symbol),
    exchange,
    ltp:          +ltp.toFixed(2),
    open:         +(dig(d, 'regularMarketOpen', 'open')            || ltp).toFixed(2),
    high:         +(dig(d, 'regularMarketDayHigh', 'dayHigh')      || ltp).toFixed(2),
    low:          +(dig(d, 'regularMarketDayLow',  'dayLow')       || ltp).toFixed(2),
    prev_close:   +prev.toFixed(2),
    change:       +chg.toFixed(2),
    change_pct:   +chgP.toFixed(4),
    volume:       +(d.regularMarketVolume ?? d.volume ?? 0),
    market_cap:   d.marketCap   ? Number(d.marketCap)   : undefined,
    pe_ratio:     d.trailingPE  ? Number(d.trailingPE)  : undefined,
    week_52_high: d.fiftyTwoWeekHigh ? Number(d.fiftyTwoWeekHigh) : undefined,
    week_52_low:  d.fiftyTwoWeekLow  ? Number(d.fiftyTwoWeekLow)  : undefined,
    last_updated: new Date().toISOString(),
  }
}

// ─── Fetch via allorigins proxy ───────────────────────────────────────────────
async function allorigins(url: string): Promise<string> {
  const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  const res   = await withTimeout(fetch(proxy), 9000)
  if (!res.ok) throw new Error(`allorigins ${res.status}`)
  const json  = await res.json()
  if (!json.contents) throw new Error('allorigins empty')
  return json.contents as string
}

// ─── Fetch via corsproxy.io ───────────────────────────────────────────────────
async function corsproxy(url: string): Promise<string> {
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`
  const res   = await withTimeout(fetch(proxy), 9000)
  if (!res.ok) throw new Error(`corsproxy ${res.status}`)
  return res.text()
}

// ─── Try multiple proxies in sequence until one works ────────────────────────
async function fetchViaProxy(url: string): Promise<string> {
  const proxies = [allorigins, corsproxy]
  const errors: string[] = []
  for (const fn of proxies) {
    try { return await fn(url) }
    catch (e) { errors.push(String(e)) }
  }
  throw new Error(`All proxies failed: ${errors.join(' | ')}`)
}

// ─── LIVE QUOTE — Yahoo Finance v7 quote endpoint ────────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {
  const key = `q:${symbol}:${exchange}`
  const hit = quoteCache.get(key)
  if (hit && Date.now() - hit.ts < QUOTE_TTL()) return hit.data

  const ticker = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`

  // Try Yahoo Finance v7 (most reliable, returns quote object directly)
  const yf7url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`

  try {
    const text  = await fetchViaProxy(yf7url)
    const json  = JSON.parse(text)
    const r     = json?.quoteResponse?.result?.[0]
    if (r) {
      const q = parseYF(r as Record<string, unknown>, symbol, exchange)
      if (q) {
        quoteCache.set(key, { data: q, ts: Date.now() })
        console.log(`[kfin] ✓ ${symbol}: ₹${q.ltp} (${q.change_pct >= 0 ? '+' : ''}${q.change_pct.toFixed(2)}%)`)
        return q
      }
    }
  } catch (e) {
    console.warn(`[kfin] v7 failed ${symbol}:`, e)
  }

  // Fallback: Yahoo Finance v8 chart — extract last close from chart
  try {
    const v8url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`
    const text   = await fetchViaProxy(v8url)
    const json   = JSON.parse(text)
    const chart  = json?.chart?.result?.[0]
    if (chart) {
      const meta   = (chart.meta || {}) as Record<string, unknown>
      const closes = (chart.indicators?.quote?.[0]?.close || []) as (number | null)[]
      const last   = closes.filter((v): v is number => v != null && isFinite(v)).slice(-1)[0]
      if (last) {
        const synth: Record<string, unknown> = {
          ...meta,
          regularMarketPrice:         meta.regularMarketPrice || last,
          regularMarketPreviousClose: meta.previousClose || meta.chartPreviousClose || last,
        }
        const q = parseYF(synth, symbol, exchange)
        if (q) {
          quoteCache.set(key, { data: q, ts: Date.now() })
          console.log(`[kfin] ✓ ${symbol} (v8 fallback): ₹${q.ltp}`)
          return q
        }
      }
    }
  } catch (e) {
    console.warn(`[kfin] v8 failed ${symbol}:`, e)
  }

  // Last resort: Koyeb proxy
  try {
    const sym  = exchange === 'BSE' ? `${symbol}.BO` : symbol
    const res  = await withTimeout(fetch(`${API_BASE}/stock?symbol=${encodeURIComponent(sym)}`), 8000)
    if (res.ok) {
      const json = await res.json()
      const d    = (json?.data ?? json) as Record<string, unknown>
      const q    = parseYF(d, symbol, exchange)
      if (q) {
        quoteCache.set(key, { data: q, ts: Date.now() })
        console.log(`[kfin] ✓ ${symbol} (koyeb fallback): ₹${q.ltp}`)
        return q
      }
    }
  } catch (e) {
    console.warn(`[kfin] koyeb failed ${symbol}:`, e)
  }

  console.error(`[kfin] ✗ ALL sources failed for ${symbol}`)
  return hit?.data ?? null
}

// ─── Multiple quotes — all fire simultaneously ────────────────────────────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  await Promise.allSettled(
    holdings.map(h =>
      fetchLiveQuote(h.symbol, h.exchange).then(q => {
        if (q) result.set(h.symbol, q)
      })
    )
  )
  return result
}

// ─── Historical OHLC ─────────────────────────────────────────────────────────
async function fetchYahooHistory(ticker: string, period: string, interval: string): Promise<HistPoint[]> {
  const cacheKey = `h:${ticker}:${period}:${interval}`
  const hit = histCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < HIST_TTL) return hit.data

  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&events=history&includeAdjustedClose=true`

  try {
    const text  = await fetchViaProxy(yfUrl)
    const json  = JSON.parse(text)
    type YFC = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number|null)[] }>; adjclose?: Array<{ adjclose?: (number|null)[] }> } }> } }
    const chart = (json as YFC)?.chart?.result?.[0]
    if (!chart?.timestamp?.length) throw new Error('no timestamps')

    const ts      = chart.timestamp!
    const closes  = chart.indicators?.quote?.[0]?.close || []
    const adj     = chart.indicators?.adjclose?.[0]?.adjclose || closes

    const points: HistPoint[] = []
    for (let i = 0; i < ts.length; i++) {
      const c = adj[i] ?? closes[i]
      if (!c || !isFinite(c) || c <= 0) continue
      points.push({ date: new Date(ts[i] * 1000).toISOString().split('T')[0], close: +c.toFixed(2) })
    }
    points.sort((a, b) => a.date.localeCompare(b.date))
    if (!points.length) throw new Error('no valid points')

    histCache.set(cacheKey, { data: points, ts: Date.now() })
    console.log(`[kfin] history ${ticker}: ${points.length} pts`)
    return points
  } catch (e) {
    console.warn(`[kfin] history failed ${ticker}:`, e)
    return hit?.data ?? []
  }
}

// ─── Stock history ────────────────────────────────────────────────────────────
export async function fetchStockHistory(symbol: string, period: string, interval: string): Promise<HistPoint[]> {
  return fetchYahooHistory(`${symbol}.NS`, period, interval)
}

// ─── Portfolio daily value ───────────────────────────────────────────────────
export async function fetchPortfolioHistory(
  holdings: StockHolding[], period: string, interval: string
): Promise<HistPoint[]> {
  if (!holdings.length) return []
  const allHist = await Promise.all(
    holdings.map(h => fetchStockHistory(h.symbol, period, interval)
      .then(pts => ({ h, pts, map: new Map(pts.map(p => [p.date, p.close])) })))
  )
  const allDates = [...new Set(allHist.flatMap(({ pts }) => pts.map(p => p.date)))].sort()
  if (!allDates.length) return []
  return allDates.map(date => {
    let total = 0
    for (const { h, pts, map } of allHist) {
      const price = map.get(date) ?? pts.filter(p => p.date <= date).slice(-1)[0]?.close ?? h.avg_buy_price
      total += h.quantity * price
    }
    return { date, close: +total.toFixed(2) }
  }).filter(p => p.close > 0)
}

// ─── "What if Nifty" — invested same ₹ on same start date ────────────────────
export async function fetchIndexInvestedValue(
  indexId: string, totalInvested: number, startDate: string,
  period: string, interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx || totalInvested <= 0) return []
  const raw = await fetchYahooHistory(idx.yahoo, period, interval)
  if (!raw.length) return []
  const startI = raw.findIndex(p => p.date >= startDate)
  if (startI < 0) return []
  const base  = raw[startI].close
  if (!base || base <= 0) return []
  const units = totalInvested / base
  return raw.slice(startI).map(p => ({ date: p.date, close: +(p.close * units).toFixed(2) }))
}

export async function fetchIndexHistory(indexId: string, period: string, interval: string): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx) return []
  return fetchYahooHistory(idx.yahoo, period, interval)
}

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
    const res = await withTimeout(fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`), 5000)
    if (!res.ok) throw new Error()
    const json = await res.json()
    if (json.status !== 'success') return []
    return (json.results || []).slice(0, 10).map((r: { symbol: string; company_name?: string }) => ({
      symbol: r.symbol.replace('.NS','').replace('.BO',''),
      company_name: r.company_name || r.symbol,
      exchange: 'NSE',
    }))
  } catch {
    return POPULAR_STOCKS.filter(s =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.company_name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10)
  }
}

// ─── Portfolio P&L ────────────────────────────────────────────────────────────
export function computePortfolioPnL(holdings: StockHolding[], quotes: Map<string, LiveQuote>) {
  let totalInvested = 0, currentValue = 0, dayPnL = 0
  const marketOpen = isMarketOpen()
  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    totalInvested += inv
    const q = quotes.get(h.symbol)
    if (q && isFinite(q.ltp) && q.ltp > 0) {
      currentValue += h.quantity * q.ltp
      if (marketOpen && isFinite(q.change)) dayPnL += h.quantity * q.change
    } else {
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
  const vals     = holdings.map(h => h.quantity * (quotes.get(h.symbol)?.ltp ?? h.avg_buy_price))
  const totalVal = vals.reduce((s, v) => s + v, 0)
  const topPct   = totalVal > 0 ? (Math.max(...vals) / totalVal) * 100 : 0
  const winners  = holdings.filter(h => (quotes.get(h.symbol)?.change_pct ?? 0) >= 0).length
  const overall  = Math.min(100, Math.round(
    Math.min(sectors.size * 12, 40) + Math.max(30 - topPct * 0.5, 0) +
    Math.min(holdings.length * 2, 20) + (holdings.length > 0 ? (winners / holdings.length) * 10 : 0)
  ))
  return {
    overall,
    risk_level: topPct > 50 ? 'Very High' : topPct > 35 ? 'High' : topPct > 20 ? 'Moderate' : 'Low',
    top_holding_pct: topPct,
    sector_count: sectors.size,
  }
}

// ─── Clear quote cache (for manual refresh) ───────────────────────────────────
export function clearQuoteCache() {
  quoteCache.clear()
  console.log('[kfin] quote cache cleared')
}
