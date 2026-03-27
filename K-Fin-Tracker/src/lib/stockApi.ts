import type { StockHolding, LiveQuote } from '../types'

// ─── TYPES ───────────────────────────────────────
export interface HistPoint {
  date: string
  close: number
}

// ─── CACHE ───────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()

// ─── BASIC HELPERS ───────────────────────────────
function getValidNumber(...vals: any[]): number {
  for (const v of vals) {
    const n = Number(v)
    if (isFinite(n) && n > 0) return n
  }
  return 0
}

// ─── REQUIRED EXPORTS (ALL USED BY UI) ───────────

// 🔹 MARKET STATUS
export function isMarketOpen(): boolean {
  return true
}

// 🔹 CLEAR CACHE
export function clearQuoteCache() {
  quoteCache.clear()
}

// 🔹 STUB QUOTE (CSV LOAD)
export function buildStubQuote(symbol: string, exchange: 'NSE' | 'BSE'): LiveQuote {
  return {
    symbol,
    company_name: symbol,
    exchange,
    ltp: 0,
    open: 0,
    high: 0,
    low: 0,
    prev_close: 0,
    change: 0,
    change_pct: 0,
    volume: 0,
    last_updated: 'csv',
  }
}

// 🔹 INDEX CONFIG (for UI)
export const INDEX_TICKERS = {
  NIFTY50: '^NSEI',
  SENSEX: '^BSESN',
  BANKNIFTY: '^NSEBANK',
}

export const INDEX_GROUPS = [
  {
    label: 'Main Indices',
    options: [
      { label: 'Nifty 50', value: 'NIFTY50' },
      { label: 'Sensex', value: 'SENSEX' },
      { label: 'Bank Nifty', value: 'BANKNIFTY' },
    ],
  },
]

export const TIME_RANGES = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: 'Max', value: 'max' },
]

// 🔹 LIVE QUOTE
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {

  const clean = symbol.toUpperCase().replace(/\s+/g, '')

  // FIXED symbol mapping (Tata Motors issue)
  const symbolMap: Record<string, string> = {
    TATAMOTORS: 'TATAMOTORS.NS',
    'TATAMOTORS-DVR': 'TATAMTRDVR.NS',
  }

  const ticker =
    symbolMap[clean] ||
    (exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`)

  const cacheKey = `${ticker}`
  const cached = quoteCache.get(cacheKey)

  if (cached && Date.now() - cached.ts < 60000) {
    return cached.data
  }

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const json = await res.json()

    const d = (json.data ?? json) as Record<string, unknown>

    const ltp = getValidNumber(
      d.regularMarketPrice,
      d.currentPrice,
      d.price,
      d.lastPrice
    )

    if (!ltp) return cached?.data ?? null

    const quote: LiveQuote = {
      symbol: clean,
      company_name: String(d.longName || clean),
      exchange,
      ltp,
      open: ltp,
      high: ltp,
      low: ltp,
      prev_close: ltp,
      change: 0,
      change_pct: 0,
      volume: 0,
      last_updated: new Date().toISOString(),
    }

    quoteCache.set(cacheKey, { data: quote, ts: Date.now() })

    return quote
  } catch {
    return cached?.data ?? null
  }
}

// 🔹 MULTI FETCH
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

// 🔹 PORTFOLIO PNL (CORRECTED)
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let totalInvested = 0
  let currentValue = 0

  holdings.forEach(h => {
    const invested = h.quantity * h.avg_buy_price
    totalInvested += invested

    const q = quotes.get(h.symbol)

    if (!q || !isFinite(q.ltp) || q.ltp <= 0) {
      return // skip invalid
    }

    currentValue += h.quantity * q.ltp
  })

  const totalPnL = currentValue - totalInvested

  return {
    totalInvested,
    currentValue,
    totalPnL,
    totalPnLPct:
      totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0,
    dayPnL: 0,
    dayPnLPct: 0,
  }
}

// 🔹 SAFE DUMMIES (to avoid crashes)
export function searchStocks() { return [] }
export const POPULAR_STOCKS: any[] = []

export async function fetchPortfolioHistory(): Promise<HistPoint[]> {
  return []
}

export async function fetchIndexHistory(): Promise<HistPoint[]> {
  return []
}

export async function fetchIndexInvestedValue(): Promise<HistPoint[]> {
  return []
}

export function rebaseTo100(data: HistPoint[]): HistPoint[] {
  if (!data.length) return data
  const base = data[0].close || 1
  return data.map(d => ({ ...d, close: (d.close / base) * 100 }))
}

export function computeHealthScore() {
  return {}
}
