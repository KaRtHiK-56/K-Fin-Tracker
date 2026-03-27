import type { StockHolding, LiveQuote } from '../types'

// ─────────────────────────────────────────
// NORMALIZATION (ROOT FIX)
// ─────────────────────────────────────────
export function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/\s+/g, '')
}

// ─────────────────────────────────────────
// SYMBOL MAPPING (TATA FIX)
// ─────────────────────────────────────────
const SYMBOL_MAP: Record<string, string> = {
  TATAMOTORS: 'TATAMOTORS.NS',
  'TATAMOTORS-DVR': 'TATAMTRDVR.NS'
}

// ─────────────────────────────────────────
// GET TICKER
// ─────────────────────────────────────────
export function getTicker(symbol: string, exchange: 'NSE' | 'BSE') {
  const clean = normalizeSymbol(symbol)
  return SYMBOL_MAP[clean] || (exchange === 'BSE'
    ? `${clean}.BO`
    : `${clean}.NS`)
}

// ─────────────────────────────────────────
// FETCH QUOTE (FIXED)
// ─────────────────────────────────────────
export async function getQuote(symbol: string, exchange: 'NSE' | 'BSE'): Promise<LiveQuote | null> {

  const clean = normalizeSymbol(symbol)
  const ticker = getTicker(clean, exchange)

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const json = await res.json()

    const d = json.data ?? json

    const price = Number(
      d.regularMarketPrice ||
      d.currentPrice ||
      d.price ||
      d.lastPrice
    )

    if (!price || price <= 0) return null

    return {
      symbol: clean,
      company_name: d.longName || clean,
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

  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// FETCH ALL QUOTES
// ─────────────────────────────────────────
export async function getAllQuotes(holdings: StockHolding[]) {
  const map = new Map<string, LiveQuote>()

  await Promise.all(
    holdings.map(async (h) => {
      const q = await getQuote(h.symbol, h.exchange)
      if (!q) return

      const key = normalizeSymbol(h.symbol)
      map.set(key, q)
    })
  )

  return map
}

// ─────────────────────────────────────────
// PORTFOLIO CALCULATION (FINAL FIX)
// ─────────────────────────────────────────
export function calculatePortfolio(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let invested = 0
  let current = 0

  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    invested += inv

    const key = normalizeSymbol(h.symbol)
    const q = quotes.get(key)

    if (!q || !q.ltp || q.ltp <= 0) return

    current += h.quantity * q.ltp
  })

  const pnl = current - invested

  return {
    invested,
    current,
    pnl,
    pnlPct: invested ? (pnl / invested) * 100 : 0
  }
}
