import type { StockHolding, LiveQuote } from '../types'

// ─── API ─────────────────────────────────────────
const API = ''

// ─── INDEX CONFIG ───────────────────────────────
export const INDEX_TICKERS: Record<string, string> = {
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
    ]
  }
]

export const TIME_RANGES = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: 'Max', value: 'max' },
]

// ─── TYPES ───────────────────────────────────────
export interface HistPoint {
  date: string
  close: number
}

// ─── CACHE ───────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()

export function clearQuoteCache() {
  quoteCache.clear()
}

// ─── HELPERS ─────────────────────────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── STUB QUOTE (CSV fallback) ───────────────────
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

// ─── LIVE QUOTE ──────────────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {

  const clean = symbol.toUpperCase().replace(/\s+/g, '')
  const ticker = exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const json = await res.json()

    const d = (json.data ?? json) as Record<string, unknown>

    const ltp = dig(d, 'regularMarketPrice', 'currentPrice', 'price')
    if (!ltp) return null

    return {
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

  } catch {
    return null
  }
}

// ─── MULTI FETCH ─────────────────────────────────
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

// ─── PNL ─────────────────────────────────────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let totalInvested = 0
  let currentValue = 0

  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    totalInvested += inv

    const q = quotes.get(h.symbol)

    if (q && q.ltp > 0) {
      currentValue += h.quantity * q.ltp
    } else {
      currentValue += inv
    }
  })

  return {
    totalInvested,
    currentValue,
    totalPnL: currentValue - totalInvested,
    totalPnLPct: totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0,
    dayPnL: 0,
    dayPnLPct: 0,
  }
}

// ─── DUMMY FUNCTIONS (TO PREVENT BUILD ERRORS) ───
// You can improve later — these stop crashes now

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

// dummy search + popular
export function searchStocks() { return [] }
export const POPULAR_STOCKS: any[] = []

export function computeHealthScore(): any {
  return {}
}
