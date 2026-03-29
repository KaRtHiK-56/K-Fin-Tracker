import type { StockHolding, LiveQuote } from '../types'

// ───────── TYPES ─────────
export interface HistPoint {
  date: string
  close: number
}

// ───────── NORMALIZE ─────────
function normalize(symbol: string) {
  return symbol.toUpperCase().replace(/\s+/g, '')
}

// ───────── CACHE ─────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()

// ───────── SYMBOL MAP ─────────
const SYMBOL_MAP: Record<string, string> = {
  TATAMOTORS: 'TATAMOTORS.NS',
  'TATAMOTORS-DVR': 'TATAMTRDVR.NS'
}

// ───────── HELPERS ─────────
function getPrice(d: any): number {
  return Number(
    d.regularMarketPrice ||
    d.currentPrice ||
    d.price ||
    d.lastPrice
  ) || 0
}

// ───────── REQUIRED EXPORTS (FOR UI) ─────────
export function isMarketOpen() {
  return true
}

export function clearQuoteCache() {
  quoteCache.clear()
}

export function buildStubQuote(symbol: string, exchange: 'NSE'|'BSE'): LiveQuote {
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
    last_updated: 'csv'
  }
}

// ───────── FETCH LIVE QUOTE ─────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {

  const clean = normalize(symbol)

  const ticker =
    SYMBOL_MAP[clean] ||
    (exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`)

  const cached = quoteCache.get(clean)
  if (cached && Date.now() - cached.ts < 60000) {
    return cached.data
  }

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const json = await res.json()

    const data = json.data ?? json
    const price = getPrice(data)

    if (!price || price <= 0) return cached?.data ?? null

    const quote: LiveQuote = {
      symbol: clean,
      company_name: data.longName || clean,
      exchange,
      ltp: price,
      open: price,
      high: price,
      low: price,
      prev_close: price,
      change: 0,
      change_pct: 0,
      volume: 0,
      last_updated: new Date().toISOString()
    }

    quoteCache.set(clean, { data: quote, ts: Date.now() })

    return quote
  } catch {
    return cached?.data ?? null
  }
}

// ───────── MULTIPLE QUOTES ─────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE' | 'BSE' }[]
) {
  const map = new Map<string, LiveQuote>()

  await Promise.all(
    holdings.map(async (h) => {
      const q = await fetchLiveQuote(h.symbol, h.exchange)
      if (!q) return

      const key = normalize(h.symbol)
      map.set(key, q)
    })
  )

  return map
}

// ───────── PORTFOLIO PNL ─────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let invested = 0
  let current = 0

  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    invested += inv

    const key = normalize(h.symbol)
    const q = quotes.get(key)

    if (!q || !q.ltp || q.ltp <= 0) return

    current += h.quantity * q.ltp
  })

  const pnl = current - invested

  return {
    totalInvested: invested,
    currentValue: current,
    totalPnL: pnl,
    totalPnLPct: invested ? (pnl / invested) * 100 : 0,
    dayPnL: 0,
    dayPnLPct: 0
  }
}

// ───────── DUMMY EXPORTS (TO PREVENT FUTURE CRASHES) ─────────
export const INDEX_TICKERS = {
  'NIFTY50': { symbol: '^NSEI', name: 'Nifty 50' },
  'SENSEX': { symbol: '^BSESN', name: 'Sensex' },
  'BANKNIFTY': { symbol: '^NSEBANK', name: 'Nifty Bank' }
}

export const INDEX_GROUPS = [
  { id: 'indices', name: 'Indices', items: ['NIFTY50', 'SENSEX', 'BANKNIFTY'] }
]

export const TIME_RANGES = [
  { id: '1M', label: '1 Month', days: 30 },
  { id: '3M', label: '3 Months', days: 90 },
  { id: '6M', label: '6 Months', days: 180 },
  { id: '1Y', label: '1 Year', days: 365 },
  { id: '2Y', label: '2 Years', days: 730 }
]

export async function fetchPortfolioHistory() {
  return []
}

export async function fetchIndexHistory() {
  return []
}

export async function fetchIndexInvestedValue() {
  return []
}

export function rebaseTo100() {
  return []
}
