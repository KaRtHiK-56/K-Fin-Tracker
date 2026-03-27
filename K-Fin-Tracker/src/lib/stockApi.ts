import type { StockHolding, LiveQuote, HealthScore } from '../types'

// API base
const API = ''

export interface HistPoint {
  date: string
  close: number
}

// ─── Market hours ─────────────────────────────────
export function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const mins = ist.getHours() * 60 + ist.getMinutes()
  const day = ist.getDay()
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930
}

// ─── Cache ────────────────────────────────────────
const quoteCache = new Map<string, { data: LiveQuote; ts: number }>()
const QUOTE_TTL = () => isMarketOpen() ? 60000 : 4 * 3600_000

// ─── Helper ───────────────────────────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(obj[k])
    if (isFinite(v) && v > 0) return v
  }
  return 0
}

// ─── Parse Yahoo Data ─────────────────────────────
function parseYF(d: Record<string, unknown>, symbol: string, exchange: 'NSE'|'BSE'): LiveQuote | null {
  const ltp = dig(d, 'regularMarketPrice', 'currentPrice', 'price', 'lastPrice')
  if (!ltp) return null

  const prev = dig(d, 'regularMarketPreviousClose', 'previousClose') || ltp
  const chg = ltp - prev
  const chgP = prev > 0 ? (chg / prev) * 100 : 0

  return {
    symbol,
    company_name: String(d.longName || symbol),
    exchange,
    ltp: +ltp.toFixed(2),
    open: ltp,
    high: ltp,
    low: ltp,
    prev_close: prev,
    change: +chg.toFixed(2),
    change_pct: +chgP.toFixed(2),
    volume: 0,
    last_updated: new Date().toISOString(),
  }
}

// ─── HISTORY FETCH ────────────────────────────────
async function fetchHistory(ticker: string): Promise<HistPoint[]> {
  try {
    const res = await fetch(`/api/history?symbol=${ticker}&range=1mo&interval=1d`)
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
}

// ─── FIXED LIVE QUOTE ─────────────────────────────
export async function fetchLiveQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE' = 'NSE'
): Promise<LiveQuote | null> {

  const cleanSymbol = symbol.toUpperCase().replace(/\s+/g, '')

  const key = `q:${cleanSymbol}:${exchange}`
  const hit = quoteCache.get(key)

  if (hit && Date.now() - hit.ts < QUOTE_TTL() && hit.data.last_updated !== 'csv') {
    return hit.data
  }

  const ticker = exchange === 'BSE'
    ? `${cleanSymbol}.BO`
    : `${cleanSymbol}.NS`

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`)

    if (!res.ok) throw new Error()

    const json = await res.json()

    // ✅ FIX: handle price_unavailable
    if (json.error === 'price_unavailable') {
      const hist = await fetchHistory(ticker)
      const last = hist.at(-1)?.close

      if (last) {
        return {
          symbol: cleanSymbol,
          company_name: cleanSymbol,
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
      }

      return hit?.data ?? null
    }

    if (json.error) throw new Error()

    const d = (json.data ?? json) as Record<string, unknown>

    let q = parseYF(d, cleanSymbol, exchange)

    // ✅ FIX: fallback if 0 price
    if (!q || q.ltp === 0) {
      const hist = await fetchHistory(ticker)
      const last = hist.at(-1)?.close

      if (!last) return hit?.data ?? null

      q = {
        symbol: cleanSymbol,
        company_name: cleanSymbol,
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
    }

    quoteCache.set(key, { data: q, ts: Date.now() })

    return q

  } catch {
    return hit?.data ?? null
  }
}

// ─── MULTI QUOTES ────────────────────────────────
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

// ─── FIXED PNL ───────────────────────────────────
export function computePortfolioPnL(
  holdings: StockHolding[],
  quotes: Map<string, LiveQuote>
) {
  let totalInvested = 0
  let currentValue = 0
  let dayPnL = 0

  const marketOpen = isMarketOpen()

  holdings.forEach(h => {
    const inv = h.quantity * h.avg_buy_price
    totalInvested += inv

    const q = quotes.get(h.symbol)

    // ✅ FIX: accept ANY valid quote
    const hasQuote = q && isFinite(q.ltp) && q.ltp > 0

    if (hasQuote && q) {
      currentValue += h.quantity * q.ltp

      if (marketOpen && isFinite(q.change)) {
        dayPnL += h.quantity * q.change
      }
    } else {
      currentValue += inv
    }
  })

  const totalPnL = currentValue - totalInvested
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  return {
    totalInvested,
    currentValue,
    totalPnL,
    totalPnLPct,
    dayPnL,
    dayPnLPct: 0,
  }
}
