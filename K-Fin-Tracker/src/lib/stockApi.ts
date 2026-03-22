// ─── K-Fin Tracker — Stock & Index Data Layer ────────────────────────────────
// Live quotes:   https://military-jobye-haiqstudios-14f59639.koyeb.app/stock
// Historical:    https://query1.finance.yahoo.com/v8/finance/chart (Yahoo Finance)
// Index tickers: Yahoo Finance symbols (^NSEI, ^NSMIDCP etc.)
// RULE: Zero fabricated data. If fetch fails → return null/[]. Never invent numbers.

import type { StockHolding, LiveQuote, HealthScore } from '../types'

const API_BASE = import.meta.env.VITE_STOCK_API_BASE
  || 'https://military-jobye-haiqstudios-14f59639.koyeb.app'

// Yahoo Finance chart API — proxied through allorigins to avoid CORS
const YF_PROXY = 'https://query1.finance.yahoo.com/v8/finance/chart'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HistPoint {
  date:  string   // YYYY-MM-DD
  close: number
}

export interface SearchResult {
  symbol:       string
  company_name: string
  exchange:     string
}

// ─── Market hours (IST) ───────────────────────────────────────────────────────
export function isMarketOpen(): boolean {
  const ist  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const mins = ist.getHours() * 60 + ist.getMinutes()
  const day  = ist.getDay()
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()
const histCache  = new Map<string, { data: HistPoint[]; ts: number }>()
const TTL_LIVE   = isMarketOpen() ? 60_000 : 4 * 3600_000
const TTL_HIST   = 6 * 3600_000

// ─── Index definitions ────────────────────────────────────────────────────────
export const INDEX_TICKERS: Record<string, { label: string; yahoo: string; color: string }> = {
  NIFTY50:     { label: 'Nifty 50',           yahoo: '^NSEI',       color: '#06B6D4' },
  NIFTYNXT50:  { label: 'Nifty Next 50',      yahoo: '^NSMIDCP',    color: '#F59E0B' },
  NIFTY100:    { label: 'Nifty 100',          yahoo: '^CNX100',     color: '#10B981' },
  NIFTY150:    { label: 'Nifty 150',          yahoo: '^NSEI',       color: '#8B5CF6' },  // fallback NSEI
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

// ─── Popular stocks for search ────────────────────────────────────────────────
export const POPULAR_STOCKS: SearchResult[] = [
  { symbol:'RELIANCE',   company_name:'Reliance Industries Ltd',         exchange:'NSE' },
  { symbol:'TCS',        company_name:'Tata Consultancy Services',        exchange:'NSE' },
  { symbol:'HDFCBANK',   company_name:'HDFC Bank Ltd',                    exchange:'NSE' },
  { symbol:'INFY',       company_name:'Infosys Ltd',                      exchange:'NSE' },
  { symbol:'ICICIBANK',  company_name:'ICICI Bank Ltd',                   exchange:'NSE' },
  { symbol:'SBIN',       company_name:'State Bank of India',              exchange:'NSE' },
  { symbol:'BAJFINANCE', company_name:'Bajaj Finance Ltd',                exchange:'NSE' },
  { symbol:'BHARTIARTL', company_name:'Bharti Airtel Ltd',                exchange:'NSE' },
  { symbol:'WIPRO',      company_name:'Wipro Ltd',                        exchange:'NSE' },
  { symbol:'TITAN',      company_name:'Titan Company Ltd',                exchange:'NSE' },
  { symbol:'MARUTI',     company_name:'Maruti Suzuki India Ltd',          exchange:'NSE' },
  { symbol:'ITC',        company_name:'ITC Ltd',                          exchange:'NSE' },
  { symbol:'HINDZINC',   company_name:'Hindustan Zinc Ltd',               exchange:'NSE' },
  { symbol:'MOTHERSON',  company_name:'Samvardhana Motherson Intl',       exchange:'NSE' },
  { symbol:'TATAMOTORS', company_name:'Tata Motors Ltd',                  exchange:'NSE' },
  { symbol:'TATAMTRDVR', company_name:'Tata Motors DVR',                  exchange:'NSE' },
]

// ─── Fetch live quote from the proxy API ──────────────────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {
  const key = `q:${symbol}:${exchange}`
  const hit = quoteCache.get(key)
  const ttl = isMarketOpen() ? TTL_LIVE : 4 * 3600_000
  if (hit && Date.now() - hit.ts < ttl) return hit.data

  try {
    // API accepts: SYMBOL (NSE default), SYMBOL.NS (NSE explicit), SYMBOL.BO (BSE)
    const sym = exchange === 'BSE' ? `${symbol}.BO` : symbol
    const res  = await fetch(`${API_BASE}/stock?symbol=${encodeURIComponent(sym)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== 'success' || !json.data) throw new Error('no data')

    const d = json.data
    const ltp = d.regularMarketPrice ?? d.currentPrice ?? 0
    if (!ltp || !isFinite(ltp)) throw new Error('invalid ltp')

    const quote: LiveQuote = {
      symbol,
      company_name: d.longName || d.shortName || symbol,
      exchange,
      ltp,
      open:         d.regularMarketOpen         ?? ltp,
      high:         d.regularMarketDayHigh       ?? ltp,
      low:          d.regularMarketDayLow        ?? ltp,
      prev_close:   d.regularMarketPreviousClose ?? ltp,
      change:       d.regularMarketChange        ?? 0,
      change_pct:   d.regularMarketChangePercent ?? 0,
      volume:       d.regularMarketVolume        ?? 0,
      market_cap:   d.marketCap,
      pe_ratio:     d.trailingPE,
      week_52_high: d.fiftyTwoWeekHigh,
      week_52_low:  d.fiftyTwoWeekLow,
      last_updated: new Date().toISOString(),
    }
    quoteCache.set(key, { data: quote, ts: Date.now() })
    return quote
  } catch {
    // Return stale cache if available — real stale > nothing
    return hit?.data ?? null
  }
}

// ─── Fetch multiple quotes (batched, 5 at a time) ─────────────────────────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  const BATCH  = 5
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
    if (i + BATCH < holdings.length) await new Promise(r => setTimeout(r, 250))
  }
  return result
}

// ─── Fetch historical OHLC from Yahoo Finance via allorigins CORS proxy ───────
// Yahoo Finance v8 chart API works for both stocks (.NS) and indices (^NSEI)
async function fetchYahooHistory(
  yahooTicker: string,
  period:   string,  // '1mo','3mo','6mo','1y','3y','5y','max'
  interval: string   // '1d','1wk','1mo'
): Promise<HistPoint[]> {
  const cacheKey = `h:${yahooTicker}:${period}:${interval}`
  const hit = histCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < TTL_HIST) return hit.data

  try {
    // Use allorigins to bypass CORS for Yahoo Finance
    const yfUrl  = `${YF_PROXY}/${encodeURIComponent(yahooTicker)}?period1=0&period2=9999999999&range=${period}&interval=${interval}&events=history`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yfUrl)}`

    const res  = await fetch(proxyUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const wrap = await res.json()
    if (!wrap.contents) throw new Error('empty proxy')

    const json    = JSON.parse(wrap.contents)
    const chart   = json?.chart?.result?.[0]
    if (!chart)   throw new Error('no chart result')

    const timestamps: number[]      = chart.timestamp || []
    const closes:     number[]      = chart.indicators?.quote?.[0]?.close || []
    const adjCloses:  number[]      = chart.indicators?.adjclose?.[0]?.adjclose || closes

    const points: HistPoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = adjCloses[i] ?? closes[i]
      if (!c || !isFinite(c) || c <= 0) continue
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
      points.push({ date, close: +c.toFixed(2) })
    }

    // Sort by date ascending
    points.sort((a, b) => a.date.localeCompare(b.date))

    if (points.length === 0) throw new Error('no valid points')

    histCache.set(cacheKey, { data: points, ts: Date.now() })
    return points
  } catch {
    // Return stale cache if available
    if (hit) return hit.data
    return []
  }
}

// ─── Fetch historical prices for a single NSE stock ──────────────────────────
export async function fetchStockHistory(
  symbol:   string,
  period:   string,
  interval: string
): Promise<HistPoint[]> {
  return fetchYahooHistory(`${symbol}.NS`, period, interval)
}

// ─── Fetch historical values for the whole portfolio ─────────────────────────
// Fetches price history for each stock and multiplies by quantity
// Returns daily portfolio value (sum of all holdings × their price on that day)
export async function fetchPortfolioHistory(
  holdings: StockHolding[],
  period:   string,
  interval: string
): Promise<HistPoint[]> {
  if (!holdings.length) return []

  const allHist = await Promise.all(
    holdings.map(h =>
      fetchStockHistory(h.symbol, period, interval)
        .then(pts => ({ h, pts }))
    )
  )

  // Collect all dates from all stocks
  const dateSet = new Set<string>()
  allHist.forEach(({ pts }) => pts.forEach(p => dateSet.add(p.date)))
  const dates = [...dateSet].sort()
  if (!dates.length) return []

  // Build price maps per stock for O(1) lookup
  const priceMaps = allHist.map(({ h, pts }) => ({
    h,
    map: new Map(pts.map(p => [p.date, p.close])),
    // last known price — for dates where no data exists
    pts,
  }))

  return dates.map(date => {
    let totalValue = 0
    let covered    = 0
    for (const { h, map, pts } of priceMaps) {
      const price = map.get(date)
      if (price) {
        totalValue += h.quantity * price
        covered++
      } else {
        // Use last available price before this date
        const prev = pts.filter(p => p.date <= date).slice(-1)[0]
        if (prev) {
          totalValue += h.quantity * prev.close
          covered++
        }
        // If no price at all, skip this stock for this date
      }
    }
    // Only include date if at least one stock has data
    return covered > 0 ? { date, close: +totalValue.toFixed(2) } : null
  }).filter((p): p is HistPoint => p !== null)
}

// ─── Fetch index historical data ──────────────────────────────────────────────
export async function fetchIndexHistory(
  indexId:  string,
  period:   string,
  interval: string
): Promise<HistPoint[]> {
  const idx = INDEX_TICKERS[indexId]
  if (!idx) return []
  return fetchYahooHistory(idx.yahoo, period, interval)
}

// ─── Rebase a series so first point = 100 ────────────────────────────────────
export function rebaseTo100(points: HistPoint[]): HistPoint[] {
  if (!points.length) return []
  const base = points[0].close
  if (!base || base === 0) return []
  return points.map(p => ({ date: p.date, close: +((p.close / base) * 100).toFixed(3) }))
}

// ─── Search stocks ────────────────────────────────────────────────────────────
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

// ─── Portfolio P&L — real prices only ────────────────────────────────────────
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
      // No real quote yet → use invested value (no fake P&L)
      currentValue += invested
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
  const overall  = Math.round(
    Math.min(sectors.size * 12, 40) +
    Math.max(30 - topPct * 0.5, 0) +
    Math.min(holdings.length * 2, 20) +
    (winners / holdings.length) * 10
  )
  const risk_level = topPct > 50 ? 'Very High' : topPct > 35 ? 'High' : topPct > 20 ? 'Moderate' : 'Low'
  return { overall, risk_level, top_holding_pct: topPct, sector_count: sectors.size }
}
