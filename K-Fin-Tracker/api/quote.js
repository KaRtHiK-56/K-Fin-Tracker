// Vercel serverless function — fetches stock quote from Yahoo Finance
// Server-side = no CORS issues, no proxy needed
// Path: /api/quote?symbol=TATAMOTORS.NS

export default async function handler(req, res) {
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  // Try both Yahoo Finance endpoints
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,regularMarketVolume,longName,shortName,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,marketCap`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,regularMarketVolume,longName,shortName,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,marketCap`,
  ]

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!r.ok) continue
      const data = await r.json()
      const result = data?.quoteResponse?.result?.[0]
      if (!result) continue
      
      // Add cache headers — 1 min during market, 1h outside
      const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const mins = ist.getHours() * 60 + ist.getMinutes()
      const day = ist.getDay()
      const marketOpen = day >= 1 && day <= 5 && mins >= 555 && mins <= 930
      res.setHeader('Cache-Control', marketOpen ? 's-maxage=60' : 's-maxage=3600')
      res.setHeader('Access-Control-Allow-Origin', '*')
      
      return res.status(200).json({ status: 'success', data: result, fetchedAt: new Date().toISOString() })
    } catch (e) {
      continue
    }
  }
  
  return res.status(503).json({ error: 'All Yahoo Finance endpoints failed', symbol })
}
