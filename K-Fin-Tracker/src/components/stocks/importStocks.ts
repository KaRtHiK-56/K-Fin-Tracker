// ─── Stock Import Utilities ───────────────────────────────────────────────────
// Handles CSV / Excel import from:
//   - Groww (exported holdings CSV)
//   - Zerodha Kite (tradebook / holdings CSV)
//   - Upstox (holdings CSV)
//   - Angel One (holdings CSV)
//   - Generic format (symbol, qty, avg price, date)

import type { StockHolding } from '../types'

export interface ImportResult {
  success: StockHolding[]
  errors: { row: number; reason: string; raw: string }[]
  platform: string
}

/* ── Detect which platform the CSV came from ─────────────────────────────────── */
function detectPlatform(headers: string[]): string {
  const h = headers.map(x => x.toLowerCase().trim())
  if (h.includes('symbol') && h.includes('quantity') && h.includes('average price') && h.some(x => x.includes('ltp'))) return 'Groww'
  if (h.includes('tradingsymbol') && h.includes('quantity') && h.includes('average_price')) return 'Zerodha'
  if (h.some(x => x.includes('scrip')) && h.some(x => x.includes('qty'))) return 'Upstox'
  if (h.some(x => x.includes('net qty')) && h.some(x => x.includes('avg.'))) return 'AngelOne'
  return 'Generic'
}

/* ── Column mapping per platform ─────────────────────────────────────────────── */
function getColumns(platform: string, headers: string[]): { symbolCol: number; qtyCol: number; priceCol: number; dateCol: number; nameCol: number } {
  const h = headers.map(x => x.toLowerCase().trim())
  const find = (...terms: string[]) => h.findIndex(x => terms.some(t => x.includes(t)))

  switch (platform) {
    case 'Groww':
      return { symbolCol: find('symbol'), qtyCol: find('quantity'), priceCol: find('average price'), dateCol: find('buy date', 'date'), nameCol: find('name', 'company') }
    case 'Zerodha':
      return { symbolCol: find('tradingsymbol'), qtyCol: find('quantity'), priceCol: find('average_price', 'average price'), dateCol: find('date'), nameCol: find('instrument', 'name') }
    case 'Upstox':
      return { symbolCol: find('scrip', 'symbol'), qtyCol: find('qty', 'quantity'), priceCol: find('avg', 'average'), dateCol: find('date'), nameCol: find('scrip name', 'name') }
    case 'AngelOne':
      return { symbolCol: find('symbol'), qtyCol: find('net qty', 'qty'), priceCol: find('avg.', 'average'), dateCol: find('date'), nameCol: find('company', 'name') }
    default:
      return { symbolCol: find('symbol', 'ticker', 'scrip'), qtyCol: find('qty', 'quantity', 'shares'), priceCol: find('avg', 'price', 'cost'), dateCol: find('date', 'buy'), nameCol: find('name', 'company') }
  }
}

/* ── Parse CSV text into rows ────────────────────────────────────────────────── */
function parseCSV(text: string): string[][] {
  return text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      const result: string[] = []
      let inQuote = false
      let current = ''
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === ',' && !inQuote) { result.push(current.trim()); current = '' }
        else current += ch
      }
      result.push(current.trim())
      return result
    })
}

/* ── Clean numeric values (remove ₹, commas, spaces) ──────────────────────────── */
function cleanNum(s: string): number {
  const cleaned = String(s).replace(/[₹,\s]/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

/* ── Infer sector from symbol ────────────────────────────────────────────────── */
const SECTOR_MAP: Record<string, string> = {
  TCS: 'IT', INFY: 'IT', WIPRO: 'IT', TECHM: 'IT', HCLTECH: 'IT', MPHASIS: 'IT', LTTS: 'IT',
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', KOTAKBANK: 'Banking', AXISBANK: 'Banking', BANDHANBNK: 'Banking', FEDERALBNK: 'Banking',
  RELIANCE: 'Energy', ONGC: 'Energy', BPCL: 'Energy', IOC: 'Energy', GAIL: 'Energy', PETRONET: 'Energy',
  BAJFINANCE: 'NBFC', BAJAJFINSV: 'NBFC', CHOLAFIN: 'NBFC', MUTHOOTFIN: 'NBFC',
  TITAN: 'Consumer', PIDILITIND: 'Consumer', HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG',
  MARUTI: 'Auto', TATAMOTORS: 'Auto', BAJAJ_AUTO: 'Auto', HEROMOTOCO: 'Auto', EICHERMOT: 'Auto',
  SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma', AUROPHARMA: 'Pharma',
  ULTRACEMCO: 'Cement', SHREECEM: 'Cement', AMBUJACEM: 'Cement', ACC: 'Cement',
  LT: 'Infrastructure', ADANIPORTS: 'Infrastructure', IRCTC: 'Travel', INDIGO: 'Travel',
  ADANIENT: 'Conglomerate', TATASTEEL: 'Metal', HINDALCO: 'Metal', JSWSTEEL: 'Metal',
}
function inferSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase().replace('-', '_')] || 'Other'
}

/* ── Main import function ────────────────────────────────────────────────────── */
export async function parseCSVImport(text: string, userId: string): Promise<ImportResult> {
  const rows = parseCSV(text)
  if (rows.length < 2) return { success: [], errors: [{ row: 0, reason: 'File appears empty or has only headers', raw: '' }], platform: 'Unknown' }

  const headers = rows[0]
  const platform = detectPlatform(headers)
  const cols = getColumns(platform, headers)

  const success: StockHolding[] = []
  const errors: ImportResult['errors'] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c.trim())) continue

    try {
      const rawSymbol = cols.symbolCol >= 0 ? row[cols.symbolCol] : ''
      const symbol = rawSymbol.replace(/\s+/g, '').replace(/-EQ$/i, '').replace(/\.NS$/i, '').replace(/\.BO$/i, '').toUpperCase().trim()

      if (!symbol || symbol.length < 2) { errors.push({ row: i + 1, reason: 'Could not read stock symbol', raw: row.join(',') }); continue }

      const quantity = cols.qtyCol >= 0 ? cleanNum(row[cols.qtyCol]) : 0
      const avgPrice = cols.priceCol >= 0 ? cleanNum(row[cols.priceCol]) : 0

      if (quantity <= 0) { errors.push({ row: i + 1, reason: `Invalid quantity: "${row[cols.qtyCol]}"`, raw: row.join(',') }); continue }
      if (avgPrice <= 0) { errors.push({ row: i + 1, reason: `Invalid average price: "${row[cols.priceCol]}"`, raw: row.join(',') }); continue }

      const rawDate = cols.dateCol >= 0 ? row[cols.dateCol]?.trim() : ''
      let buyDate = new Date().toISOString().split('T')[0]
      if (rawDate) {
        const parsed = new Date(rawDate)
        if (!isNaN(parsed.getTime())) buyDate = parsed.toISOString().split('T')[0]
      }

      const companyName = cols.nameCol >= 0 ? row[cols.nameCol]?.trim() : symbol

      success.push({
        id: `import-${Date.now()}-${i}`,
        user_id: userId,
        symbol,
        exchange: 'NSE',
        company_name: companyName || symbol,
        quantity,
        avg_buy_price: avgPrice,
        buy_date: buyDate,
        sector: inferSector(symbol),
        notes: `Imported from ${platform}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } catch (e) {
      errors.push({ row: i + 1, reason: 'Unexpected parse error', raw: row.join(',') })
    }
  }

  return { success, errors, platform }
}

/* ── Excel (.xlsx) parser using SheetJS loaded from CDN ─────────────────────── */
export async function parseExcelImport(file: File, userId: string): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        // Dynamically load SheetJS from CDN
        if (!(window as any).XLSX) {
          await new Promise<void>((res, rej) => {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
            script.onload = () => res()
            script.onerror = () => rej(new Error('Failed to load SheetJS'))
            document.head.appendChild(script)
          })
        }
        const XLSX = (window as any).XLSX
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const csv: string = XLSX.utils.sheet_to_csv(sheet)
        resolve(await parseCSVImport(csv, userId))
      } catch (err) {
        resolve({ success: [], errors: [{ row: 0, reason: 'Failed to read Excel file. Try exporting as CSV instead.', raw: '' }], platform: 'Excel' })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

/* ── Template CSV download ───────────────────────────────────────────────────── */
export function downloadTemplate() {
  const csv = [
    'Symbol,Company Name,Quantity,Average Price,Buy Date,Exchange',
    'RELIANCE,Reliance Industries,50,2480,2023-04-12,NSE',
    'TCS,Tata Consultancy Services,20,3820,2023-01-08,NSE',
    'HDFCBANK,HDFC Bank,35,1620,2023-06-20,NSE',
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'kfin-stocks-template.csv'
  a.click(); URL.revokeObjectURL(url)
}

/* ── Groww CSV format reference ──────────────────────────────────────────────────
  Groww exports holdings from: Portfolio → Holdings → Download (top right)
  Format: Symbol, Name, Quantity, Average Price, LTP, Current Value, P&L, P&L%

  Zerodha exports from: Console → Portfolio → Holdings → Download as CSV
  Format: Tradingsymbol, ISIN, Quantity, T1 Quantity, Average_price, Last_price, ...

  Upstox exports from: Portfolio → Holdings → Export
  Format: Scrip Name, Qty, Avg. Price, LTP, Current Value, P&L

  Generic: Any CSV with columns Symbol/Ticker, Qty/Quantity, Avg/Price/Cost
────────────────────────────────────────────────────────────────────────────── */
