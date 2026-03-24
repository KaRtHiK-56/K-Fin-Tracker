// Vercel serverless — calls the 0xramm Koyeb NSE API server-to-server
// Response fields: last_price, change, percent_change, open, day_high, day_low,
//                  previous_close, volume, year_high, year_low, pe_ratio, market_cap

const KOYEB = 'https://military-jobye-haiqstudios-14f59639.koyeb.app'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  // Try the Koyeb API first (purpose-built for NSE/BSE, most reliable field names)
  try {
    const r = await fetch(`${KOYEB}/stock?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'KFinTracker/1.0' },
    })
    if (r.ok) {
      const json = await r.json()
      if (json.status === 'success' && json.data?.last_price) {
        const d = json.data
        const ltp  = Number(d.last_price)
        const prev = Number(d.previous_close) || ltp
        const result = {
          // Normalise to our standard field names
          regularMarketPrice:         ltp,
          regularMarketOpen:          Number(d.open)      || ltp,
          regularMarketDayHigh:       Number(d.day_high)  || ltp,
          regularMarketDayLow:        Number(d.day_low)   || ltp,
          regularMarketPreviousClose: prev,
          regularMarketChange:        Number(d.change)    || (ltp - prev),
          regularMarketChangePercent: Number(d.percent_change) || 0,
          regularMarketVolume:        Number(d.volume)    || 0,
          longName:    d.company_name || symbol,
          shortName:   d.company_name || symbol,
          fiftyTwoWeekHigh: d.year_high  ? Number(d.year_high)  : undefined,
          fiftyTwoWeekLow:  d.year_low   ? Number(d.year_low)   : undefined,
          trailingPE:       d.pe_ratio   ? Number(d.pe_ratio)   : undefined,
          marketCap:        d.market_cap ? Number(d.market_cap) : undefined,
          fetchedAt:        d.timestamp  || new Date().toISOString(),
          source:           'koyeb-nse',
        }
        const ist     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
        const mins    = ist.getHours() * 60 + ist.getMinutes()
        const mktOpen = ist.getDay() >= 1 && ist.getDay() <= 5 && mins >= 555 && mins <= 930
        res.setHeader('Cache-Control', mktOpen ? 's-maxage=60' : 's-maxage=3600')
        return res.status(200).json({ status: 'success', data: result })
      }
    }
  } catch (e) {
    console.error('[koyeb] error:', e.message)
  }

  // Fallback: Yahoo Finance v8 chart (doesn't need auth, uses chart metadata)
  const yticker = symbol.includes('.') ? symbol : `${symbol}.NS`
  const yfUrls  = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yticker)}?range=2d&interval=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yticker)}?range=2d&interval=1d`,
  ]
  for (const url of yfUrls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com',
        },
      })
      if (!r.ok) continue
      const json  = await r.json()
      const chart = json?.chart?.result?.[0]
      if (!chart) continue
      const meta   = chart.meta || {}
      const closes = (chart.indicators?.quote?.[0]?.close || []).filter(v => v != null && isFinite(v))
      const ltp    = meta.regularMarketPrice || closes.slice(-1)[0]
      if (!ltp || !isFinite(ltp)) continue
      const prev   = meta.previousClose || meta.chartPreviousClose || ltp
      const result = {
        regularMarketPrice:         ltp,
        regularMarketOpen:          meta.regularMarketOpen    || ltp,
        regularMarketDayHigh:       meta.regularMarketDayHigh || ltp,
        regularMarketDayLow:        meta.regularMarketDayLow  || ltp,
        regularMarketPreviousClose: prev,
        regularMarketChange:        ltp - prev,
        regularMarketChangePercent: prev > 0 ? ((ltp - prev) / prev) * 100 : 0,
        regularMarketVolume:        meta.regularMarketVolume  || 0,
        longName:         meta.longName || meta.shortName || symbol,
        shortName:        meta.shortName || symbol,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow:  meta.fiftyTwoWeekLow,
        trailingPE:       meta.trailingPE,
        marketCap:        meta.marketCap,
        fetchedAt:        new Date().toISOString(),
        source:           'yahoo-v8',
      }
      res.setHeader('Cache-Control', 's-maxage=60')
      return res.status(200).json({ status: 'success', data: result })
    } catch (e) {
      continue
    }
  }

  return res.status(503).json({
    error: 'price_unavailable',
    symbol,
    message: 'All price sources temporarily unavailable',
  })
}
