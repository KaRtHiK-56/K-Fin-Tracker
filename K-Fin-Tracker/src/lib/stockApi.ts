import type { StockHolding, LiveQuote } from '../types'

// ─── TYPES ─────────────────────────────
export interface HistPoint {
  date: string
  close: number
}

// ─── CACHE ─────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()

// ─── HELPERS ───────────────────────────
function normalize(symbol: string) {
  return symbol.toUpperCase().replace(/\s+/g, '')
}

function getPrice(obj: any): number {
  const keys = ['regularMarketPrice', 'currentPrice', 'price', 'lastPrice']
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── REQUIRED EXPORTS ──────────────────
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

// ─── LIVE QUOTE ────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {

  const clean = normalize(symbol)

  const symbolMap: Record<string,string> = {
    TATAMOTORS: 'TATAMOTORS.NS',
    'TATAMOTORS-DVR': 'TATAMTRDVR.NS'
  }

  const ticker =
    symbolMap[clean] ||
    (exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`)

  const cached = quoteCache.get(ticker)
  if (cached && Date.now() - cached.ts < 60000) {
    return cached.data
  }

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const json = await res.json()

    const data = json.data ?? json
    const price = getPrice(data)

    if (!price) return cached?.data ?? null

    const quote: LiveQuote = {
      symbol: clean,
      company_name: String(data.longName || clean),
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

    quoteCache.set(ticker, { data: quote, ts: Date.now() })

    return quote
  } catch {
    return cached?.data ?? null
  }
}

// ─── MULTI FETCH ───────────────────────
export async function fetchMultipleQuotes(
  holdings: { symbol: string; exchange: 'NSE'|'BSE' }[]
) {
  const map = new Map<string, LiveQuote>()

  await Promise.allSettled(
    holdings.map(h =>
      fetchLiveQuote(h.symbol, h.exchange).then(q => {
        if (!q) return
        const key = normalize(h.symbol)
        map.set(key, q)
      })
    )
  )

  return map
}

// ─── PNL (FIXED) ───────────────────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let totalInvested = 0
  let currentValue = 0

  holdings.forEach(h => {
    const invested = h.quantity * h.avg_buy_price
    totalInvested += invested

    const key = normalize(h.symbol)
    const q = quotes.get(key)

    if (!q || !q.ltp || q.ltp <= 0) return

    currentValue += h.quantity * q.ltp
  })

  return {
    totalInvested,
    currentValue,
    totalPnL: currentValue - totalInvested,
    totalPnLPct: totalInvested
      ? ((currentValue - totalInvested) / totalInvested) * 100
      : 0,
    dayPnL: 0,
    dayPnLPct: 0
  }
}
