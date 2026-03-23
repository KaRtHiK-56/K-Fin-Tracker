// Vercel serverless — Yahoo Finance quote via v8 chart (no crumb needed)
// /api/quote?symbol=TATAMOTORS.NS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  }

  // v8 chart with range=1d interval=1d — works without crumb, gives current price
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d&includePrePost=false`
  const chartUrl2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d&includePrePost=false`

  for (const url of [chartUrl, chartUrl2]) {
    try {
      const r = await fetch(url, { headers })
      if (!r.ok) { console.log(`chart ${r.status} for ${symbol}`); continue }
      const data = await r.json()
      const chart = data?.chart?.result?.[0]
      if (!chart) continue

      const meta   = chart.meta || {}
      const closes = chart.indicators?.quote?.[0]?.close || []
      const last   = closes.filter(v => v != null && isFinite(v)).slice(-1)[0]
      const ltp    = meta.regularMarketPrice || last
      if (!ltp || !isFinite(ltp)) continue

      const prev    = meta.previousClose || meta.chartPreviousClose || ltp
      const result  = {
        symbol,
        regularMarketPrice:         ltp,
        regularMarketOpen:          meta.regularMarketOpen          || ltp,
        regularMarketDayHigh:       meta.regularMarketDayHigh       || ltp,
        regularMarketDayLow:        meta.regularMarketDayLow        || ltp,
        regularMarketPreviousClose: prev,
        regularMarketChange:        ltp - prev,
        regularMarketChangePercent: prev > 0 ? ((ltp - prev) / prev) * 100 : 0,
        regularMarketVolume:        meta.regularMarketVolume        || 0,
        longName:                   meta.longName                   || meta.shortName || symbol,
        shortName:                  meta.shortName                  || symbol,
        fiftyTwoWeekHigh:           meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow:            meta.fiftyTwoWeekLow,
        trailingPE:                 meta.trailingPE,
        marketCap:                  meta.marketCap,
        currency:                   meta.currency || 'INR',
        exchangeName:               meta.exchangeName,
      }

      const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const mins = ist.getHours() * 60 + ist.getMinutes()
      const day = ist.getDay()
      const mktOpen = day >= 1 && day <= 5 && mins >= 555 && mins <= 930
      res.setHeader('Cache-Control', mktOpen ? 's-maxage=60, stale-while-revalidate=30' : 's-maxage=3600')

      return res.status(200).json({
        status: 'success',
        data: result,
        fetchedAt: new Date().toISOString(),
        source: 'yahoo-v8-chart',
      })
    } catch (e) {
      console.error(`Error for ${symbol}:`, e.message)
      continue
    }
  }

  return res.status(503).json({
    error: 'price_unavailable',
    symbol,
    message: 'Yahoo Finance temporarily unavailable. Using last known price.',
  })
}
