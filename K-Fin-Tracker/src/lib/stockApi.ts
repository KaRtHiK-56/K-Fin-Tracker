import type { StockHolding, LiveQuote } from '../types'

// ───────── NORMALIZE (CRITICAL FIX)
function normalize(symbol: string) {
  return symbol.toUpperCase().replace(/\s+/g, '')
}

// ───────── CACHE
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()

// ───────── TATA FIX
const SYMBOL_MAP: Record<string, string> = {
  TATAMOTORS: 'TATAMOTORS.NS',
  'TATAMOTORS-DVR': 'TATAMTRDVR.NS'
}

// ───────── GET PRICE
function getPrice(d: any): number {
  return Number(
    d.regularMarketPrice ||
    d.currentPrice ||
    d.price ||
    d.lastPrice
  ) || 0
}

// ───────── REQUIRED EXPORTS (KEEP UI SAFE)
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

// ───────── FETCH QUOTE (FINAL FIX)
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

// ───────── MULTI FETCH (KEY FIX)
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

// ───────── PNL (KEY FIX)
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
