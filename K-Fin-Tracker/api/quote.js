// Vercel serverless — Yahoo Finance historical OHLC
// /api/history?symbol=TATAMOTORS.NS&range=1y&interval=1wk

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbol, range = '1y', interval = '1wk' } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  }

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=history&includeAdjustedClose=true`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=history&includeAdjustedClose=true`,
  ]

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers })
      if (!r.ok) continue
      const data = await r.json()
      const chart = data?.chart?.result?.[0]
      if (!chart?.timestamp?.length) continue

      const ts     = chart.timestamp
      const closes = chart.indicators?.quote?.[0]?.close || []
      const adj    = chart.indicators?.adjclose?.[0]?.adjclose || closes

      const points = []
      for (let i = 0; i < ts.length; i++) {
        const c = adj[i] ?? closes[i]
        if (!c || !isFinite(c) || c <= 0) continue
        points.push({
          date:  new Date(ts[i] * 1000).toISOString().split('T')[0],
          close: +c.toFixed(2),
        })
      }
      points.sort((a, b) => a.date.localeCompare(b.date))
      if (!points.length) continue

      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600')
      return res.status(200).json({ status: 'success', data: points, symbol, range, interval })
    } catch (e) {
      console.error(`History error ${symbol}:`, e.message)
      continue
    }
  }

  return res.status(503).json({ error: 'history_unavailable', symbol })
}
