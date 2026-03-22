import type { LiveQuote, StockHolding, HealthScore } from '../types'

const API_BASE = import.meta.env.VITE_STOCK_API_BASE || 'https://military-jobye-haiqstudios-14f59639.koyeb.app'
const cache = new Map<string, { quote: LiveQuote; ts: number }>()
// TTL defined after isMarketOpen() below

export interface SearchResult {
  symbol: string
  company_name: string
  exchange: string
}

export const POPULAR_STOCKS: SearchResult[] = [
  { symbol: 'RELIANCE',   company_name: 'Reliance Industries Ltd',       exchange: 'NSE' },
  { symbol: 'TCS',        company_name: 'Tata Consultancy Services',      exchange: 'NSE' },
  { symbol: 'HDFCBANK',   company_name: 'HDFC Bank Ltd',                  exchange: 'NSE' },
  { symbol: 'INFY',       company_name: 'Infosys Ltd',                    exchange: 'NSE' },
  { symbol: 'ICICIBANK',  company_name: 'ICICI Bank Ltd',                 exchange: 'NSE' },
  { symbol: 'SBIN',       company_name: 'State Bank of India',            exchange: 'NSE' },
  { symbol: 'BAJFINANCE', company_name: 'Bajaj Finance Ltd',              exchange: 'NSE' },
  { symbol: 'BHARTIARTL', company_name: 'Bharti Airtel Ltd',              exchange: 'NSE' },
  { symbol: 'WIPRO',      company_name: 'Wipro Ltd',                      exchange: 'NSE' },
  { symbol: 'TITAN',      company_name: 'Titan Company Ltd',              exchange: 'NSE' },
  { symbol: 'MARUTI',     company_name: 'Maruti Suzuki India Ltd',        exchange: 'NSE' },
  { symbol: 'ITC',        company_name: 'ITC Ltd',                        exchange: 'NSE' },
  { symbol: 'IRCTC',      company_name: 'Indian Railway Catering',        exchange: 'NSE' },
  { symbol: 'NESTLEIND',  company_name: 'Nestle India Ltd',               exchange: 'NSE' },
  { symbol: 'ULTRACEMCO', company_name: 'UltraTech Cement Ltd',           exchange: 'NSE' },
  { symbol: 'ADANIENT',   company_name: 'Adani Enterprises Ltd',          exchange: 'NSE' },
  { symbol: 'SUNPHARMA',  company_name: 'Sun Pharmaceutical Industries',  exchange: 'NSE' },
  { symbol: 'LT',         company_name: 'Larsen & Toubro Ltd',            exchange: 'NSE' },
  { symbol: 'KOTAKBANK',  company_name: 'Kotak Mahindra Bank Ltd',        exchange: 'NSE' },
  { symbol: 'HINDUNILVR', company_name: 'Hindustan Unilever Ltd',         exchange: 'NSE' },
]

const MOCK_PRICES: Record<string, number> = {
  RELIANCE: 2910, TCS: 4150, INFY: 1720, HDFCBANK: 1890,
  TITAN: 3540, IRCTC: 890, WIPRO: 560, ITC: 480,
  BAJFINANCE: 7200, MARUTI: 11200, ADANIENT: 2640, SUNPHARMA: 1720,
  NESTLEIND: 2400, ULTRACEMCO: 9800, SBIN: 820, KOTAKBANK: 1760,
}

function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const h = ist.getHours(), m = ist.getMinutes(), d = ist.getDay()
  const mins = h * 60 + m
  // NSE trading hours: Mon–Fri 9:15 AM – 3:30 PM IST
  return d >= 1 && d <= 5 && mins >= 555 && mins <= 930
}

function mockQuote(symbol: string, exchange: 'NSE' | 'BSE'): LiveQuote {
  const base = MOCK_PRICES[symbol] || 1000
  // Only show non-zero change during market hours
  // Outside hours: show last known price with 0 change
  const open = isMarketOpen()
  return {
    symbol, company_name: symbol, exchange,
    ltp: base,
    open: base,
    high: base,
    low: base,
    prev_close: base,
    change: 0,
    change_pct: 0,
    volume: 0,
    last_updated: new Date().toISOString(),
    _isMock: true,       // flag so UI can show "market closed" indicator
  } as LiveQuote & { _isMock?: boolean }
}

export async function fetchLiveQuote(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE'): Promise<LiveQuote> {
  const key = `${symbol}.${exchange}`
  const hit = cache.get(key)
  // During market hours: 60s cache. Outside hours: 4h cache (prices don't change)
  const ttl = isMarketOpen() ? 60_000 : 4 * 3600_000
  if (hit && Date.now() - hit.ts < ttl) return hit.quote
  // If market is closed and we have ANY cached value, just return it
  if (!isMarketOpen() && hit) return hit.quote
  try {
    const ticker = exchange === 'BSE' ? `${symbol}.BO` : symbol
    const res = await fetch(`${API_BASE}/stock?symbol=${encodeURIComponent(ticker)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== 'success' || !json.data) throw new Error('bad response')
    const d = json.data
    const quote: LiveQuote = {
      symbol, company_name: d.longName || d.shortName || symbol, exchange,
      ltp: d.regularMarketPrice, open: d.regularMarketOpen,
      high: d.regularMarketDayHigh, low: d.regularMarketDayLow,
      prev_close: d.regularMarketPreviousClose,
      change: d.regularMarketChange, change_pct: d.regularMarketChangePercent,
      volume: d.regularMarketVolume, market_cap: d.marketCap,
      pe_ratio: d.trailingPE, week_52_high: d.fiftyTwoWeekHigh,
      week_52_low: d.fiftyTwoWeekLow, last_updated: new Date().toISOString(),
    }
    cache.set(key, { quote, ts: Date.now() })
    return quote
  } catch {
    return mockQuote(symbol, exchange)
  }
}

export async function fetchMultipleQuotes(holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]): Promise<Map<string, LiveQuote>> {
  const results = new Map<string, LiveQuote>()
  const BATCH = 5
  for (let i = 0; i < holdings.length; i += BATCH) {
    const batch = holdings.slice(i, i + BATCH)
    const settled = await Promise.allSettled(batch.map(h => fetchLiveQuote(h.symbol, h.exchange)))
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.set(batch[idx].symbol, r.value)
    })
    if (i + BATCH < holdings.length) await new Promise(r => setTimeout(r, 300))
  }
  return results
}

export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (query.length < 2) return []
  try {
    const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== 'success') return []
    return (json.results || []).map((r: { symbol: string; company_name?: string }) => ({
      symbol: r.symbol, company_name: r.company_name || r.symbol, exchange: 'NSE',
    }))
  } catch {
    return POPULAR_STOCKS.filter(
      s => s.symbol.toLowerCase().includes(query.toLowerCase()) ||
           s.company_name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10)
  }
}

export function computePortfolioPnL(holdings: StockHolding[], quotes: Map<string, LiveQuote>) {
  let totalInvested = 0, currentValue = 0, dayPnL = 0
  const marketOpen = isMarketOpen()
  holdings.forEach(h => {
    totalInvested += h.quantity * h.avg_buy_price
    const q = quotes.get(h.symbol)
    const ltp = q?.ltp ?? h.avg_buy_price
    currentValue += h.quantity * ltp
    // Only count day P&L when market is actually open
    dayPnL += marketOpen ? h.quantity * (q?.change ?? 0) : 0
  })
  const totalPnL = currentValue - totalInvested
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const dayPnLPct = currentValue > 0 ? (dayPnL / (currentValue - dayPnL)) * 100 : 0
  return { totalInvested, currentValue, totalPnL, totalPnLPct, dayPnL, dayPnLPct }
}

export function computeHealthScore(holdings: StockHolding[], quotes: Map<string, LiveQuote>): HealthScore {
  if (!holdings.length) return { overall: 0, risk_level: 'Low', top_holding_pct: 0, sector_count: 0 }
  const sectors = new Set(holdings.map(h => h.sector || 'Other'))
  const totalVal = holdings.reduce((s, h) => s + h.quantity * (quotes.get(h.symbol)?.ltp ?? h.avg_buy_price), 0)
  const maxVal = Math.max(...holdings.map(h => h.quantity * (quotes.get(h.symbol)?.ltp ?? h.avg_buy_price)))
  const topPct = totalVal > 0 ? (maxVal / totalVal) * 100 : 0
  const overall = Math.round(
    Math.min(sectors.size * 12, 40) +
    Math.max(30 - topPct * 0.5, 0) +
    Math.min(holdings.length * 2, 20) +
    (holdings.filter(h => (quotes.get(h.symbol)?.change_pct ?? 0) >= 0).length / holdings.length) * 10
  )
  const risk_level = topPct > 50 ? 'Very High' : topPct > 35 ? 'High' : topPct > 20 ? 'Moderate' : 'Low'
  return { overall, risk_level, top_holding_pct: topPct, sector_count: sectors.size }
}

export { isMarketOpen }
